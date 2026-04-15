'use client';

import React from 'react';
import { StatusBadge } from '../ui/Badge';

// ============================================
// Types
// ============================================

interface VaultStatusTimelineProps {
  currentStatus: string;
  className?: string;
}

interface VaultStatusProgressProps {
  currentStatus: string;
  className?: string;
}

// ============================================
// Constants
// ============================================

const VAULT_STATUS_FLOW = [
  { status: 'Draft', label: 'DRAFT', description: 'Setter creates vault' },
  { status: 'PendingReview', label: 'PENDING', description: 'Waiting for agents' },
  { status: 'Active', label: 'ACTIVE', description: 'Agents reviewing' },
  { status: 'Resolving', label: 'RESOLVING', description: 'Submitting proof' },
  { status: 'ResolvedTrue', label: 'VERIFIED', description: 'TRUE - Release' },
  { status: 'ResolvedFalse', label: 'REJECTED', description: 'FALSE - Slash' },
  { status: 'ResolvedInvalid', label: 'INVALID', description: 'Refund' },
] as const;

const STATUS_ORDER: Record<string, number> = {
  Draft: 0, PendingReview: 1, Active: 2, Resolving: 3,
  ResolvedTrue: 4, ResolvedFalse: 5, ResolvedInvalid: 6,
};

const RESULT_CONFIG: Record<string, { label: string; color: string }> = {
  ResolvedTrue: { label: 'TRUE', color: 'border-matrix-green text-matrix-green' },
  ResolvedFalse: { label: 'FALSE', color: 'border-red-500 text-red-400' },
  ResolvedInvalid: { label: 'INVALID', color: 'border-yellow-500 text-yellow-400' },
};

// ============================================
// Main Components
// ============================================

export function VaultStatusTimeline({ currentStatus, className = '' }: VaultStatusTimelineProps) {
  const currentIndex = VAULT_STATUS_FLOW.findIndex((s) => s.status === currentStatus);
  const isFinalState = ['ResolvedTrue', 'ResolvedFalse', 'ResolvedInvalid'].includes(currentStatus);

  return (
    <div className={`${className} font-mono`}>
      <div className="relative">
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-matrix-dark" />

        <div className="space-y-6">
          {VAULT_STATUS_FLOW.slice(0, 4).map((step, index) => (
            <TimelineStep
              key={step.status}
              index={index}
              step={step}
              isCompleted={index < currentIndex}
              isCurrent={index === currentIndex}
            />
          ))}

          <FinalResultStep currentStatus={currentStatus} isFinalState={isFinalState} />
        </div>
      </div>
    </div>
  );
}

export function VaultStatusProgress({ currentStatus, className = '' }: VaultStatusProgressProps) {
  const progress = Math.min((STATUS_ORDER[currentStatus] || 0) / 3, 1) * 100;

  return (
    <div className={`${className} font-mono`}>
      <div className="flex items-center justify-between mb-2">
        <StatusBadge status={currentStatus} />
        <span className="text-sm text-matrix-dim">{Math.round(progress)}%</span>
      </div>
      <div className="h-2 bg-matrix-dark rounded-full overflow-hidden">
        <div
          className="h-full transition-all duration-500 rounded-full"
          style={{ width: `${progress}%`, backgroundColor: '#00ff41', boxShadow: '0 0 10px rgba(0, 255, 65, 0.5)' }}
        />
      </div>
    </div>
  );
}

// ============================================
// Sub-Components
// ============================================

function TimelineStep({
  index,
  step,
  isCompleted,
  isCurrent,
}: {
  index: number;
  step: typeof VAULT_STATUS_FLOW[number];
  isCompleted: boolean;
  isCurrent: boolean;
}) {
  const circleStyle = isCompleted
    ? 'bg-matrix-green text-black border-matrix-green'
    : isCurrent
    ? 'bg-black text-matrix-green border-matrix-green'
    : 'bg-black text-matrix-dark border-matrix-dark';

  return (
    <div className="relative flex items-start gap-4">
      <div
        className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-2 transition-all duration-300 ${circleStyle}`}
        style={isCurrent ? { boxShadow: '0 0 15px rgba(0, 255, 65, 0.5)' } : {}}
      >
        {isCompleted ? 'OK' : index + 1}
      </div>

      <div className="flex-1 pt-1">
        <div className="flex items-center gap-2">
          <p className={`font-medium text-sm ${isCurrent ? 'text-matrix-green' : isCompleted ? 'text-matrix-green' : 'text-matrix-dark'}`}>
            {step.label}
          </p>
          {isCurrent && <StatusBadge status={step.status} />}
        </div>
        <p className="text-xs text-matrix-dark mt-0.5">{step.description}</p>
      </div>
    </div>
  );
}

function FinalResultStep({ currentStatus, isFinalState }: { currentStatus: string; isFinalState: boolean }) {
  const getFinalStateStyle = () => {
    if (!isFinalState) return 'bg-black text-matrix-dark border-matrix-dark';
    switch (currentStatus) {
      case 'ResolvedTrue': return 'bg-matrix-green text-black border-matrix-green';
      case 'ResolvedFalse': return 'bg-red-500 text-white border-red-500';
      case 'ResolvedInvalid': return 'bg-yellow-500 text-black border-yellow-500';
      default: return 'bg-black text-matrix-dark border-matrix-dark';
    }
  };

  return (
    <div className="relative flex items-start gap-4">
      <div
        className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-2 transition-all duration-300 ${getFinalStateStyle()}`}
        style={isFinalState ? { boxShadow: '0 0 15px rgba(0, 255, 65, 0.5)' } : {}}
      >
        #
      </div>

      <div className="flex-1 pt-1">
        <p className={`font-medium text-sm ${isFinalState ? 'text-matrix-green' : 'text-matrix-dark'}`}>
          FINAL RESULT
        </p>
        <div className="mt-2 flex flex-wrap gap-2 font-mono text-xs">
          {(['ResolvedTrue', 'ResolvedFalse', 'ResolvedInvalid'] as const).map((status) => (
            <ResultBadge
              key={status}
              status={status}
              isActive={currentStatus === status}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ResultBadge({ status, isActive }: { status: string; isActive: boolean }) {
  const config = RESULT_CONFIG[status];
  return (
    <span className={`px-3 py-1 border ${isActive ? config.color : 'border-matrix-dark text-matrix-dark'}`}>
      {config.label}
    </span>
  );
}

export default VaultStatusTimeline;