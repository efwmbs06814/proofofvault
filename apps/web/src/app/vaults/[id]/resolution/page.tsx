'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ResolutionBadge, StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { EmptyState, ErrorState, PageLoading } from '@/components/ui/Loading';
import { Logo } from '@/components/ui/Logo';
import { FinalResultDisplay } from '@/components/vault/FinalResultDisplay';
import {
  finalizeVaultResolution,
  getWorkflowVault,
  type FinalizeResolutionResponse
} from '@/lib/api/submission';
import type { AgentSubmission, VaultDetail as WorkflowVaultDetail } from '@proof-of-vault/shared-types';

export default function VaultResolutionPage() {
  const params = useParams();
  const vaultId = params.id as string;
  const [vault, setVault] = useState<WorkflowVaultDetail | null>(null);
  const [finality, setFinality] = useState<FinalizeResolutionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isFinalizing, setIsFinalizing] = useState(false);

  const loadVault = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setVault(await getWorkflowVault(vaultId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load resolution state.');
    } finally {
      setLoading(false);
    }
  }, [vaultId]);

  useEffect(() => {
    loadVault();
  }, [loadVault]);

  const handleFinalize = async () => {
    setIsFinalizing(true);
    setError('');
    try {
      const result = await finalizeVaultResolution(vaultId, { reopenOnInsufficientEvidence: false });
      setFinality(result);
      setVault(result.vault);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to finalize resolution.');
    } finally {
      setIsFinalizing(false);
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

  const commits = vault.submissions.filter((submission) => submission.kind === 'resolution_commit');
  const reveals = vault.submissions.filter((submission) => submission.kind === 'resolution_reveal');
  const audits = vault.submissions.filter((submission) => submission.kind === 'audit_verdict');
  const challenges = vault.submissions.filter((submission) => submission.kind === 'public_challenge');
  const finalResult = vault.finalResolution?.result;

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
            <ConsensusCard vault={vault} />

            {finalResult ? (
              <Card className={finalResult === 'TRUE' ? 'border-matrix-green' : finalResult === 'FALSE' ? 'border-red-500' : 'border-orange-500'}>
                <CardHeader>
                  <CardTitle icon={<span className="text-matrix-green">{'//'}</span>}>RESOLUTION COMPLETE</CardTitle>
                </CardHeader>
                <CardContent>
                  <FinalResultDisplay
                    result={finalResult as any}
                    vaultTitle={vault.statement ?? `Vault ${vault.id}`}
                    stakeAmount={vault.grossCollateralAmount}
                    reason={vault.finalResolution?.reason ?? 'Resolution finalized.'}
                  />
                </CardContent>
              </Card>
            ) : (
              <Card className="border-matrix-green">
                <CardHeader>
                  <CardTitle icon={<span className="text-matrix-green">{'//'}</span>}>FINALITY ACTION</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-matrix-dim mb-4">
                    Finalize uses the live API consensus metrics and calls the configured on-chain gateway.
                  </p>
                  {finality && finality.blockers.length > 0 && (
                    <div className="mb-4 p-4 border border-yellow-500/30 bg-yellow-500/5 text-yellow-400 text-sm">
                      {finality.blockers.map((blocker) => (
                        <p key={blocker}>{blocker}</p>
                      ))}
                    </div>
                  )}
                  <Button onClick={handleFinalize} fullWidth isLoading={isFinalizing}>
                    [ FINALIZE LIVE RESULT ]
                  </Button>
                </CardContent>
              </Card>
            )}

            <SubmissionTable title="VALIDATOR COMMITS" submissions={commits} />
            <SubmissionTable title="VALIDATOR REVEALS" submissions={reveals} />
            <SubmissionTable title="AUDIT VERDICTS" submissions={audits} />
            <SubmissionTable title="PUBLIC CHALLENGES" submissions={challenges} />
          </div>

          <div className="space-y-6">
            <CommitteeCard vault={vault} />
            <TimelineCard vault={vault} />
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
          <span className="px-3 py-1 border border-matrix-green/30 text-matrix-green">[ RESOLUTION MODE ]</span>
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
          <InfoStat label="ROUND" value={String(vault.resolutionRound)} />
          <InfoStat label="COMMITS" value={String(vault.submissions.filter((submission) => submission.kind === 'resolution_commit').length)} />
          <InfoStat label="REVEALS" value={String(vault.submissions.filter((submission) => submission.kind === 'resolution_reveal').length)} />
        </div>
      </div>
    </Card>
  );
}

function ConsensusCard({ vault }: { vault: WorkflowVaultDetail }) {
  const metrics = vault.consensusMetrics;
  return (
    <Card className="border-matrix-green">
      <CardHeader>
        <CardTitle icon={<span className="text-matrix-green">{'//'}</span>}>LIVE CONSENSUS</CardTitle>
      </CardHeader>
      <CardContent>
        {metrics ? (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Metric label="VALID" value={metrics.validCount} color="text-matrix-green" />
              <Metric label="QUESTIONABLE" value={metrics.questionableCount} color="text-yellow-400" />
              <Metric label="INVALID" value={metrics.invalidCount} color="text-orange-400" />
              <Metric label="MALICIOUS" value={metrics.maliciousCount} color="text-red-400" />
            </div>
            <div className="p-4 border border-matrix-dark">
              <p className="text-xs text-matrix-dark mb-2">DECIDED OUTCOME</p>
              {metrics.decidedOutcome ? (
                <ResolutionBadge result={metrics.decidedOutcome as any} />
              ) : (
                <p className="text-matrix-dim text-sm">No valid 2/3 consensus yet.</p>
              )}
              <p className="mt-3 text-xs text-matrix-dark">
                Confidence: {(metrics.confidenceScore * 100).toFixed(0)}% | Ready: {String(metrics.readyForFinality)}
              </p>
            </div>
          </div>
        ) : (
          <EmptyState title="[NO CONSENSUS]" description="Register a resolution committee and collect reveals/audits first." />
        )}
      </CardContent>
    </Card>
  );
}

function SubmissionTable({ title, submissions }: { title: string; submissions: AgentSubmission[] }) {
  return (
    <Card className="border-matrix-dark">
      <CardHeader>
        <CardTitle icon={<span className="text-matrix-green">{'//'}</span>}>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {submissions.length > 0 ? (
          <div className="space-y-3">
            {submissions.map((submission) => (
              <div key={submission.id ?? `${submission.kind}-${submission.agentAddress}`} className="p-3 border border-matrix-dark">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm text-matrix-green">{submission.kind}</p>
                    <p className="text-xs text-matrix-dim break-all">{submission.agentAddress}</p>
                  </div>
                  <span className="text-xs text-matrix-dark shrink-0">ROUND {submission.round}</span>
                </div>
                <p className="mt-2 text-xs text-matrix-dark break-all">{submission.payloadHash ?? submission.payloadURI}</p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="[EMPTY]" description="No submissions recorded for this stage yet." />
        )}
      </CardContent>
    </Card>
  );
}

function CommitteeCard({ vault }: { vault: WorkflowVaultDetail }) {
  const validators = vault.resolutionCommittee?.validators ?? [];
  const auditors = vault.resolutionCommittee?.auditors ?? [];
  return (
    <Card className="border-matrix-dark">
      <CardHeader>
        <CardTitle icon={<span className="text-matrix-green">{'//'}</span>}>COMMITTEE</CardTitle>
      </CardHeader>
      <CardContent>
        <AddressList title="VALIDATORS" addresses={validators} />
        <div className="my-4 border-t border-matrix-dark" />
        <AddressList title="AUDITORS" addresses={auditors} />
      </CardContent>
    </Card>
  );
}

function TimelineCard({ vault }: { vault: WorkflowVaultDetail }) {
  const metrics = vault.consensusMetrics;
  const items = [
    ['COMMIT', vault.submissions.some((submission) => submission.kind === 'resolution_commit')],
    ['REVEAL', vault.submissions.some((submission) => submission.kind === 'resolution_reveal')],
    ['AUDIT', vault.submissions.some((submission) => submission.kind === 'audit_verdict')],
    ['FINAL', Boolean(vault.finalResolution)],
  ] as const;
  return (
    <Card className="border-matrix-dark">
      <CardHeader>
        <CardTitle icon={<span className="text-matrix-green">{'//'}</span>}>TIMELINE</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {items.map(([label, completed], index) => (
            <div key={label} className="flex items-center gap-3">
              <div className={`w-6 h-6 rounded-full border flex items-center justify-center text-xs ${
                completed ? 'border-matrix-green bg-matrix-green text-black' : 'border-matrix-dark text-matrix-dark'
              }`}>
                {completed ? 'OK' : index + 1}
              </div>
              <span className={completed ? 'text-matrix-green' : 'text-matrix-dark'}>{label}</span>
            </div>
          ))}
        </div>
        {metrics?.slashCandidates.length ? (
          <div className="mt-4 p-3 border border-red-500/30 text-red-400 text-xs">
            Slash candidates: {metrics.slashCandidates.length}
          </div>
        ) : null}
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

function Metric({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center p-4 border border-matrix-dark">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-matrix-dark">{label}</p>
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
