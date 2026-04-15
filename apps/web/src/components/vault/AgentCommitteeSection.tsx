'use client';

import React from 'react';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';

// ============================================
// Types
// ============================================

export interface AgentInfo {
  id: string;
  name: string;
  role: 'Maker' | 'Verifier' | 'Validator' | 'Auditor' | 'RuleMaker';
  walletAddress: string;
  status: 'selected' | 'working' | 'submitted' | 'rewarded' | 'slashed' | 'pending';
  stakeAmount: string;
  submittedResult?: 'TRUE' | 'FALSE' | 'INVALID' | null;
  commitHash?: string;
  confidence?: number;
  verifiedCriteria?: string[];
  auditorsComments?: string[];
}

interface AgentCommitteeSectionProps {
  agents: AgentInfo[];
  currentPhase: string;
  totalSlots: { makers: number; verifiers: number; validators: number; auditors: number };
  className?: string;
}

// ============================================
// Constants
// ============================================

const ROLE_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  Maker: { label: 'MAKER', color: 'border-blue-500 text-blue-400', bgColor: 'bg-blue-500/10' },
  Verifier: { label: 'VERIFIER', color: 'border-purple-500 text-purple-400', bgColor: 'bg-purple-500/10' },
  RuleMaker: { label: 'RULE MAKER', color: 'border-cyan-500 text-cyan-400', bgColor: 'bg-cyan-500/10' },
  Validator: { label: 'VALIDATOR', color: 'border-orange-500 text-orange-400', bgColor: 'bg-orange-500/10' },
  Auditor: { label: 'AUDITOR', color: 'border-yellow-500 text-yellow-400', bgColor: 'bg-yellow-500/10' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  selected: { label: 'SELECTED', color: 'text-matrix-green' },
  working: { label: 'WORKING', color: 'text-yellow-400' },
  submitted: { label: 'SUBMITTED', color: 'text-blue-400' },
  rewarded: { label: 'REWARDED', color: 'text-matrix-green' },
  slashed: { label: 'SLASHED', color: 'text-red-400' },
  pending: { label: 'PENDING', color: 'text-matrix-dark' },
};

// ============================================
// Main Component
// ============================================

export function AgentCommitteeSection({
  agents,
  currentPhase,
  totalSlots,
  className = '',
}: AgentCommitteeSectionProps) {
  const makers = agents.filter(a => a.role === 'Maker' || a.role === 'RuleMaker');
  const verifiers = agents.filter(a => a.role === 'Verifier');
  const validators = agents.filter(a => a.role === 'Validator');
  const auditors = agents.filter(a => a.role === 'Auditor');

  const isResolvingPhase = ['CommitPhase', 'RevealPhase', 'AuditPhase', 'Challenge', 'Resolving'].includes(currentPhase);

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <AgentCountCard role="Maker" count={makers.length} total={totalSlots.makers} />
        <AgentCountCard role="Verifier" count={verifiers.length} total={totalSlots.verifiers} />
        <AgentCountCard role="Validator" count={validators.length} total={totalSlots.validators} />
        <AgentCountCard role="Auditor" count={auditors.length} total={totalSlots.auditors} />
      </div>

      {/* Agent Lists by Role */}
      <div className="space-y-4">
        {makers.length > 0 && (
          <AgentGroup title="RULE MAKERS" agents={makers} currentPhase={currentPhase} />
        )}
        {verifiers.length > 0 && (
          <AgentGroup title="VERIFIERS" agents={verifiers} currentPhase={currentPhase} />
        )}
        {(validators.length > 0 || isResolvingPhase) && (
          <AgentGroup 
            title="VALIDATORS" 
            agents={validators} 
            currentPhase={currentPhase}
            showCommitReveal={isResolvingPhase}
          />
        )}
        {(auditors.length > 0 || currentPhase === 'AuditPhase') && (
          <AgentGroup title="AUDITORS" agents={auditors} currentPhase={currentPhase} showAuditorView />
        )}
      </div>

      {/* Empty state */}
      {agents.length === 0 && (
        <div className="text-center py-8 border border-matrix-dark">
          <p className="text-matrix-dark font-mono text-sm">NO AGENTS ASSIGNED</p>
          <p className="text-xs text-matrix-dark/60 mt-1">Waiting for committee formation...</p>
        </div>
      )}
    </div>
  );
}

// ============================================
// Sub-Components
// ============================================

function AgentCountCard({ role, count, total }: { role: string; count: number; total: number }) {
  const config = ROLE_CONFIG[role] || { label: role, color: 'border-matrix-dark text-matrix-dark', bgColor: '' };
  const isComplete = count >= total;

  return (
    <div className={`p-3 border ${config.color} ${config.bgColor}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-matrix-dark">{config.label}</span>
        <span className={`text-xs font-bold ${isComplete ? 'text-matrix-green' : 'text-matrix-dark'}`}>
          {count}/{total}
        </span>
      </div>
      <div className="h-1 bg-matrix-dark rounded-full overflow-hidden">
        <div 
          className="h-full bg-matrix-green transition-all duration-300"
          style={{ width: `${Math.min((count / total) * 100, 100)}%` }}
        />
      </div>
    </div>
  );
}

function AgentGroup({ 
  title, 
  agents, 
  currentPhase,
  showCommitReveal = false,
  showAuditorView = false,
}: { 
  title: string; 
  agents: AgentInfo[];
  currentPhase: string;
  showCommitReveal?: boolean;
  showAuditorView?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs text-matrix-dark font-mono">{'>'}</span>
        <span className="text-sm font-mono text-matrix-green font-medium">{title}</span>
        <span className="text-xs text-matrix-dark">({agents.length})</span>
      </div>
      
      <div className="space-y-2 pl-4">
        {agents.map((agent) => (
          <AgentCard 
            key={agent.id} 
            agent={agent} 
            showCommitReveal={showCommitReveal}
            showAuditorView={showAuditorView}
          />
        ))}
      </div>
    </div>
  );
}

function AgentCard({ 
  agent, 
  showCommitReveal = false,
  showAuditorView = false,
}: { 
  agent: AgentInfo; 
  showCommitReveal?: boolean;
  showAuditorView?: boolean;
}) {
  const roleConfig = ROLE_CONFIG[agent.role] || { label: agent.role, color: 'border-matrix-dark text-matrix-dark', bgColor: '' };
  const statusConfig = STATUS_CONFIG[agent.status] || { label: agent.status, color: 'text-matrix-dark' };

  return (
    <div className={`p-3 border ${roleConfig.color} ${roleConfig.bgColor}`}>
      {/* Header Row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-matrix-green font-mono">{'>'}</span>
          <span className="font-mono text-sm text-matrix-green font-medium">{agent.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 text-xs border ${roleConfig.color}`}>
            {roleConfig.label}
          </span>
          <span className={`text-xs font-mono ${statusConfig.color}`}>
            {statusConfig.label}
          </span>
        </div>
      </div>

      {/* Wallet Address */}
      <div className="flex items-center gap-2 mb-2 text-xs text-matrix-dark font-mono">
        <span>WALLET:</span>
        <span className="text-matrix-dim">{truncateAddress(agent.walletAddress)}</span>
      </div>

      {/* Stake Info */}
      <div className="flex items-center justify-between text-xs font-mono mb-2">
        <span className="text-matrix-dark">STAKE</span>
        <span className="text-matrix-green">{agent.stakeAmount} OKB</span>
      </div>

      {/* Result/Commit Section */}
      {showCommitReveal && (
        <div className="mt-3 pt-3 border-t border-matrix-dark/50">
          {agent.commitHash ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-matrix-dark">COMMIT HASH</span>
                <span className="text-xs text-matrix-green font-mono px-2 py-1 bg-matrix-green/10 border border-matrix-green/30">
                  COMMITTED
                </span>
              </div>
              <div className="text-xs font-mono text-matrix-dim truncate">
                {agent.commitHash}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-xs text-matrix-dark">COMMIT HASH</span>
              <span className="text-xs text-yellow-400 font-mono px-2 py-1 bg-yellow-400/10 border border-yellow-400/30">
                PENDING
              </span>
            </div>
          )}

          {agent.submittedResult && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-matrix-dark">RESULT:</span>
              <ResultBadge result={agent.submittedResult} />
            </div>
          )}
        </div>
      )}

      {/* Auditor Comments */}
      {showAuditorView && agent.auditorsComments && agent.auditorsComments.length > 0 && (
        <div className="mt-3 pt-3 border-t border-matrix-dark/50">
          <span className="text-xs text-matrix-dark mb-2 block">AUDIT COMMENTS</span>
          <div className="space-y-1">
            {agent.auditorsComments.map((comment, i) => (
              <p key={i} className="text-xs text-matrix-dim font-mono">- {comment}</p>
            ))}
          </div>
        </div>
      )}

      {/* Verified Criteria */}
      {agent.verifiedCriteria && agent.verifiedCriteria.length > 0 && (
        <div className="mt-3 pt-3 border-t border-matrix-dark/50">
          <span className="text-xs text-matrix-dark mb-2 block">VERIFIED CRITERIA</span>
          <div className="flex flex-wrap gap-1">
            {agent.verifiedCriteria.map((c, i) => (
              <span key={i} className="px-2 py-0.5 text-xs border border-matrix-green/30 text-matrix-green/70 font-mono">
                {truncateText(c, 20)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ResultBadge({ result }: { result: 'TRUE' | 'FALSE' | 'INVALID' }) {
  const config: Record<string, { label: string; color: string; bgColor: string }> = {
    TRUE: { label: 'TRUE', color: 'text-matrix-green border-matrix-green', bgColor: 'bg-matrix-green/10' },
    FALSE: { label: 'FALSE', color: 'text-red-400 border-red-500', bgColor: 'bg-red-500/10' },
    INVALID: { label: 'INVALID', color: 'text-yellow-400 border-yellow-500', bgColor: 'bg-yellow-500/10' },
  };

  const resultConfig = config[result];

  return (
    <span className={`px-2 py-0.5 text-xs border font-mono font-bold ${resultConfig.color} ${resultConfig.bgColor}`}>
      {resultConfig.label}
    </span>
  );
}

// ============================================
// Helper Functions
// ============================================

function truncateAddress(address: string, length: number = 8): string {
  if (!address) return '-';
  if (address.length <= length * 2 + 2) return address;
  return `${address.slice(0, length)}...${address.slice(-length)}`;
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

// ============================================
// Default Export
// ============================================

export default AgentCommitteeSection;