'use client';

import React from 'react';
import { Card } from '../ui/Card';
import { StatusBadge } from '../ui/Badge';
import { CircularProgress } from '../ui/Progress';

// ============================================
// Types
// ============================================

interface Agent {
  id: string;
  name: string;
  walletAddress: string;
  status: string;
  stakeAmount: string;
  confidence: number;
  criteriaResults?: Array<{ criterion: string; passed: boolean; reason?: string }>;
}

interface AgentCardProps {
  agent: Agent;
  mode?: 'display' | 'stake' | 'review';
  onStake?: () => void;
  onReview?: () => void;
  className?: string;
}

interface AgentListProps {
  agents: Agent[];
  mode?: 'display' | 'stake' | 'review';
  onAgentClick?: (agent: Agent) => void;
  className?: string;
}

// ============================================
// Constants
// ============================================

const EMPTY_STATE_ICON = '[ ]';
const AGENT_INITIALS = 'AG';

// ============================================
// Main Components
// ============================================

export function AgentCard({ agent, mode = 'display', onStake, onReview, className = '' }: AgentCardProps) {
  const hasResults = agent.criteriaResults && agent.criteriaResults.length > 0;
  const passedCount = agent.criteriaResults?.filter((r) => r.passed).length || 0;
  const totalCount = agent.criteriaResults?.length || 0;

  return (
    <Card className={`${className} font-mono`}>
      <Header agent={agent} />
      <Stats agent={agent} passedCount={passedCount} totalCount={totalCount} />

      {hasResults && <CriteriaResultsPreview results={agent.criteriaResults!} />}
      {hasResults && <CriteriaResultsList results={agent.criteriaResults!} />}

      <ActionButton mode={mode} onStake={onStake} onReview={onReview} />
    </Card>
  );
}

export function AgentList({ agents, mode = 'display', className = '' }: AgentListProps) {
  if (agents.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className={`grid gap-4 ${className}`}>
      {agents.map((agent) => (
        <AgentCard key={agent.id} agent={agent} mode={mode} />
      ))}
    </div>
  );
}

// ============================================
// Sub-Components
// ============================================

function Header({ agent }: { agent: Agent }) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div className="flex items-center gap-3">
        <AgentAvatar />
        <div>
          <h4 className="font-medium text-matrix-green text-sm">{agent.name}</h4>
          <p className="text-xs text-matrix-dark font-mono">
            {formatAddress(agent.walletAddress)}
          </p>
        </div>
      </div>
      <StatusBadge status={agent.status} />
    </div>
  );
}

function AgentAvatar() {
  return (
    <div className="w-10 h-10 rounded-full border border-matrix-green flex items-center justify-center">
      <span className="text-matrix-green text-sm">{AGENT_INITIALS}</span>
    </div>
  );
}

function formatAddress(address: string): string {
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

function Stats({ agent, passedCount, totalCount }: {
  agent: Agent;
  passedCount: number;
  totalCount: number;
}) {
  const variant = agent.confidence >= 0.8 ? 'success' : agent.confidence >= 0.5 ? 'warning' : 'danger';

  return (
    <div className="flex items-center justify-between mb-4">
      <div className="text-sm text-matrix-dim">
        <span>STAKE: </span>
        <span className="text-matrix-green font-medium">{agent.stakeAmount} OKB</span>
      </div>
      {agent.confidence > 0 && (
        <CircularProgress
          value={agent.confidence * 100}
          size={48}
          strokeWidth={4}
          variant={variant}
        />
      )}
    </div>
  );
}

function CriteriaResultsPreview({ results }: { results: Array<{ criterion: string; passed: boolean }> }) {
  const passedCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;
  const passRate = passedCount / totalCount;

  const textColor = passedCount === totalCount
    ? 'text-matrix-green'
    : passRate > 0.5
    ? 'text-yellow-400'
    : 'text-red-400';

  return (
    <div className="mb-4 p-3 border border-matrix-dark">
      <div className="flex items-center justify-between text-sm mb-2">
        <span className="text-matrix-dark">RESULTS</span>
        <span className={textColor}>{passedCount}/{totalCount} PASS</span>
      </div>
      <div className="flex gap-1">
        {results.map((result, i) => (
          <ResultBadge key={i} result={result} />
        ))}
      </div>
    </div>
  );
}

function ResultBadge({ result }: { result: { criterion: string; passed: boolean } }) {
  const style = result.passed
    ? 'border-matrix-green text-matrix-green'
    : 'border-red-500 text-red-400';

  return (
    <div
      className={`w-6 h-6 border flex items-center justify-center text-xs ${style}`}
      title={result.criterion}
    >
      {result.passed ? 'OK' : 'X'}
    </div>
  );
}

function CriteriaResultsList({ results }: { results: Array<{ criterion: string; passed: boolean }> }) {
  return (
    <div className="space-y-2 mb-4">
      {results.slice(0, 3).map((result, i) => (
        <CriteriaResultItem key={i} result={result} />
      ))}
    </div>
  );
}

function CriteriaResultItem({ result }: { result: { criterion: string; passed: boolean } }) {
  const badgeStyle = result.passed
    ? 'border-matrix-green text-matrix-green'
    : 'border-red-500 text-red-400';

  return (
    <div className="flex items-start gap-2 text-sm">
      <span className={`w-5 h-5 border flex items-center justify-center text-xs shrink-0 ${badgeStyle}`}>
        {result.passed ? 'OK' : 'X'}
      </span>
      <span className="text-matrix-dim truncate flex-1" title={result.criterion}>
        {result.criterion}
      </span>
    </div>
  );
}

function ActionButton({ mode, onStake, onReview }: {
  mode: 'display' | 'stake' | 'review';
  onStake?: () => void;
  onReview?: () => void;
}) {
  if (mode === 'stake' && onStake) {
    return (
      <button
        onClick={onStake}
        className="w-full mt-4 px-4 py-2 border border-matrix-green text-matrix-green font-mono hover:bg-matrix-green hover:text-black transition-all"
      >
        [ STAKE ]
      </button>
    );
  }

  if (mode === 'review' && onReview) {
    return (
      <button
        onClick={onReview}
        className="w-full mt-4 px-4 py-2 border border-matrix-green text-matrix-green font-mono hover:bg-matrix-green hover:text-black transition-all"
      >
        [ REVIEW ]
      </button>
    );
  }

  return null;
}

function EmptyState() {
  return (
    <div className="text-center py-8">
      <div className="w-16 h-16 rounded-full border border-matrix-dark flex items-center justify-center mx-auto mb-4">
        <span className="text-matrix-dark text-2xl font-mono">{EMPTY_STATE_ICON}</span>
      </div>
      <p className="text-matrix-dark font-mono text-sm">NO AGENTS</p>
    </div>
  );
}

export default AgentList;