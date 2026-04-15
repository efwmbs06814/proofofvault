'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { getVault, VaultDetail } from '@/lib/api/vault';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { StatusBadge, ResolutionBadge } from '@/components/ui/Badge';
import { VaultStatusTimeline, VaultStatusProgress } from '@/components/vault/VaultStatusTimeline';
import { CriteriaList } from '@/components/vault/CriteriaList';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, ErrorState, PageLoading } from '@/components/ui/Loading';
import { useWallet, ConnectButton } from '@/components/ui/Wallet';
import { submitCriteria } from '@/lib/api/submission';
import { Logo } from '@/components/ui/Logo';

export default function VaultDetailPageV2() {
  const params = useParams<{ id: string }>();
  const [id, setId] = useState<string>('');
  const [vault, setVault] = useState<VaultDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCriteriaModal, setShowCriteriaModal] = useState(false);
  const { address } = useWallet();

  useEffect(() => {
    if (params?.id) {
      setId(params.id);
    }
  }, [params]);

  const loadVault = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setError('');
    try {
      const data = await getVault(id);
      setVault(data);
    } catch (err) {
      console.error('Failed to load vault:', err);
      setError(err instanceof Error ? err.message : 'Failed to load vault');
      setVault(null);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      loadVault();
      const interval = setInterval(loadVault, 30000);
      return () => clearInterval(interval);
    }
  }, [id, loadVault]);

  const handleSubmitCriteria = async (results: Array<{ criterion: string; passed: boolean; reason: string }>) => {
    if (!vault || !address) return;
    try {
      await submitCriteria({ agentAddress: address, vaultId: vault.id, results });
      await loadVault();
      setShowCriteriaModal(false);
    } catch (err) {
      console.error('Failed to submit criteria:', err);
      setError(err instanceof Error ? err.message : 'Failed to submit criteria.');
    }
  };

  const canStake = vault?.status === 'PendingReview';
  const canReviewCriteria = vault?.status === 'Active';
  const canSubmitProof = vault?.status === 'Active' || vault?.status === 'Resolving';
  const canFinalize = vault?.status === 'Resolving';

  if (isLoading) return <PageLoading />;

  if (error || !vault) {
    return (
      <main className="min-h-screen bg-black text-matrix-green font-mono">
        <ErrorState message={error || 'VAULT NOT FOUND'} onRetry={loadVault} />
      </main>
    );
  }

  const isResolved = ['ResolvedTrue', 'ResolvedFalse', 'ResolvedInvalid'].includes(vault.status);

  return (
    <main className="min-h-screen bg-black text-matrix-green font-mono">
      {/* Header */}
      <header className="border-b border-matrix-dark sticky top-0 z-40 bg-black/90 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2">
              <Logo size={28} variant="image" color="white" />
              <span className="text-lg font-bold text-matrix-green">PROOF OF VAULT</span>
            </Link>
            <Link href="/vaults" className="text-matrix-dim hover:text-matrix-green transition-colors text-sm">
              {'< BACK'}
            </Link>
          </div>
          <ConnectButton />
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Title & Status */}
        <div className="mb-8">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <h1 className="text-2xl font-bold mb-2 text-matrix-green" style={{ textShadow: '0 0 10px #00ff41' }}>
                {vault.title}
              </h1>
              <p className="text-matrix-dim text-sm">{vault.description}</p>
            </div>
            <StatusBadge status={vault.status} />
          </div>

          {vault.transactionHash && (
            <a
              href={`https://www.oklink.com/xlayer/tx/${vault.transactionHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-matrix-green hover:text-white transition-colors"
            >
              <span>{'>'}_</span>
              VIEW ON-CHAIN TX
            </a>
          )}
        </div>

        {/* Status Progress */}
        <Card className="mb-8">
          <VaultStatusProgress currentStatus={vault.status} />
        </Card>

        {/* Main Content Grid */}
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            {/* Vault Info Card */}
            <Card>
              <CardHeader>
                <CardTitle icon={<span className="text-matrix-green">{'//'}</span>}>VAULT INFO</CardTitle>
              </CardHeader>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 font-mono text-sm">
                <InfoItem label="STAKE" value={`${vault.stakeAmount} OKB`} highlight />
                <InfoItem label="CREATED" value={new Date(vault.createdAt).toLocaleDateString('en-US').toUpperCase()} />
                <InfoItem label="SETTER" value={vault.setter ? `${vault.setter.slice(0, 8)}...` : '-'} mono />
                <InfoItem label="AGENTS" value={`${vault.stakedCount || vault.agents.length}/${vault.agentCount}`} />
              </div>
            </Card>

            {/* Criteria Card */}
            <Card>
              <CardHeader action={canReviewCriteria ? <Button size="sm" onClick={() => setShowCriteriaModal(true)}>[ REVIEW ]</Button> : undefined}>
                <CardTitle icon={<span className="text-matrix-green">{'//'}</span>}>VERIFICATION CRITERIA</CardTitle>
              </CardHeader>
              <CriteriaList criteria={vault.criteria} mode="display" />
            </Card>

            {/* Proof Card */}
            {vault.proof && (
              <Card className={`
                ${vault.resolution?.result === 'TRUE' ? 'border-matrix-green' :
                  vault.resolution?.result === 'FALSE' ? 'border-red-500' : 'border-orange-500'}
              `}>
                <CardHeader>
                  <CardTitle icon={<span className="text-matrix-green">{'//'}</span>}>RESOLUTION PROOF</CardTitle>
                </CardHeader>
                <div className="p-4 border border-matrix-dark font-mono text-sm text-matrix-dim">
                  <p className="whitespace-pre-wrap">{vault.proof.content}</p>
                  <div className="mt-4 pt-4 border-t border-matrix-dark flex justify-between text-xs">
                    <span>SUBMITTED: {new Date(vault.proof.submittedAt).toLocaleString('en-US').toUpperCase()}</span>
                    <span>BY: {vault.proof.submitter.slice(0, 10)}...</span>
                  </div>
                </div>
              </Card>
            )}

            {/* Resolution Result Card */}
            {vault.resolution && (
              <Card className={vault.resolution.result === 'TRUE' ? 'border-matrix-green' : vault.resolution.result === 'FALSE' ? 'border-red-500' : 'border-orange-500'}>
                <CardHeader>
                  <CardTitle icon={<span className="text-matrix-green">{'//'}</span>}>FINAL RESULT</CardTitle>
                </CardHeader>
                <div className="flex items-center gap-4 mb-4">
                  <ResolutionBadge result={vault.resolution.result} />
                  <span className="text-matrix-dim">-</span>
                  <span className="text-matrix-dim">{vault.resolution.reason}</span>
                </div>
                
                {vault.resolution.result === 'TRUE' && (
                  <div className="p-4 border border-matrix-green text-matrix-green">
                    <p className="text-sm"><strong>{'>'} VERIFIED</strong> - Setter can claim {vault.stakeAmount} OKB</p>
                  </div>
                )}
                {vault.resolution.result === 'FALSE' && (
                  <div className="p-4 border border-red-500 text-red-400">
                    <p className="text-sm"><strong>{'!'} REJECTED</strong> - {vault.stakeAmount} OKB redistributed to verifiers</p>
                  </div>
                )}
                {vault.resolution.result === 'INVALID' && (
                  <div className="p-4 border border-orange-500 text-orange-400">
                    <p className="text-sm"><strong>{'#'} INVALID</strong> - Refund to Setter</p>
                  </div>
                )}
              </Card>
            )}

            {/* Submit Proof Button */}
            {canSubmitProof && !vault.proof && (
              <Card className="border-matrix-green">
                <div className="text-center py-4">
                  <h3 className="text-lg font-semibold mb-2 text-matrix-green">SUBMIT RESOLUTION PROOF</h3>
                  <p className="text-matrix-dim text-sm mb-4">All agents have completed review. Submit final verification evidence.</p>
                  <Link href={`/vaults/${vault.id}/submit`}>
                    <Button size="lg">[ OPEN LIVE SUBMISSION ]</Button>
                  </Link>
                </div>
              </Card>
            )}
          </div>

          {/* Right Column - Sidebar */}
          <div className="space-y-6">
            {/* Status Timeline */}
            <Card>
              <CardHeader>
                <CardTitle icon={<span className="text-matrix-green">{'//'}</span>}>STATUS FLOW</CardTitle>
              </CardHeader>
              <VaultStatusTimeline currentStatus={vault.status} />
            </Card>

            {/* Agents Card */}
            <Card>
              <CardHeader>
                <CardTitle icon={<span className="text-matrix-green">{'//'}</span>}>
                  AGENTS ({vault.agents.length}/{vault.agentCount})
                </CardTitle>
              </CardHeader>
              {vault.agents.length > 0 ? (
                <div className="space-y-4">
                  {vault.agents.map((agent) => (
                    <AgentCard key={agent.id} agent={agent} />
                  ))}
                </div>
              ) : (
                <EmptyState title="[NO AGENTS]" description="Waiting for agents to stake" />
              )}
            </Card>

            {/* Actions Card */}
            <Card>
              <CardHeader>
                <CardTitle icon={<span className="text-matrix-green">{'//'}</span>}>ACTIONS</CardTitle>
              </CardHeader>
              <div className="space-y-3">
                {canStake && <Link href={`/vaults/${vault.id}/review`}><Button fullWidth>[ REVIEW RULES ]</Button></Link>}
                {canReviewCriteria && <Link href={`/vaults/${vault.id}/review`}><Button fullWidth variant="secondary">[ REVIEW ]</Button></Link>}
                {canSubmitProof && !vault.proof && <Link href={`/vaults/${vault.id}/submit`}><Button fullWidth variant="gold">[ SUBMIT ]</Button></Link>}
                {canFinalize && <Link href={`/vaults/${vault.id}/resolution`}><Button fullWidth variant="danger">[ FINALIZE ]</Button></Link>}
                {!isResolved && !canStake && !canReviewCriteria && !canSubmitProof && !canFinalize && (
                  <p className="text-center text-matrix-dark text-sm py-4">NO ACTIONS AVAILABLE</p>
                )}
              </div>
            </Card>

            {/* X Layer Info */}
            <Card className="border-matrix-dark">
              <h3 className="font-medium text-matrix-green mb-3 text-sm">X LAYER MAINNET</h3>
              <div className="space-y-2 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-matrix-dark">CHAIN ID</span>
                  <span className="text-matrix-green">196</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-matrix-dark">NETWORK</span>
                  <span className="text-matrix-green">X Layer</span>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Criteria Review Modal */}
      <Modal isOpen={showCriteriaModal} onClose={() => setShowCriteriaModal(false)} title="REVIEW CRITERIA" size="lg">
        <CriteriaList criteria={vault.criteria} mode="review" onResultChange={() => {}} />
        <div className="mt-6 flex gap-3">
          <Button variant="secondary" onClick={() => setShowCriteriaModal(false)} fullWidth>[ CANCEL ]</Button>
          <Button onClick={() => handleSubmitCriteria(vault.criteria.map(c => ({ criterion: c, passed: true, reason: 'Approved' })))} fullWidth>[ SUBMIT ]</Button>
        </div>
      </Modal>
    </main>
  );
}

function AgentCard({ agent }: { agent: any }) {
  return (
    <div className="p-3 border border-matrix-dark">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-matrix-green text-sm">{'>'}</span>
          <span className="font-mono text-sm text-matrix-green">{agent.name}</span>
        </div>
        <StatusBadge status={agent.status} />
      </div>
      <div className="flex justify-between text-xs text-matrix-dark">
        <span>STAKE: {agent.stakeAmount} OKB</span>
        {agent.confidence > 0 && (
          <span className="text-matrix-green">CONF: {(agent.confidence * 100).toFixed(0)}%</span>
        )}
      </div>
    </div>
  );
}

function InfoItem({ label, value, highlight, mono }: { label: string; value: string; highlight?: boolean; mono?: boolean }) {
  return (
    <div className="p-3 border border-matrix-dark">
      <p className="text-xs text-matrix-dark mb-1">{label}</p>
      <p className={`font-medium ${highlight ? 'text-matrix-green' : mono ? 'font-mono text-sm' : 'text-matrix-green'}`}>
        {value}
      </p>
    </div>
  );
}

