'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Badge, StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input, Textarea } from '@/components/ui/Input';
import { EmptyState, ErrorState, PageLoading } from '@/components/ui/Loading';
import { Logo } from '@/components/ui/Logo';
import { Modal } from '@/components/ui/Modal';
import { ConnectButton, useWallet } from '@/components/ui/Wallet';
import { RuleDraftViewer } from '@/components/vault/RuleDraftViewer';
import {
  getRuleChallenges,
  getRuleDraft,
  getWorkflowVault,
  submitRuleChallenge,
  type RuleChallenge,
  type RuleDraft
} from '@/lib/api/submission';
import { registerVaultTx } from '@/lib/api/vault';
import { storePayload } from '@/lib/api/runtime';
import { decideRuleSetOnchain, readProtocolTreasuryConfig } from '@/lib/contracts/proofOfVault';
import type { VaultDetail as WorkflowVaultDetail } from '@proof-of-vault/shared-types';

const SEVERITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  Low: { label: 'LOW', color: 'text-blue-400', bg: 'border-blue-500/30 bg-blue-500/5' },
  Medium: { label: 'MEDIUM', color: 'text-yellow-400', bg: 'border-yellow-500/30 bg-yellow-500/5' },
  High: { label: 'HIGH', color: 'text-orange-500', bg: 'border-orange-500/30 bg-orange-500/5' },
  Critical: { label: 'CRITICAL', color: 'text-red-400', bg: 'border-red-500/30 bg-red-500/5' },
};

export default function VaultReviewPage() {
  const params = useParams();
  const vaultId = params.id as string;
  const { address } = useWallet();
  const [vault, setVault] = useState<WorkflowVaultDetail | null>(null);
  const [ruleDraft, setRuleDraft] = useState<RuleDraft | null>(null);
  const [challenges, setChallenges] = useState<RuleChallenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showChallengeModal, setShowChallengeModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [treasuryConflictMessage, setTreasuryConflictMessage] = useState('');
  const [challengeForm, setChallengeForm] = useState({
    severity: 'Medium' as RuleChallenge['severity'],
    title: '',
    description: '',
    suggestion: '',
  });

  const loadReviewState = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [vaultDetail, draft, issueList] = await Promise.all([
        getWorkflowVault(vaultId),
        getRuleDraft(vaultId),
        getRuleChallenges(vaultId),
      ]);
      setVault(vaultDetail);
      setRuleDraft(draft);
      setChallenges(issueList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load rule review state.');
    } finally {
      setLoading(false);
    }
  }, [vaultId]);

  useEffect(() => {
    loadReviewState();
  }, [loadReviewState]);

  useEffect(() => {
    if (!vault?.setterAddress) {
      setTreasuryConflictMessage('');
      return;
    }

    let mounted = true;
    readProtocolTreasuryConfig()
      .then(({ treasuryAddress }) => {
        if (!mounted) {
          return;
        }

        const setterAddress = vault.setterAddress;
        if (!setterAddress) {
          setTreasuryConflictMessage('');
          return;
        }

        if (treasuryAddress.toLowerCase() === setterAddress.toLowerCase()) {
          setTreasuryConflictMessage(
            `Accept + fund is blocked because this vault setter ${setterAddress} is also the protocol treasury ${treasuryAddress}. The protocol owner must move FeeManager.treasury to a different address before funding can proceed.`
          );
          return;
        }

        setTreasuryConflictMessage('');
      })
      .catch((err) => {
        console.error('Failed to load protocol treasury config:', err);
      });

    return () => {
      mounted = false;
    };
  }, [vault?.setterAddress]);

  const handleSubmitChallenge = async () => {
    if (!challengeForm.title.trim() || !challengeForm.description.trim()) {
      setError('Challenge title and description are required.');
      return;
    }

    const verifierAddress = vault?.ruleCommittee?.verifiers.find(
      (verifier) => address && verifier.toLowerCase() === address.toLowerCase()
    );
    if (!address || !verifierAddress) {
      setError('Connect a current rule verifier wallet before submitting a rule issue.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await submitRuleChallenge(vaultId, challengeForm, verifierAddress);
      setShowChallengeModal(false);
      setChallengeForm({ severity: 'Medium', title: '', description: '', suggestion: '' });
      await loadReviewState();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit rule challenge.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetterDecision = async (decision: 'accept' | 'reject') => {
    if (!vault?.setterAddress || !address || vault.setterAddress.toLowerCase() !== address.toLowerCase()) {
      setError('Connect the setter wallet before accepting or rejecting the rule set.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const reasonURI =
        decision === 'reject'
          ? (
              await storePayload({
                vaultId,
                kind: 'rule_set_rejection',
                walletAddress: address,
                payload: {
                  vaultId,
                  setter: address,
                  reason: 'Setter rejected the finalized rule set from the web UI.',
                  createdAt: new Date().toISOString(),
                  version: 1
                }
              })
            ).payloadURI
          : undefined;
      const tx = await decideRuleSetOnchain({
        vaultId: vault.externalVaultId ?? vault.id,
        decision,
        reasonURI,
        expectedSetter: address as `0x${string}`
      });
      await registerVaultTx(
        vault.id,
        decision === 'accept' ? 'acceptRuleSetAndFund' : 'rejectRuleSet',
        tx.txHash as `0x${string}`
      );
      await loadReviewState();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${decision} rule set.`);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <PageLoading />;
  }

  if (error && !vault) {
    return (
      <main className="min-h-screen bg-black text-matrix-green font-mono">
        <Header vaultId={vaultId} />
        <ErrorState message={error} onRetry={loadReviewState} />
      </main>
    );
  }

  if (!vault || !ruleDraft) {
    return (
      <main className="min-h-screen bg-black text-matrix-green font-mono">
        <Header vaultId={vaultId} />
        <div className="container mx-auto px-4 py-16 max-w-4xl text-center">
          <EmptyState title="[NOT READY]" description="Rule committee data is not available yet." />
        </div>
      </main>
    );
  }

  const openChallenges = challenges.filter((challenge) => challenge.status === 'pending');
  const connectedVerifier = vault.ruleCommittee?.verifiers.find(
    (verifier) => address && verifier.toLowerCase() === address.toLowerCase()
  );
  const canSubmitRuleIssue = Boolean(connectedVerifier);

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
            <Card className="border-matrix-dark">
              <CardHeader>
                <CardTitle icon={<span className="text-matrix-green">{'//'}</span>}>LIVE RULE DRAFT</CardTitle>
              </CardHeader>
              <CardContent>
                <RuleDraftViewer
                  showMaker
                  draft={{
                    eventTitle: ruleDraft.eventTitle,
                    observationTarget: ruleDraft.observationObject,
                    metricType: ruleDraft.metricType,
                    threshold: ruleDraft.threshold,
                    primaryDataSource: ruleDraft.primaryDataSource,
                    backupDataSource: ruleDraft.fallbackDataSource ?? 'N/A',
                    throughConditions: ruleDraft.passConditions,
                    failConditions: ruleDraft.failConditions,
                    invalidConditions: ruleDraft.invalidConditions,
                    observationWindow: ruleDraft.observationTime,
                  }}
                />
              </CardContent>
            </Card>

            <Card className="border-matrix-dark">
              <CardHeader
                action={
                  <Button onClick={() => setShowChallengeModal(true)} disabled={!canSubmitRuleIssue}>
                    [ SUBMIT ISSUE ]
                  </Button>
                }
              >
                <CardTitle icon={<span className="text-matrix-green">{'//'}</span>}>
                  LIVE RULE ISSUES ({openChallenges.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {challenges.length > 0 ? (
                  <div className="space-y-4">
                    {challenges.map((challenge) => (
                      <ChallengeCard key={challenge.id} challenge={challenge} />
                    ))}
                  </div>
                ) : (
                  <EmptyState title="[NO RULE ISSUES]" description="No verifier has submitted a rule issue for this round." />
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            {vault.status === 'UserRuleReview' && (
              <Card className="border-matrix-green">
                <CardHeader>
                  <CardTitle icon={<span className="text-matrix-green">{'//'}</span>}>SETTER DECISION</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-matrix-dim mb-4">
                    The setter must accept or reject this rule set with a browser-wallet transaction. The API only registers the verified receipt.
                  </p>
                  {treasuryConflictMessage && (
                    <div className="mb-4 border border-yellow-500/60 bg-yellow-500/10 p-3 text-xs text-yellow-300">
                      {treasuryConflictMessage}
                    </div>
                  )}
                  <div className="space-y-3">
                    <Button
                      fullWidth
                      variant="gold"
                      onClick={() => handleSetterDecision('accept')}
                      disabled={submitting || Boolean(treasuryConflictMessage)}
                    >
                      [ ACCEPT + FUND ]
                    </Button>
                    <Button fullWidth variant="secondary" onClick={() => handleSetterDecision('reject')} disabled={submitting}>
                      [ REJECT RULES ]
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
            <CommitteeCard vault={vault} />
            <Card className="border-matrix-dark">
              <CardHeader>
                <CardTitle icon={<span className="text-matrix-green">{'//'}</span>}>SOURCE POLICY</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm">
                  <InfoLine label="CRITERIA HASH" value={vault.criteriaHash ?? 'Pending finalization'} />
                  <InfoLine label="PRIMARY SOURCE" value={ruleDraft.primaryDataSource} />
                  <InfoLine label="BACKUP POLICY" value={ruleDraft.fallbackDataSource ?? 'Mark INVALID if trusted data is unavailable'} />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Modal isOpen={showChallengeModal} onClose={() => setShowChallengeModal(false)} title="SUBMIT RULE ISSUE" size="lg">
        <div className="space-y-4">
          <div>
            <label className="text-xs text-matrix-dim mb-2 block">SEVERITY</label>
            <div className="grid grid-cols-4 gap-2">
              {Object.keys(SEVERITY_CONFIG).map((severity) => (
                <Button
                  key={severity}
                  size="sm"
                  variant={challengeForm.severity === severity ? 'primary' : 'secondary'}
                  onClick={() => setChallengeForm({ ...challengeForm, severity: severity as RuleChallenge['severity'] })}
                >
                  {SEVERITY_CONFIG[severity].label}
                </Button>
              ))}
            </div>
          </div>

          <Input
            label="ISSUE TITLE"
            placeholder="e.g., ambiguous source policy"
            value={challengeForm.title}
            onChange={(event) => setChallengeForm({ ...challengeForm, title: event.target.value })}
          />
          <Textarea
            label="DESCRIPTION"
            placeholder="Explain why the rule draft is unsafe or underspecified."
            value={challengeForm.description}
            onChange={(event) => setChallengeForm({ ...challengeForm, description: event.target.value })}
            rows={4}
          />
          <Textarea
            label="SUGGESTED FIX"
            placeholder="How should the maker harden the rule?"
            value={challengeForm.suggestion}
            onChange={(event) => setChallengeForm({ ...challengeForm, suggestion: event.target.value })}
            rows={3}
          />

          <div className="flex gap-3 pt-4">
            <Button variant="secondary" onClick={() => setShowChallengeModal(false)} fullWidth>
              [ CANCEL ]
            </Button>
            <Button onClick={handleSubmitChallenge} fullWidth isLoading={submitting}>
              [ SUBMIT ON API ]
            </Button>
          </div>
        </div>
      </Modal>
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
          <span className="px-3 py-1 border border-yellow-500/30 text-yellow-400">[ REVIEW MODE ]</span>
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}

function VaultInfoBanner({ vault }: { vault: WorkflowVaultDetail }) {
  return (
    <Card className="mb-8 border-matrix-green">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-xl font-bold text-matrix-green">{vault.statement ?? `Vault ${vault.id}`}</h1>
            <StatusBadge status={vault.status as any} />
          </div>
          <p className="text-sm text-matrix-dim">{vault.metadataURI}</p>
        </div>
        <div className="flex items-center gap-6 text-sm">
          <InfoStat label="RULE ROUND" value={String(vault.ruleRound)} />
          <InfoStat label="MAKERS" value={String(vault.ruleCommittee?.makers.length ?? 0)} />
          <InfoStat label="VERIFIERS" value={String(vault.ruleCommittee?.verifiers.length ?? 0)} />
        </div>
      </div>
    </Card>
  );
}

function ChallengeCard({ challenge }: { challenge: RuleChallenge }) {
  const severity = SEVERITY_CONFIG[challenge.severity] ?? SEVERITY_CONFIG.Medium;
  return (
    <Card className="border border-yellow-500/30">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1 border text-xs ${severity.bg} ${severity.color}`}>
            {severity.label}
          </span>
          <Badge variant="default" size="sm">
            {challenge.status.toUpperCase()}
          </Badge>
        </div>
        <span className="text-xs text-matrix-dark">{new Date(challenge.createdAt).toLocaleString('en-US').toUpperCase()}</span>
      </div>
      <h3 className="text-lg font-semibold text-matrix-green mb-2">{challenge.title}</h3>
      <p className="text-sm text-matrix-dim whitespace-pre-wrap">{challenge.description}</p>
      {challenge.suggestion && (
        <div className="mt-4 p-4 border border-matrix-dark">
          <p className="text-xs text-matrix-dark mb-1">SUGGESTED FIX</p>
          <p className="text-sm text-matrix-dim">{challenge.suggestion}</p>
        </div>
      )}
      <p className="mt-4 text-xs text-matrix-dark">VERIFIER: {challenge.verifierAddress}</p>
    </Card>
  );
}

function CommitteeCard({ vault }: { vault: WorkflowVaultDetail }) {
  const makers = vault.ruleCommittee?.makers ?? [];
  const verifiers = vault.ruleCommittee?.verifiers ?? [];
  return (
    <Card className="border-matrix-dark">
      <CardHeader>
        <CardTitle icon={<span className="text-matrix-green">{'//'}</span>}>RULE COMMITTEE</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <AddressList title="MAKERS" addresses={makers} />
          <AddressList title="VERIFIERS" addresses={verifiers} />
        </div>
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

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-matrix-dark mb-1">{label}</p>
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
