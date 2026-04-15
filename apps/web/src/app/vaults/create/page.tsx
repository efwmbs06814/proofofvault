'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatUnits, isAddress, parseUnits, type Address } from 'viem';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Loading } from '@/components/ui/Loading';
import { Logo } from '@/components/ui/Logo';
import { ConnectButton, useWallet } from '@/components/ui/Wallet';
import { useToast } from '@/components/ui/Toast';
import { createVault } from '@/lib/api/vault';
import { storePayload } from '@/lib/api/runtime';
import type { RuntimeCollateralToken } from '@/lib/api/runtime';
import {
  X_LAYER_CHAIN_ID,
  createVaultRequestOnchain,
  readProtocolTreasuryConfig,
  proofOfVaultContractConfig,
  resolveProofOfVaultRuntimeConfig
} from '@/lib/contracts/proofOfVault';

type TemplateType = 'fdv' | 'price' | 'tvl' | 'custom';

type FormData = {
  title: string;
  description: string;
  template: TemplateType;
  threshold: string;
  condition: 'above' | 'below';
  customRule: string;
  collateralToken: string;
  collateralAmount: string;
  setupDepositAmount: string;
  settlementDate: string;
  settlementTime: string;
  metadataURI: string;
};

const TEMPLATE_OPTIONS = [
  { value: 'fdv', label: 'FDV check' },
  { value: 'price', label: 'Token price check' },
  { value: 'tvl', label: 'TVL check' },
  { value: 'custom', label: 'Custom rule' }
];

const CONDITION_OPTIONS = [
  { value: 'above', label: 'Above threshold' },
  { value: 'below', label: 'Below threshold' }
];

const MONTH_OPTIONS = [
  { value: '01', label: 'January' },
  { value: '02', label: 'February' },
  { value: '03', label: 'March' },
  { value: '04', label: 'April' },
  { value: '05', label: 'May' },
  { value: '06', label: 'June' },
  { value: '07', label: 'July' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' }
];

const MIN_SETUP_DEPOSIT_OKB = '0.00001';

const INITIAL_FORM: FormData = {
  title: '',
  description: '',
  template: 'fdv',
  threshold: '1000000',
  condition: 'above',
  customRule: '',
  collateralToken: '',
  collateralAmount: '1',
  setupDepositAmount: MIN_SETUP_DEPOSIT_OKB,
  settlementDate: '',
  settlementTime: '',
  metadataURI: ''
};

function buildCriteria(formData: FormData): string[] {
  if (formData.template === 'custom') {
    return [formData.customRule.trim()].filter(Boolean);
  }

  const metric = formData.template === 'fdv' ? 'FDV' : formData.template === 'price' ? 'token price' : 'TVL';
  return [
    `${metric} must be ${formData.condition} ${formData.threshold} at settlement time.`,
    'Agents must use the finalized rule-set payload and trusted source policy before resolution.',
    'If required market data is unavailable or contradictory, validators should choose INVALID.'
  ];
}

function settlementTimeMs(formData: FormData): number {
  const [year, month, day] = formData.settlementDate.split('-').map((value) => Number.parseInt(value, 10));
  const [hour, minute] = formData.settlementTime.split(':').map((value) => Number.parseInt(value, 10));

  return Date.UTC(year, month - 1, day, hour, minute, 0);
}

function buildStatement(formData: FormData): string {
  const criteria = buildCriteria(formData);
  return [formData.title, formData.description, ...criteria].filter(Boolean).join('. ');
}

function parseCollateralCap(token: RuntimeCollateralToken): bigint | null {
  try {
    return BigInt(token.cap);
  } catch {
    return null;
  }
}

function formatCollateralCap(token: RuntimeCollateralToken): string {
  const cap = parseCollateralCap(token);
  return cap === null ? 'invalid cap' : formatUnits(cap, token.decimals);
}

function formatNetworkLabel(chainId: number): string {
  return chainId === 196 ? 'X Layer mainnet' : `X Layer chain ${chainId}`;
}

function currentUtcYear(): number {
  return new Date().getUTCFullYear();
}

function daysInUtcMonth(year: string, month: string): number {
  const parsedYear = Number.parseInt(year, 10);
  const parsedMonth = Number.parseInt(month, 10);

  if (!Number.isInteger(parsedYear) || !Number.isInteger(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) {
    return 31;
  }

  return new Date(Date.UTC(parsedYear, parsedMonth, 0)).getUTCDate();
}

function parseSettlementDateParts(date: string): { year: string; month: string; day: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  return {
    year: match?.[1] ?? '',
    month: match?.[2] ?? '',
    day: match?.[3] ?? ''
  };
}

function buildSettlementDate(parts: { year: string; month: string; day: string }): string {
  return parts.year && parts.month && parts.day ? `${parts.year}-${parts.month}-${parts.day}` : '';
}

function formatUtcSettlement(timestampMs: number | null): string {
  if (timestampMs === null || Number.isNaN(timestampMs)) {
    return 'Not set';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
    timeZoneName: 'short'
  }).format(new Date(timestampMs));
}

export default function CreateVaultPage() {
  const router = useRouter();
  const wallet = useWallet();
  const { success, error: showError } = useToast();
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM);
  const [settlementDateParts, setSettlementDateParts] = useState(() =>
    parseSettlementDateParts(INITIAL_FORM.settlementDate)
  );
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState('');
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);
  const [runtimeConfig, setRuntimeConfig] = useState<Awaited<ReturnType<typeof resolveProofOfVaultRuntimeConfig>> | null>(null);
  const [protocolTreasuryAddress, setProtocolTreasuryAddress] = useState<Address | null>(null);

  useEffect(() => {
    let mounted = true;
    resolveProofOfVaultRuntimeConfig()
      .then((runtime) => {
        if (!mounted) {
          return;
        }
        setRuntimeConfig(runtime);
        if (runtime.defaultCollateralToken?.address) {
          setFormData((previous) => ({
            ...previous,
            collateralToken: previous.collateralToken || runtime.defaultCollateralToken!.address
          }));
        }
      })
      .catch((err) => {
        console.error('Failed to load runtime config:', err);
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    readProtocolTreasuryConfig()
      .then((config) => {
        if (mounted) {
          setProtocolTreasuryAddress(config.treasuryAddress);
        }
      })
      .catch((err) => {
        console.error('Failed to load protocol treasury config:', err);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const criteria = useMemo(() => buildCriteria(formData), [formData]);
  const allowedCollateralTokens = useMemo(
    () => (runtimeConfig?.allowedCollateralTokens ?? []).filter((token) => token.enabled),
    [runtimeConfig]
  );
  const selectedCollateralToken = useMemo(
    () =>
      allowedCollateralTokens.find(
        (token) => token.address.toLowerCase() === formData.collateralToken.toLowerCase()
      ),
    [allowedCollateralTokens, formData.collateralToken]
  );
  const collateralOptions = useMemo(
    () => [
      {
        value: '',
        label: runtimeConfig ? 'Select an allowlisted collateral token' : 'Loading allowlisted collateral tokens...'
      },
      ...allowedCollateralTokens.map((token) => ({
        value: token.address,
        label: `${token.symbol} | cap ${formatCollateralCap(token)}`
      }))
    ],
    [allowedCollateralTokens, runtimeConfig]
  );
  const selectedCollateralCap = useMemo(
    () => (selectedCollateralToken ? formatCollateralCap(selectedCollateralToken) : null),
    [selectedCollateralToken]
  );
  const settlementYearOptions = useMemo(() => {
    const startYear = currentUtcYear();
    return [
      { value: '', label: 'Year' },
      ...Array.from({ length: 8 }, (_, index) => {
        const year = String(startYear + index);
        return { value: year, label: year };
      })
    ];
  }, []);
  const settlementDayOptions = useMemo(() => {
    const dayCount = daysInUtcMonth(settlementDateParts.year, settlementDateParts.month);
    return [
      { value: '', label: 'Day' },
      ...Array.from({ length: dayCount }, (_, index) => {
        const day = String(index + 1).padStart(2, '0');
        return { value: day, label: String(index + 1) };
      })
    ];
  }, [settlementDateParts.month, settlementDateParts.year]);
  const settlementAt = useMemo(() => {
    if (!formData.settlementDate || !formData.settlementTime) {
      return null;
    }

    return settlementTimeMs(formData);
  }, [formData]);
  const networkLabel = useMemo(
    () => formatNetworkLabel(runtimeConfig?.chainId ?? X_LAYER_CHAIN_ID),
    [runtimeConfig]
  );
  const collateralCapExceeded = useMemo(() => {
    if (!selectedCollateralToken || !formData.collateralAmount || Number(formData.collateralAmount) <= 0) {
      return false;
    }

    try {
      const collateralCap = parseCollateralCap(selectedCollateralToken);
      return collateralCap !== null && parseUnits(formData.collateralAmount, selectedCollateralToken.decimals) > collateralCap;
    } catch {
      return false;
    }
  }, [formData.collateralAmount, selectedCollateralToken]);
  const createBlockerReason = useMemo(() => {
    const requiredChainId = runtimeConfig?.chainId ?? X_LAYER_CHAIN_ID;

    if (!wallet.isConnected) {
      return 'Connect the setter wallet first.';
    }
    if (!runtimeConfig) {
      return 'Runtime config is still loading.';
    }
    if (!selectedCollateralToken) {
      return 'Select an allowlisted collateral token.';
    }
    if (wallet.address && protocolTreasuryAddress && wallet.address.toLowerCase() === protocolTreasuryAddress.toLowerCase()) {
      return `Connected wallet is the protocol treasury ${protocolTreasuryAddress}. Use a different setter wallet to avoid an accept + fund failure later.`;
    }
    if (wallet.chainId !== requiredChainId) {
      return `Switch wallet to ${networkLabel} (chainId ${requiredChainId}) first.`;
    }
    if (collateralCapExceeded) {
      return `Reduce collateral to ${selectedCollateralCap} ${selectedCollateralToken.symbol} or less.`;
    }

    return null;
  }, [
    collateralCapExceeded,
    networkLabel,
    protocolTreasuryAddress,
    runtimeConfig,
    selectedCollateralCap,
    selectedCollateralToken,
    wallet.address,
    wallet.chainId,
    wallet.isConnected
  ]);

  const updateField = useCallback(<K extends keyof FormData>(key: K, value: FormData[K]) => {
    setFormData((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => ({ ...previous, [key]: undefined }));
  }, []);

  const updateSettlementDatePart = useCallback((part: 'year' | 'month' | 'day', value: string) => {
    const nextParts = {
      ...settlementDateParts,
      [part]: value
    };
    const maxDay = daysInUtcMonth(nextParts.year, nextParts.month);
    if (nextParts.day && Number.parseInt(nextParts.day, 10) > maxDay) {
      nextParts.day = String(maxDay).padStart(2, '0');
    }

    setSettlementDateParts(nextParts);
    setFormData((previous) => ({
      ...previous,
      settlementDate: buildSettlementDate(nextParts)
    }));
    setErrors((previous) => ({ ...previous, settlementDate: undefined }));
  }, [settlementDateParts]);

  const validate = useCallback(() => {
    const nextErrors: Partial<Record<keyof FormData, string>> = {};

    if (!formData.title.trim()) {
      nextErrors.title = 'Vault title is required.';
    }
    if (!formData.description.trim()) {
      nextErrors.description = 'Natural-language event description is required.';
    }
    if (formData.template === 'custom') {
      if (!formData.customRule.trim()) {
        nextErrors.customRule = 'Custom rule is required.';
      }
    } else if (!formData.threshold || Number(formData.threshold) <= 0) {
      nextErrors.threshold = 'Threshold must be a positive number.';
    }
    if (!runtimeConfig) {
      nextErrors.collateralToken = 'Runtime config is still loading.';
    } else if (allowedCollateralTokens.length === 0) {
      nextErrors.collateralToken = 'No allowlisted collateral tokens are configured.';
    } else if (!isAddress(formData.collateralToken)) {
      nextErrors.collateralToken = 'Select an allowlisted collateral token.';
    } else if (!selectedCollateralToken) {
      nextErrors.collateralToken = 'Collateral token must be selected from the allowlist.';
    }
    if (!formData.collateralAmount || Number(formData.collateralAmount) <= 0) {
      nextErrors.collateralAmount = 'Collateral amount must be positive.';
    } else if (selectedCollateralToken) {
      try {
        const collateralCap = parseCollateralCap(selectedCollateralToken);
        if (collateralCap === null) {
          nextErrors.collateralToken = 'Runtime collateral cap is invalid. Ask the operator to fix runtime-config.';
          setErrors(nextErrors);
          return false;
        }
        const requestedAmount = parseUnits(formData.collateralAmount, selectedCollateralToken.decimals);
        if (requestedAmount > collateralCap) {
          nextErrors.collateralAmount = `Collateral exceeds the ${selectedCollateralToken.symbol} beta cap.`;
        }
      } catch {
        nextErrors.collateralAmount = 'Collateral amount is invalid for the selected token decimals.';
      }
    }
    if (!formData.setupDepositAmount || Number(formData.setupDepositAmount) < Number(MIN_SETUP_DEPOSIT_OKB)) {
      nextErrors.setupDepositAmount = `Setup deposit must be at least ${MIN_SETUP_DEPOSIT_OKB} OKB.`;
    } else {
      try {
        parseUnits(formData.setupDepositAmount, 18);
      } catch {
        nextErrors.setupDepositAmount = 'Setup deposit amount is invalid.';
      }
    }
    if (!formData.settlementDate) {
      nextErrors.settlementDate = 'Settlement date is required.';
    }
    if (!formData.settlementTime) {
      nextErrors.settlementTime = 'Settlement time is required and must be entered in UTC.';
    }
    if (settlementAt !== null && Number.isNaN(settlementAt)) {
      nextErrors.settlementDate = 'Settlement date or UTC time is invalid.';
    }
    if (settlementAt !== null && !Number.isNaN(settlementAt) && settlementAt <= Date.now()) {
      nextErrors.settlementDate = 'Settlement time must be in the future in UTC.';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }, [allowedCollateralTokens, formData, runtimeConfig, selectedCollateralToken, settlementAt]);

  const handleSubmit = useCallback(async () => {
    if (!validate()) {
      return;
    }
    if (!wallet.isConnected || !wallet.address) {
      showError('Connect the setter wallet first.');
      return;
    }
    if (!runtimeConfig || !selectedCollateralToken) {
      showError('Runtime config is not ready or no allowlisted collateral token is selected.');
      return;
    }
    const requiredChainId = runtimeConfig?.chainId ?? X_LAYER_CHAIN_ID;
    if (wallet.chainId !== requiredChainId) {
      showError(`Switch to ${formatNetworkLabel(requiredChainId)} chainId ${requiredChainId} first.`);
      return;
    }
    if (settlementAt === null) {
      showError('Settlement time is missing.');
      return;
    }

    setIsSubmitting(true);
    setProgress('Preparing metadata before the OKB payment transaction...');
    setLastTxHash(null);

    try {
      setProgress('Requesting wallet signature to upload vault metadata...');
      const metadataURI =
        formData.metadataURI.trim() ||
        (
          await storePayload({
            kind: 'vault_request',
            walletAddress: wallet.address,
            payload: {
              title: formData.title.trim(),
              description: formData.description.trim(),
              statement: buildStatement(formData),
              criteria,
              setter: wallet.address,
              collateralToken: formData.collateralToken,
              collateralAmount: formData.collateralAmount,
              setupDepositAmount: formData.setupDepositAmount,
              settlementTime: settlementAt,
              createdAt: new Date().toISOString(),
              version: 1
            }
          })
        ).payloadURI;
      setProgress('Opening wallet payment transaction for the native OKB setup deposit...');
      const onchain = await createVaultRequestOnchain({
        collateralToken: formData.collateralToken as Address,
        collateralAmount: formData.collateralAmount,
        setupDepositAmount: formData.setupDepositAmount,
        settlementTimeMs: settlementAt,
        metadataURI,
        expectedSetter: wallet.address as Address
      });

      setProgress(`Vault request created on-chain in tx ${onchain.txHash}. Registering workflow record...`);
      setLastTxHash(onchain.txHash);

      const vault = await createVault({
        mode: 'register_onchain',
        externalVaultId: onchain.vaultId,
        chainId: requiredChainId,
        setter: onchain.setter,
        title: formData.title.trim(),
        description: formData.description.trim(),
        criteria,
        stakeAmount: onchain.grossCollateralAmount,
        collateralToken: formData.collateralToken,
        collateralDecimals: onchain.collateralDecimals,
        grossCollateralAmount: onchain.grossCollateralAmount,
        settlementTime: settlementAt,
        metadataURI,
        transactionHash: onchain.txHash
      });

      success(`Vault #${onchain.vaultId} is live on ${networkLabel}. Setup deposit: ${onchain.setupDepositDisplay} OKB.`);
      router.push(`/vaults/${vault.id}`);
    } catch (err) {
      console.error('Create vault failed:', err);
      showError(err instanceof Error ? err.message : 'Failed to create vault.');
      setProgress('');
    } finally {
      setIsSubmitting(false);
    }
  }, [criteria, formData, networkLabel, router, runtimeConfig, selectedCollateralToken, settlementAt, showError, success, validate, wallet]);

  return (
    <main className="min-h-screen bg-black text-white font-mono">
      {isSubmitting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 px-4">
          <div className="max-w-xl w-full border border-matrix-green bg-black p-8 text-center">
            <Loading size="lg" text="CREATING REAL ON-CHAIN VAULT..." />
            {progress && <p className="mt-6 text-sm text-matrix-dim break-all">{progress}</p>}
            {lastTxHash && (
              <a
                href={`${runtimeConfig?.explorerUrl ?? 'https://www.oklink.com/xlayer'}/tx/${lastTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-block text-sm text-matrix-green hover:text-white"
              >
                VIEW TRANSACTION
              </a>
            )}
          </div>
        </div>
      )}

      <header className="sticky top-0 z-40 border-b border-matrix-dark bg-black/90 backdrop-blur-xl">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <Logo size={36} variant="image" color="white" />
            <span className="font-mono text-xl md:text-2xl font-bold text-white">PROOF OF VAULT</span>
          </Link>
          <nav className="flex items-center gap-6 text-sm">
            <Link href="/vaults" className="text-matrix-dim hover:text-matrix-green transition-colors">
              [ BROWSE_VAULTS ]
            </Link>
            <ConnectButton />
          </nav>
        </div>
      </header>

      <section className="container mx-auto max-w-5xl px-4 py-10">
        <div className="mb-8 text-center">
          <Badge variant="success" size="sm">
            LIVE X LAYER MODE
          </Badge>
          <h1 className="mt-4 text-3xl md:text-5xl font-bold text-matrix-green" style={{ textShadow: '0 0 18px rgba(0,255,65,0.45)' }}>
            CREATE REAL VAULT
          </h1>
          <p className="mt-3 text-sm text-matrix-dim">
            This form sends real wallet transactions to the deployed VaultFactory on {networkLabel}.
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <Card className="border-matrix-green">
              <CardHeader>
                <CardTitle icon={<span>{'//'}</span>}>EVENT</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-5">
                  <Input
                    label="VAULT TITLE"
                    value={formData.title}
                    onChange={(event) => updateField('title', event.target.value)}
                    placeholder="ABC public sale FDV verification"
                    error={errors.title}
                    required
                  />
                  <Textarea
                    label="NATURAL LANGUAGE CLAIM"
                    value={formData.description}
                    onChange={(event) => updateField('description', event.target.value)}
                    placeholder="Example: ABC token FDV must stay above 1,000,000 USD one day after the public sale."
                    rows={5}
                    error={errors.description}
                    required
                  />
                  <div className="grid md:grid-cols-3 gap-4">
                    <Select
                      label="TEMPLATE"
                      value={formData.template}
                      onChange={(event) => updateField('template', event.target.value as TemplateType)}
                      options={TEMPLATE_OPTIONS}
                    />
                    {formData.template !== 'custom' && (
                      <>
                        <Select
                          label="CONDITION"
                          value={formData.condition}
                          onChange={(event) => updateField('condition', event.target.value as 'above' | 'below')}
                          options={CONDITION_OPTIONS}
                        />
                        <Input
                          label="THRESHOLD"
                          type="number"
                          value={formData.threshold}
                          onChange={(event) => updateField('threshold', event.target.value)}
                          error={errors.threshold}
                        />
                      </>
                    )}
                  </div>
                  {formData.template === 'custom' && (
                    <Textarea
                      label="CUSTOM RULE"
                      value={formData.customRule}
                      onChange={(event) => updateField('customRule', event.target.value)}
                      rows={4}
                      error={errors.customRule}
                    />
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle icon={<span>{'//'}</span>}>FUNDING AND TIMING</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-5">
                  <Select
                    label="COLLATERAL TOKEN"
                    value={formData.collateralToken}
                    onChange={(event) => updateField('collateralToken', event.target.value)}
                    error={errors.collateralToken}
                    options={collateralOptions}
                    disabled={!runtimeConfig || allowedCollateralTokens.length === 0}
                  />
                  <Input
                    label="TARGET COLLATERAL AMOUNT"
                    type="number"
                    min="0"
                    step="0.000001"
                    value={formData.collateralAmount}
                    onChange={(event) => updateField('collateralAmount', event.target.value)}
                    error={errors.collateralAmount}
                    hint={
                      selectedCollateralToken
                        ? collateralCapExceeded
                          ? `Cap: ${selectedCollateralCap} ${selectedCollateralToken.symbol}. Enter ${selectedCollateralCap} or less to create.`
                          : `Cap: ${selectedCollateralCap} ${selectedCollateralToken.symbol}.`
                        : 'Choose an allowlisted collateral token first.'
                    }
                  />
                  <Input
                    label="SETUP DEPOSIT (OKB)"
                    type="number"
                    min={MIN_SETUP_DEPOSIT_OKB}
                    step="0.00001"
                    value={formData.setupDepositAmount}
                    onChange={(event) => updateField('setupDepositAmount', event.target.value)}
                    error={errors.setupDepositAmount}
                    hint={`Minimum ${MIN_SETUP_DEPOSIT_OKB} OKB; higher deposits give agents more rule-making budget.`}
                  />
                  <div className="grid lg:grid-cols-[2fr_1fr] gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2 text-matrix-green font-mono">
                        SETTLEMENT DATE
                      </label>
                      <div className="grid md:grid-cols-3 gap-4">
                        <Select
                          aria-label="Settlement month"
                          value={settlementDateParts.month}
                          onChange={(event) => updateSettlementDatePart('month', event.target.value)}
                          options={[{ value: '', label: 'Month' }, ...MONTH_OPTIONS]}
                          className={errors.settlementDate ? 'border-red-500 text-red-500' : ''}
                        />
                        <Select
                          aria-label="Settlement day"
                          value={settlementDateParts.day}
                          onChange={(event) => updateSettlementDatePart('day', event.target.value)}
                          options={settlementDayOptions}
                          className={errors.settlementDate ? 'border-red-500 text-red-500' : ''}
                        />
                        <Select
                          aria-label="Settlement year"
                          value={settlementDateParts.year}
                          onChange={(event) => updateSettlementDatePart('year', event.target.value)}
                          options={settlementYearOptions}
                          className={errors.settlementDate ? 'border-red-500 text-red-500' : ''}
                        />
                      </div>
                      <p className={`mt-1 text-sm font-mono ${errors.settlementDate ? 'text-red-500' : 'text-matrix-dark'}`}>
                        {errors.settlementDate ?? 'English date selector; timestamp uses UTC.'}
                      </p>
                    </div>
                    <Input
                      label="SETTLEMENT TIME (UTC)"
                      type="time"
                      value={formData.settlementTime}
                      onChange={(event) => updateField('settlementTime', event.target.value)}
                      error={errors.settlementTime}
                      hint="Use 24-hour UTC time, not your local timezone."
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <aside className="space-y-6">
            <Card className="border-matrix-dark">
              <CardHeader>
                <CardTitle icon={<span>{'//'}</span>}>LIVE CONTRACTS</CardTitle>
              </CardHeader>
              <CardContent>
                  <InfoLine label="CHAIN ID" value={String(runtimeConfig?.chainId ?? X_LAYER_CHAIN_ID)} />
                  <InfoLine label="OKX CHAIN INDEX" value={String(runtimeConfig?.okxChainIndex ?? proofOfVaultContractConfig.okxChainIndex)} />
                  <InfoLine label="VAULT FACTORY" value={runtimeConfig?.vaultFactoryAddress ?? proofOfVaultContractConfig.vaultFactoryAddress} />
                  <InfoLine label="POV TOKEN" value={runtimeConfig?.stakeTokenAddress ?? proofOfVaultContractConfig.stakeTokenAddress} />
                  <InfoLine label="COLLATERAL" value={selectedCollateralToken?.symbol ?? 'Select from allowlist'} />
                </CardContent>
              </Card>

            <Card className="border-matrix-dark">
              <CardHeader>
                <CardTitle icon={<span>{'//'}</span>}>TRANSACTION PLAN</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-matrix-dim">
                  Your wallet creates the vault on-chain with the OKB setup deposit, then the app syncs the confirmed
                  vaultId into the workflow API.
                </p>
              </CardContent>
            </Card>

            <Card className="border-matrix-green">
              <CardHeader>
                <CardTitle icon={<span>{'//'}</span>}>REVIEW</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 text-sm">
                  <InfoLine label="SETTER" value={wallet.address ?? 'Connect wallet'} />
                  <InfoLine
                    label="STATUS"
                    value={
                      wallet.chainId === (runtimeConfig?.chainId ?? X_LAYER_CHAIN_ID)
                        ? `Ready on ${networkLabel}`
                        : `Switch to ${networkLabel}`
                    }
                  />
                  <InfoLine label="SETUP DEPOSIT" value={`${formData.setupDepositAmount || MIN_SETUP_DEPOSIT_OKB} OKB`} />
                  <InfoLine label="STATEMENT" value={buildStatement(formData) || 'Fill in event details'} />
                  <InfoLine label="SETTLEMENT" value={formatUtcSettlement(settlementAt)} />
                </div>
                <Button
                  className="mt-6"
                  fullWidth
                  variant="gold"
                  onClick={handleSubmit}
                  disabled={
                    Boolean(createBlockerReason)
                  }
                  isLoading={isSubmitting}
                >
                  [ CREATE ON-CHAIN VAULT ]
                </Button>
                {createBlockerReason && (
                  <p className="mt-3 text-xs text-red-400">{createBlockerReason}</p>
                )}
                {!wallet.isConnected && (
                  <div className="mt-4 flex justify-center">
                    <ConnectButton />
                  </div>
                )}
              </CardContent>
            </Card>
          </aside>
        </div>
      </section>
    </main>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-4">
      <p className="text-xs text-matrix-dark mb-1">{label}</p>
      <p className="text-sm text-matrix-green break-all">{value}</p>
    </div>
  );
}
