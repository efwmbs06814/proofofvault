'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input, Textarea } from '@/components/ui/Input';
import { EmptyState, ErrorState, PageLoading } from '@/components/ui/Loading';
import { Logo } from '@/components/ui/Logo';
import { ConnectButton, useWallet } from '@/components/ui/Wallet';
import {
  createBytes32,
  createResolutionProofHash,
  getWorkflowVault,
  submitResolutionCommit,
  submitResolutionReveal,
} from '@/lib/api/submission';
import type { VaultDetail as WorkflowVaultDetail } from '@proof-of-vault/shared-types';

const RESULT_OPTIONS = ['TRUE', 'FALSE', 'INVALID'] as const;
type ResolutionResult = typeof RESULT_OPTIONS[number];
type CommittedResolutionDraft = {
  validatorAddress: string;
  result: ResolutionResult;
  reasoning: string;
  proofUri: string;
  proofHash: `0x${string}`;
  salt: `0x${string}`;
};

export default function VaultSubmitPage() {
  const params = useParams();
  const router = useRouter();
  const vaultId = params.id as string;
  const { address } = useWallet();
  const [vault, setVault] = useState<WorkflowVaultDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedResult, setSelectedResult] = useState<ResolutionResult | null>('TRUE');
  const [reasoning, setReasoning] = useState('');
  const [proofUri, setProofUri] = useState('');
  const [proofHash, setProofHash] = useState<`0x${string}` | ''>('');
  const [salt, setSalt] = useState<`0x${string}` | ''>('');
  const [commitTx, setCommitTx] = useState('');
  const [revealTx, setRevealTx] = useState('');
  const [committedDraft, setCommittedDraft] = useState<CommittedResolutionDraft | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadVault = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setVault(await getWorkflowVault(vaultId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load vault submission workflow.');
    } finally {
      setLoading(false);
    }
  }, [vaultId]);

  useEffect(() => {
    loadVault();
  }, [loadVault]);

  const validators = vault?.resolutionCommittee?.validators ?? [];
  const validator = validators.find((entry) => address && entry.toLowerCase() === address.toLowerCase());
  const round = vault?.resolutionRound || 1;
  const hasCommittee = validators.length > 0;
  const hasConnectedValidator = Boolean(validator);
  const canCommit = hasConnectedValidator && Boolean(selectedResult && reasoning.trim() && !commitTx);
  const canReveal = Boolean(
    commitTx &&
      committedDraft &&
      validator &&
      validator.toLowerCase() === committedDraft.validatorAddress.toLowerCase() &&
      !revealTx
  );

  const handleCommit = async () => {
    if (!validator || !selectedResult) {
      setError('Connect a current resolution validator wallet and choose a result before committing.');
      return;
    }

    const committedReasoning = reasoning.trim();
    const committedProofUri = proofUri.trim();
    if (!committedReasoning) {
      setError('Reasoning is required before committing so the proof hash can bind to the reveal payload.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      const nextProofHash = await createResolutionProofHash({
        vaultId,
        round,
        agentAddress: validator,
        result: selectedResult,
        reasoning: committedReasoning,
        proofUri: committedProofUri || undefined,
      });
      const nextSalt = createBytes32();
      const commit = await submitResolutionCommit({
        vaultId,
        round,
        agentAddress: validator,
        result: selectedResult,
        proofHash: nextProofHash,
        salt: nextSalt,
      });
      setProofHash(nextProofHash);
      setSalt(nextSalt);
      setCommitTx(commit.executionTrace?.txHash ?? commit.payloadHash ?? '');
      setCommittedDraft({
        validatorAddress: validator,
        result: selectedResult,
        reasoning: committedReasoning,
        proofUri: committedProofUri,
        proofHash: nextProofHash,
        salt: nextSalt,
      });
      await loadVault();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit resolution commit.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReveal = async () => {
    if (!validator || !committedDraft) {
      setError('Commit proof hash and salt are required before reveal.');
      return;
    }

    if (validator.toLowerCase() !== committedDraft.validatorAddress.toLowerCase()) {
      setError('Reveal must be submitted by the same connected validator wallet that created the commit.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      const reveal = await submitResolutionReveal({
        vaultId,
        round,
        agentAddress: committedDraft.validatorAddress,
        result: committedDraft.result,
        reasoning: committedDraft.reasoning,
        proofUri: committedDraft.proofUri || undefined,
        proofHash: committedDraft.proofHash,
        salt: committedDraft.salt,
      });
      setRevealTx(reveal.executionTrace?.txHash ?? reveal.payloadHash ?? '');
      await loadVault();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reveal resolution proof.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return <PageLoading />;
  }

  if (error && !vault) {
    return (
      <main className="min-h-screen bg-black text-matrix-green font-mono">
        <Header vaultId={vaultId} />
        <ErrorState message={error} onRetry={loadVault} />
      </main>
    );
  }

  if (!vault) {
    return (
      <main className="min-h-screen bg-black text-matrix-green font-mono">
        <Header vaultId={vaultId} />
        <div className="container mx-auto px-4 py-16 max-w-4xl text-center">
          <EmptyState title="[NOT FOUND]" description="Vault not found" />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-matrix-green font-mono">
      <Header vaultId={vaultId} />

      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {error && (
          <div className="mb-6 p-4 border border-red-500 text-red-400 text-sm">
            {error}
          </div>
        )}

        <VaultInfoBanner vault={vault} />

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            {!hasCommittee && (
              <Card className="border-yellow-500/30">
                <EmptyState
                  title="[RESOLUTION COMMITTEE REQUIRED]"
                  description="Register a resolution committee before an agent can commit or reveal a result."
                />
              </Card>
            )}
            {hasCommittee && !hasConnectedValidator && (
              <Card className="border-yellow-500/30">
                <EmptyState
                  title="[CONNECT VALIDATOR WALLET]"
                  description="Only a current resolution validator wallet can submit live commit/reveal payloads."
                />
              </Card>
            )}

            <Card className="border-purple-500/30">
              <CardHeader>
                <CardTitle icon={<span className="text-purple-400">{'//'}</span>}>1. OBSERVE + CALCULATE</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="grid md:grid-cols-3 gap-3">
                    {RESULT_OPTIONS.map((result) => (
                      <button
                        key={result}
                        disabled={Boolean(commitTx) || isSubmitting}
                        onClick={() => setSelectedResult(result)}
                        className={`p-4 border text-center transition-all ${
                          selectedResult === result
                            ? 'border-matrix-green bg-matrix-green/10 text-matrix-green'
                            : 'border-matrix-dark text-matrix-dim hover:border-matrix-green/30'
                        } ${commitTx ? 'cursor-not-allowed opacity-70' : ''}`}
                      >
                        <p className="text-lg font-bold">{result}</p>
                        <p className="text-xs opacity-70">{resultHelpText(result)}</p>
                      </button>
                    ))}
                  </div>

                  <Input
                    label="PROOF URI"
                    placeholder="ipfs://proof-of-vault/proofs/..."
                    value={proofUri}
                    disabled={Boolean(commitTx)}
                    onChange={(event) => setProofUri(event.target.value)}
                  />
                  <Textarea
                    label="REASONING"
                    placeholder="Explain the evidence, source, and calculation method."
                    value={reasoning}
                    disabled={Boolean(commitTx)}
                    onChange={(event) => setReasoning(event.target.value)}
                    rows={6}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="border-purple-500/30">
              <CardHeader>
                <CardTitle icon={<span className="text-purple-400">{'//'}</span>}>2. COMMIT</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-matrix-dim mb-4">
                  This submits a live commitment bound to the selected result, proof URI, reasoning, validator, and round.
                </p>
                {commitTx ? (
                  <TraceBox label="COMMIT TRACE" value={commitTx} />
                ) : (
                  <Button onClick={handleCommit} fullWidth isLoading={isSubmitting} disabled={!canCommit}>
                    [ SUBMIT COMMIT ]
                  </Button>
                )}
              </CardContent>
            </Card>

            <Card className="border-purple-500/30">
              <CardHeader>
                <CardTitle icon={<span className="text-purple-400">{'//'}</span>}>3. REVEAL</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-matrix-dim mb-4">
                  Reveal uses the committed payload snapshot. Edit fields are locked after commit to preserve commit/reveal consistency.
                </p>
                {revealTx ? (
                  <div className="space-y-4">
                    <TraceBox label="REVEAL TRACE" value={revealTx} />
                    <Button onClick={() => router.push(`/vaults/${vaultId}/resolution`)} fullWidth>
                      [ OPEN RESOLUTION ]
                    </Button>
                  </div>
                ) : (
                  <Button onClick={handleReveal} fullWidth isLoading={isSubmitting} disabled={!canReveal}>
                    [ REVEAL RESULT ]
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <CommitteeCard vault={vault} />
            <Card className="border-matrix-dark">
              <CardHeader>
                <CardTitle icon={<span className="text-matrix-green">{'//'}</span>}>COMMIT STATE</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-xs">
                  <InfoLine label="ROUND" value={String(round)} />
                  <InfoLine label="VALIDATOR" value={validator ?? 'No validator selected'} />
                  <InfoLine label="PROOF HASH" value={proofHash || 'Generated after commit'} />
                  <InfoLine label="SALT" value={salt || 'Generated after commit'} />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}

function Header({ vaultId }: { vaultId: string }) {
  return (
    <header className="border-b border-matrix-dark sticky top-0 z-40 bg-black/90 backdrop-blur-sm">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-center gap-2">
            <Logo size={28} variant="image" color="white" />
            <span className="text-lg font-bold text-matrix-green">PROOF OF VAULT</span>
          </Link>
          <Link href={`/vaults/${vaultId}`} className="text-matrix-dim hover:text-matrix-green transition-colors text-sm">
            {'< BACK'}
          </Link>
        </div>
        <div className="flex items-center gap-2 text-xs text-matrix-dim">
          <span className="px-3 py-1 border border-purple-500/30 text-purple-400">[ SUBMISSION MODE ]</span>
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}

function VaultInfoBanner({ vault }: { vault: WorkflowVaultDetail }) {
  return (
    <Card className="mb-8 border-purple-500/30">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-xl font-bold text-matrix-green">{vault.statement ?? `Vault ${vault.id}`}</h1>
            <StatusBadge status={vault.status as any} />
          </div>
          <p className="text-sm text-matrix-dim">{vault.metadataURI}</p>
        </div>
        <div className="flex items-center gap-6 text-sm">
          <InfoStat label="ROUND" value={String(vault.resolutionRound)} />
          <InfoStat label="VALIDATORS" value={String(vault.resolutionCommittee?.validators.length ?? 0)} />
          <InfoStat label="AUDITORS" value={String(vault.resolutionCommittee?.auditors.length ?? 0)} />
        </div>
      </div>
    </Card>
  );
}

function CommitteeCard({ vault }: { vault: WorkflowVaultDetail }) {
  const validators = vault.resolutionCommittee?.validators ?? [];
  const auditors = vault.resolutionCommittee?.auditors ?? [];
  return (
    <Card className="border-matrix-dark">
      <CardHeader>
        <CardTitle icon={<span className="text-matrix-green">{'//'}</span>}>RESOLUTION COMMITTEE</CardTitle>
      </CardHeader>
      <CardContent>
        <AddressList title="VALIDATORS" addresses={validators} />
        <div className="my-4 border-t border-matrix-dark" />
        <AddressList title="AUDITORS" addresses={auditors} />
      </CardContent>
    </Card>
  );
}

function AddressList({ title, addresses }: { title: string; addresses: string[] }) {
  return (
    <div>
      <p className="text-xs text-matrix-dark mb-2">{title}</p>
      <div className="space-y-2">
        {addresses.length > 0 ? addresses.map((address) => (
          <div key={address} className="p-2 border border-matrix-dark text-xs text-matrix-dim break-all">
            {address}
          </div>
        )) : (
          <p className="text-xs text-matrix-dark">Not registered</p>
        )}
      </div>
    </div>
  );
}

function TraceBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-4 border border-matrix-green bg-matrix-green/5">
      <p className="text-xs text-matrix-green mb-2">{label}</p>
      <p className="text-xs text-matrix-dim break-all">{value}</p>
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-matrix-dark mb-1">{label}</p>
      <p className="text-matrix-green break-all">{value}</p>
    </div>
  );
}

function InfoStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-xs text-matrix-dark">{label}</p>
      <p className="text-matrix-green font-bold">{value}</p>
    </div>
  );
}

function resultHelpText(result: ResolutionResult): string {
  switch (result) {
    case 'TRUE':
      return 'Criteria met';
    case 'FALSE':
      return 'Criteria failed';
    case 'INVALID':
      return 'Cannot verify';
  }
}
