'use client';

import React, { useState } from 'react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';

// ============================================
// Types
// ============================================

export interface RuleDraftData {
  observationTarget: string;
  metricType: string;
  threshold: string;
  primaryDataSource: string;
  backupDataSource: string;
  invalidConditions: string[];
  throughConditions: string[];
  failConditions: string[];
  observationWindow?: string;
  makerAgent?: string;
  eventTitle?: string;
}

interface RuleDraftViewerProps {
  draft: RuleDraftData;
  showMaker?: boolean;
  compact?: boolean;
}

// ============================================
// Constants
// ============================================

const SEVERITY_COLORS = {
  critical: 'bg-red-500/20 border-red-500 text-red-400',
  high: 'bg-orange-500/20 border-orange-500 text-orange-400',
  medium: 'bg-yellow-500/20 border-yellow-500 text-yellow-400',
  low: 'bg-blue-500/20 border-blue-500 text-blue-400',
} as const;

// ============================================
// Main Component
// ============================================

export function RuleDraftViewer({
  draft,
  showMaker = false,
  compact = false,
}: RuleDraftViewerProps) {
  const [isExpanded, setIsExpanded] = useState(!compact);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-matrix-green font-mono">{'>'}_</span>
          <h3 className="text-matrix-green font-mono font-semibold">
            RULE DRAFT
          </h3>
        </div>
        {compact && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-matrix-dark hover:text-matrix-green text-sm font-mono transition-colors"
          >
            [{isExpanded ? 'COLLAPSE' : 'EXPAND'}]
          </button>
        )}
      </div>

      {/* Content */}
      <div
        className={`border border-matrix-dark overflow-hidden ${
          isExpanded ? 'block' : 'hidden'
        }`}
      >
        {/* Event Title */}
        {draft.eventTitle && (
          <div className="p-4 border-b border-matrix-dark bg-matrix-green/5">
            <p className="text-xs text-matrix-dark mb-1 font-mono">EVENT TITLE</p>
            <p className="text-matrix-green font-mono font-medium text-lg">
              {draft.eventTitle}
            </p>
          </div>
        )}

        {/* Core Metrics */}
        <div className="p-4 space-y-4">
          <RuleField
            label="OBSERVATION TARGET"
            value={draft.observationTarget}
            mono
          />
          <RuleField
            label="METRIC TYPE"
            value={draft.metricType}
            mono
          />
          <RuleField
            label="THRESHOLD VALUE"
            value={draft.threshold}
            highlight
          />
          {draft.observationWindow && (
            <RuleField
              label="OBSERVATION TIME WINDOW"
              value={draft.observationWindow}
              mono
            />
          )}
        </div>

        {/* Data Sources */}
        <div className="p-4 border-t border-matrix-dark bg-matrix-dark/10">
          <div className="grid md:grid-cols-2 gap-4">
            <RuleField
              label="PRIMARY DATA SOURCE"
              value={draft.primaryDataSource}
              mono
              small
            />
            <RuleField
              label="BACKUP DATA SOURCE"
              value={draft.backupDataSource}
              mono
              small
            />
          </div>
        </div>

        {/* Conditions */}
        <div className="p-4 space-y-4">
          {/* Through Conditions */}
          <ConditionSection
            title="THROUGH CONDITIONS"
            subtitle="What makes it TRUE"
            conditions={draft.throughConditions}
            variant="success"
          />

          {/* Fail Conditions */}
          <ConditionSection
            title="FAIL CONDITIONS"
            subtitle="What makes it FALSE"
            conditions={draft.failConditions}
            variant="danger"
          />

          {/* Invalid Conditions */}
          <ConditionSection
            title="INVALID CONDITIONS"
            subtitle="When observation is invalid"
            conditions={draft.invalidConditions}
            variant="warning"
          />
        </div>

        {/* Maker Agent */}
        {showMaker && draft.makerAgent && (
          <div className="p-4 border-t border-matrix-dark bg-matrix-dark/10">
            <div className="flex items-center justify-between">
              <span className="text-xs text-matrix-dark font-mono">MAKER AGENT</span>
              <span className="text-matrix-green font-mono text-sm">
                {draft.makerAgent.slice(0, 8)}...{draft.makerAgent.slice(-6)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Compact Summary */}
      {compact && !isExpanded && (
        <div className="border border-matrix-dark p-4">
          <div className="flex items-center gap-4 text-sm font-mono">
            <span className="text-matrix-green">{draft.metricType}</span>
            <span className="text-matrix-dark">-</span>
            <span className="text-matrix-green">{draft.threshold}</span>
            <span className="text-matrix-dark">-</span>
            <span className="text-matrix-dim">{draft.observationTarget}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// Helper Components
// ============================================

interface RuleFieldProps {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
  small?: boolean;
}

function RuleField({
  label,
  value,
  mono = false,
  highlight = false,
  small = false,
}: RuleFieldProps) {
  return (
    <div className={small ? 'text-sm' : ''}>
      <p className="text-xs text-matrix-dark mb-1 font-mono uppercase">{label}</p>
      <p
        className={`font-mono ${
          highlight
            ? 'text-matrix-green text-lg font-semibold'
            : 'text-matrix-green'
        } ${small ? 'text-sm' : ''}`}
      >
        {value}
      </p>
    </div>
  );
}

interface ConditionSectionProps {
  title: string;
  subtitle: string;
  conditions: string[];
  variant: 'success' | 'danger' | 'warning';
}

function ConditionSection({
  title,
  subtitle,
  conditions,
  variant,
}: ConditionSectionProps) {
  const borderColor = {
    success: 'border-matrix-green',
    danger: 'border-red-500',
    warning: 'border-yellow-500',
  }[variant];

  const bgColor = {
    success: 'bg-matrix-green/5',
    danger: 'bg-red-500/5',
    warning: 'bg-yellow-500/5',
  }[variant];

  const textColor = {
    success: 'text-matrix-green',
    danger: 'text-red-400',
    warning: 'text-yellow-400',
  }[variant];

  const bulletColor = {
    success: 'text-matrix-green',
    danger: 'text-red-400',
    warning: 'text-yellow-400',
  }[variant];

  return (
    <div className={`border ${borderColor} ${bgColor}`}>
      <div className="p-3 border-b border-matrix-dark/50">
        <div className="flex items-center gap-2">
          <span className={`font-mono font-semibold text-sm ${textColor}`}>
            {title}
          </span>
        </div>
        <p className="text-xs text-matrix-dark font-mono mt-1">{subtitle}</p>
      </div>
      <div className="p-3 space-y-2">
        {conditions.map((condition, index) => (
          <div key={index} className="flex items-start gap-2">
            <span className={`${bulletColor} mt-0.5`}>[{String(index + 1).padStart(2, '0')}]</span>
            <span className="text-matrix-dim font-mono text-sm">{condition}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default RuleDraftViewer;
