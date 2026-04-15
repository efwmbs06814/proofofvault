'use client';

import React, { useState } from 'react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

// ============================================
// Types
// ============================================

export interface ValidatorCardProps {
  validator: {
    id: string;
    walletAddress: string;
    result?: 'TRUE' | 'FALSE' | 'INVALID';
    status: 'pending' | 'committed' | 'revealed' | 'audited';
    commitHash?: string;
    reason?: string;
    proofHash?: string;
    dataSources?: string[];
    calculations?: string;
    auditorVerdict?: 'valid' | 'questionable' | 'invalid' | 'malicious';
    auditorComment?: string;
  };
  isCurrentUser?: boolean;
  isAuditor?: boolean;
  onReveal?: () => void;
  onAudit?: (verdict: 'valid' | 'questionable' | 'invalid' | 'malicious') => void;
  showAuditPanel?: boolean;
}

// ============================================
// Constants
// ============================================

const RESULT_CONFIG = {
  TRUE: {
    label: 'TRUE',
    color: 'text-matrix-green border-matrix-green bg-matrix-green/10',
    description: 'VERIFIED',
  },
  FALSE: {
    label: 'FALSE',
    color: 'text-red-400 border-red-500 bg-red-500/10',
    description: 'REJECTED',
  },
  INVALID: {
    label: 'INVALID',
    color: 'text-yellow-400 border-yellow-500 bg-yellow-500/10',
    description: 'CANNOT VERIFY',
  },
};

const STATUS_CONFIG = {
  pending: {
    label: 'PENDING',
    color: 'text-matrix-dark border-matrix-dark',
    icon: '...',
  },
  committed: {
    label: 'COMMITTED',
    color: 'text-yellow-400 border-yellow-500',
    icon: '#',
  },
  revealed: {
    label: 'REVEALED',
    color: 'text-blue-400 border-blue-500',
    icon: '!',
  },
  audited: {
    label: 'AUDITED',
    color: 'text-purple-400 border-purple-500',
    icon: '*',
  },
};

const VERDICT_CONFIG = {
  valid: {
    label: 'VALID',
    color: 'text-matrix-green bg-matrix-green/10 border-matrix-green',
  },
  questionable: {
    label: 'QUESTIONABLE',
    color: 'text-yellow-400 bg-yellow-400/10 border-yellow-500',
  },
  invalid: {
    label: 'INVALID',
    color: 'text-red-400 bg-red-500/10 border-red-500',
  },
  malicious: {
    label: 'MALICIOUS',
    color: 'text-red-600 bg-red-600/10 border-red-600',
  },
};

// ============================================
// Component
// ============================================

export function ValidatorCard({
  validator,
  isCurrentUser = false,
  isAuditor = false,
  onReveal,
  onAudit,
  showAuditPanel = false,
}: ValidatorCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedVerdict, setSelectedVerdict] = useState<'valid' | 'questionable' | 'invalid' | 'malicious' | ''>('');
  const [auditComment, setAuditComment] = useState('');

  const statusConfig = STATUS_CONFIG[validator.status];
  const hasResult = !!validator.result;
  const resultConfig = validator.result ? RESULT_CONFIG[validator.result] : null;

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const handleSubmitAudit = () => {
    if (selectedVerdict && onAudit) {
      onAudit(selectedVerdict);
    }
  };

  return (
    <Card
      className={`
        relative overflow-hidden transition-all duration-300
        ${isCurrentUser ? 'border-matrix-green ring-1 ring-matrix-green/30' : ''}
        ${validator.status === 'committed' ? 'border-yellow-500/50' : ''}
        ${validator.status === 'revealed' && validator.result ? resultConfig?.color.split(' ')[1] : ''}
      `}
      padding="none"
    >
      {/* Current User Indicator */}
      {isCurrentUser && (
        <div className="absolute top-0 right-0 px-2 py-0.5 bg-matrix-green text-black text-xs font-mono">
          [YOU]
        </div>
      )}

      {/* Main Content */}
      <div className="p-4">
        {/* Header Row */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            {/* Avatar Placeholder */}
            <div className="w-10 h-10 border border-matrix-dark bg-black flex items-center justify-center">
              <span className="text-matrix-green text-sm font-mono">
                {validator.walletAddress.slice(2, 4).toUpperCase()}
              </span>
            </div>
            <div>
              <p className="text-sm font-mono text-matrix-green">
                {truncateAddress(validator.walletAddress)}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <Badge
                  variant={validator.status === 'pending' ? 'default' :
                          validator.status === 'committed' ? 'warning' :
                          validator.status === 'revealed' ? 'info' : 'gold'}
                  size="sm"
                  pulse={validator.status === 'committed'}
                >
                  {statusConfig.icon} {statusConfig.label}
                </Badge>
              </div>
            </div>
          </div>

          {/* Result Badge (after reveal) */}
          {hasResult && resultConfig && (
            <div className={`px-3 py-1 border ${resultConfig.color.split(' ')[0]} ${resultConfig.color.split(' ')[1]} bg-opacity-10`}>
              <span className={`text-sm font-bold font-mono ${resultConfig.color.split(' ')[0]}`}>
                {resultConfig.label}
              </span>
            </div>
          )}
        </div>

        {/* Commit Hash (if committed) */}
        {validator.status === 'committed' && validator.commitHash && (
          <div className="mb-3 p-2 border border-matrix-dark bg-black/50">
            <p className="text-xs text-matrix-dark mb-1">COMMIT HASH</p>
            <p className="text-xs font-mono text-yellow-400 break-all">
              {validator.commitHash.slice(0, 16)}...
            </p>
          </div>
        )}

        {/* Revealed Content Preview */}
        {validator.status === 'revealed' && validator.reason && (
          <div className="mb-3">
            <p className="text-xs text-matrix-dark mb-1">REASON</p>
            <p className="text-sm text-matrix-dim line-clamp-2">{validator.reason}</p>
          </div>
        )}

        {/* Auditor Verdict */}
        {validator.auditorVerdict && (
          <div className={`mt-3 p-2 border ${VERDICT_CONFIG[validator.auditorVerdict].color.split(' ')[0]} ${VERDICT_CONFIG[validator.auditorVerdict].color.split(' ')[1]}/30`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono">AUDITOR VERDICT:</span>
              <Badge variant={validator.auditorVerdict === 'valid' ? 'success' :
                             validator.auditorVerdict === 'questionable' ? 'warning' : 'danger'}
                     size="sm">
                {VERDICT_CONFIG[validator.auditorVerdict].label}
              </Badge>
            </div>
            {validator.auditorComment && (
              <p className="text-xs text-matrix-dim mt-1">{validator.auditorComment}</p>
            )}
          </div>
        )}

        {/* Expand/Collapse Button */}
        {validator.status !== 'pending' && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full mt-3 py-2 border border-matrix-dark text-matrix-dim hover:text-matrix-green hover:border-matrix-green transition-colors text-xs font-mono"
          >
            {isExpanded ? '[ COLLAPSE DETAILS ]' : '[ VIEW FULL PROOF ]'}
          </button>
        )}

        {/* Expanded Content */}
        {isExpanded && (
          <div className="mt-4 pt-4 border-t border-matrix-dark space-y-4 animate-fade-in">
            {/* Proof Hash */}
            {validator.proofHash && (
              <div>
                <p className="text-xs text-matrix-dark mb-1">PROOF HASH</p>
                <div className="p-2 border border-matrix-dark bg-black/50 flex items-center justify-between">
                  <code className="text-xs font-mono text-matrix-green break-all">
                    {validator.proofHash}
                  </code>
                  <button
                    onClick={() => navigator.clipboard.writeText(validator.proofHash!)}
                    className="ml-2 text-matrix-dim hover:text-matrix-green text-xs"
                  >
                    [COPY]
                  </button>
                </div>
              </div>
            )}

            {/* Data Sources */}
            {validator.dataSources && validator.dataSources.length > 0 && (
              <div>
                <p className="text-xs text-matrix-dark mb-2">DATA SOURCES</p>
                <div className="space-y-1">
                  {validator.dataSources.map((source, index) => (
                    <div key={index} className="flex items-center gap-2 text-xs">
                      <span className="text-matrix-green">+</span>
                      <span className="text-matrix-dim">{source}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Calculations */}
            {validator.calculations && (
              <div>
                <p className="text-xs text-matrix-dark mb-2">CALCULATIONS</p>
                <pre className="p-3 border border-matrix-dark bg-black/50 text-xs font-mono text-matrix-dim overflow-x-auto">
                  {validator.calculations}
                </pre>
              </div>
            )}

            {/* Reason */}
            {validator.reason && (
              <div>
                <p className="text-xs text-matrix-dark mb-2">REASON</p>
                <div className="p-3 border border-matrix-dark bg-black/50 text-sm font-mono text-matrix-dim">
                  {validator.reason}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        {validator.status === 'committed' && isCurrentUser && onReveal && (
          <div className="mt-4 pt-4 border-t border-matrix-dark">
            <Button onClick={onReveal} fullWidth size="sm">
              [ REVEAL RESULT ]
            </Button>
          </div>
        )}

        {/* Audit Panel */}
        {showAuditPanel && isAuditor && validator.status === 'revealed' && !validator.auditorVerdict && (
          <div className="mt-4 pt-4 border-t border-matrix-dark space-y-3">
            <p className="text-xs text-matrix-dark font-mono">AUDIT THIS SUBMISSION</p>
            
            {/* Verdict Buttons */}
            <div className="grid grid-cols-2 gap-2">
              {(['valid', 'questionable', 'invalid', 'malicious'] as const).map((verdict) => (
                <button
                  key={verdict}
                  onClick={() => setSelectedVerdict(verdict)}
                  className={`
                    py-2 px-3 border text-xs font-mono transition-all
                    ${selectedVerdict === verdict 
                      ? `${VERDICT_CONFIG[verdict].color.split(' ')[0]} ${VERDICT_CONFIG[verdict].color.split(' ')[1]} bg-opacity-20` 
                      : 'border-matrix-dark text-matrix-dark hover:border-matrix-dim'}
                  `}
                >
                  {VERDICT_CONFIG[verdict].label}
                </button>
              ))}
            </div>

            {/* Comment */}
            <textarea
              value={auditComment}
              onChange={(e) => setAuditComment(e.target.value)}
              placeholder="Add comment (optional)..."
              rows={2}
              className="w-full px-3 py-2 bg-black border border-matrix-dark text-matrix-green font-mono text-xs resize-none focus:border-matrix-green focus:outline-none placeholder:text-matrix-dark"
            />

            <Button
              onClick={handleSubmitAudit}
              disabled={!selectedVerdict}
              size="sm"
              fullWidth
            >
              [ SUBMIT AUDIT ]
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

export default ValidatorCard;
