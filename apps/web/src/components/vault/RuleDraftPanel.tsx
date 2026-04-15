'use client';

import React from 'react';
import { Card, CardHeader, CardTitle } from '../ui/Card';

// ============================================
// Types
// ============================================

interface RuleDraft {
  observationTarget: string;
  metric: string;
  threshold: string;
  dataSources: string[];
  invalidConditions: string[];
  additionalRules?: string[];
}

interface RuleDraftPanelProps {
  ruleDraft?: RuleDraft;
  criteria: string[];
  criteriaResults?: Array<{ criterion: string; passed: boolean; reason?: string }>;
  challenges?: Array<{
    id: string;
    challenger: string;
    reason: string;
    timestamp: string;
    status: 'pending' | 'accepted' | 'rejected';
  }>;
  className?: string;
}

// ============================================
// Main Component
// ============================================

export function RuleDraftPanel({
  ruleDraft,
  criteria,
  criteriaResults = [],
  challenges = [],
  className = '',
}: RuleDraftPanelProps) {
  return (
    <div className={`space-y-6 ${className}`}>
      {/* Rule Draft Structure */}
      {ruleDraft && (
        <RuleStructureCard ruleDraft={ruleDraft} />
      )}

      {/* Criteria List */}
      {criteria.length > 0 && (
        <CriteriaCard criteria={criteria} criteriaResults={criteriaResults} />
      )}

      {/* Challenges */}
      {challenges.length > 0 && (
        <ChallengesCard challenges={challenges} />
      )}
    </div>
  );
}

// ============================================
// Sub-Components
// ============================================

function RuleStructureCard({ ruleDraft }: { ruleDraft: RuleDraft }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle icon={<span className="text-matrix-green">{'//'}</span>}>RULE DRAFT</CardTitle>
        <span className="px-2 py-1 text-xs border border-matrix-green/30 text-matrix-green/70 bg-matrix-green/5">
          STRUCTURED
        </span>
      </CardHeader>

      <div className="space-y-4">
        {/* Observation Target */}
        <RuleField 
          label="OBSERVATION TARGET" 
          value={ruleDraft.observationTarget}
          description="What entity or condition to observe"
        />

        {/* Metric */}
        <RuleField 
          label="METRIC" 
          value={ruleDraft.metric}
          description="How to measure the target"
        />

        {/* Threshold */}
        <RuleField 
          label="THRESHOLD" 
          value={ruleDraft.threshold}
          description="Pass/fail criteria value"
          highlight
        />

        {/* Data Sources */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-matrix-dark font-mono">{'>'}</span>
            <span className="text-sm text-matrix-green font-mono">DATA SOURCES</span>
          </div>
          <div className="pl-6 space-y-1">
            {ruleDraft.dataSources.map((source, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-matrix-dark font-mono text-xs">-</span>
                <span className="text-xs text-matrix-dim font-mono">{source}</span>
              </div>
            ))}
          </div>
        </div>

        {/* INVALID Conditions */}
        <div className="p-3 border border-red-500/30 bg-red-500/5 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-red-400 font-mono">!</span>
            <span className="text-sm text-red-400 font-mono font-bold">INVALID CONDITIONS</span>
          </div>
          <div className="pl-6 space-y-1">
            {ruleDraft.invalidConditions.map((condition, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-red-400/60 font-mono text-xs mt-0.5">-</span>
                <span className="text-xs text-red-400/80 font-mono">{condition}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Additional Rules */}
        {ruleDraft.additionalRules && ruleDraft.additionalRules.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-matrix-dark font-mono">{'>'}</span>
              <span className="text-sm text-matrix-green font-mono">ADDITIONAL RULES</span>
            </div>
            <div className="pl-6 space-y-1">
              {ruleDraft.additionalRules.map((rule, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-matrix-dark font-mono text-xs mt-0.5">-</span>
                  <span className="text-xs text-matrix-dim font-mono">{rule}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function RuleField({ label, value, description, highlight }: { 
  label: string; 
  value: string; 
  description: string;
  highlight?: boolean;
}) {
  return (
    <div className={`p-3 border ${highlight ? 'border-matrix-green bg-matrix-green/5' : 'border-matrix-dark'}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-matrix-dark font-mono">{'>'} {label}</span>
        <span className="text-xs text-matrix-dark/60">{description}</span>
      </div>
      <p className={`font-mono text-sm ${highlight ? 'text-matrix-green font-bold' : 'text-matrix-dim'}`}>
        {value}
      </p>
    </div>
  );
}

function CriteriaCard({ 
  criteria, 
  criteriaResults = [] 
}: { 
  criteria: string[]; 
  criteriaResults: Array<{ criterion: string; passed: boolean; reason?: string }>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle icon={<span className="text-matrix-green">{'//'}</span>}>VERIFICATION CRITERIA</CardTitle>
        <span className="text-xs text-matrix-dark font-mono">{criteria.length} ITEMS</span>
      </CardHeader>

      <div className="space-y-3">
        {criteria.map((criterion, index) => {
          const result = criteriaResults.find(r => r.criterion === criterion);
          const passed = result?.passed;
          
          return (
            <CriterionItem 
              key={index}
              index={index}
              criterion={criterion}
              status={passed}
              reason={result?.reason}
            />
          );
        })}
      </div>
    </Card>
  );
}

function CriterionItem({ 
  index, 
  criterion, 
  status,
  reason 
}: { 
  index: number; 
  criterion: string; 
  status?: boolean;
  reason?: string;
}) {
  const badgeStyle = status === true
    ? 'border-matrix-green bg-matrix-green text-black'
    : status === false
    ? 'border-red-500 bg-red-500 text-white'
    : 'border-matrix-dark text-matrix-dark';

  const badgeText = status === true ? 'OK' : status === false ? 'X' : `0${index + 1}`;

  return (
    <div className={`p-4 border transition-colors ${
      status === true ? 'border-matrix-green/50 bg-matrix-green/5' : 
      status === false ? 'border-red-500/50 bg-red-500/5' : 
      'border-matrix-dark'
    }`}>
      <div className="flex items-start gap-3">
        {/* Number Badge */}
        <div className={`w-8 h-8 rounded flex items-center justify-center shrink-0 text-xs font-bold border ${badgeStyle}`}>
          {badgeText}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className={`font-mono text-sm ${status ? 'text-matrix-green' : 'text-matrix-dim'}`}>
            {criterion}
          </p>
          
          {reason && (
            <p className="mt-2 text-xs text-matrix-dark font-mono">
              <span className="text-matrix-dark/60">REASON:</span> {reason}
            </p>
          )}
        </div>

        {/* Verified By Badge */}
        {status !== undefined && (
          <span className="shrink-0 px-2 py-1 text-xs border border-matrix-green/30 text-matrix-green/70 bg-matrix-green/5 font-mono">
            VERIFIED
          </span>
        )}
      </div>
    </div>
  );
}

function ChallengesCard({ challenges }: { challenges: RuleDraftPanelProps['challenges'] }) {
  if (!challenges || challenges.length === 0) return null;
  
  return (
    <Card className="border-red-500/30">
      <CardHeader>
        <CardTitle icon={<span className="text-red-400">{'!'}</span>}>CHALLENGES</CardTitle>
        <span className="text-xs text-red-400 font-mono">{challenges.length} ACTIVE</span>
      </CardHeader>

      <div className="space-y-4">
        {challenges.map((challenge) => (
          <ChallengeItem key={challenge.id} challenge={challenge} />
        ))}
      </div>
    </Card>
  );
}

function ChallengeItem({ challenge }: { 
  challenge: NonNullable<RuleDraftPanelProps['challenges']>[number] 
}) {
  const statusConfig = {
    pending: { label: 'PENDING', classes: 'text-yellow-400 border-yellow-500/50 bg-yellow-500/5' },
    accepted: { label: 'ACCEPTED', classes: 'text-red-400 border-red-500/50 bg-red-500/5' },
    rejected: { label: 'REJECTED', classes: 'text-matrix-green border-matrix-green/50 bg-matrix-green/5' },
  }[challenge.status] || { label: 'UNKNOWN', classes: 'text-matrix-dark border-matrix-dark bg-transparent' };

  return (
    <div className="p-3 border border-matrix-dark">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-red-400 font-mono">{'>'}</span>
          <span className="text-sm text-matrix-green font-mono truncate">
            {truncateAddress(challenge.challenger)}
          </span>
        </div>
        <span className={`px-2 py-0.5 text-xs border font-mono ${statusConfig.classes}`}>
          {statusConfig.label}
        </span>
      </div>
      
      <p className="text-sm text-matrix-dim font-mono mb-2 pl-6">
        {challenge.reason}
      </p>
      
      <div className="text-xs text-matrix-dark font-mono pl-6">
        {formatDate(challenge.timestamp)}
      </div>
    </div>
  );
}

// ============================================
// Helper Functions
// ============================================

function truncateAddress(address: string, length: number = 10): string {
  if (!address) return '-';
  if (address.length <= length * 2) return address;
  return `${address.slice(0, length)}...${address.slice(-length)}`;
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).toUpperCase();
  } catch {
    return dateStr;
  }
}

// ============================================
// Default Export
// ============================================

export default RuleDraftPanel;