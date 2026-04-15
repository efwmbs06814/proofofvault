'use client';

import React from 'react';
import { Card, CardHeader, CardTitle } from '../ui/Card';

// ============================================
// Types
// ============================================

interface VaultInfoCardProps {
  stakeAmount: string;
  setupDeposit: string;
  resolutionTime?: string;
  resolutionTimeRemaining?: number;
  committee: {
    makers: number;
    verifiers: number;
    validators: number;
    auditors: number;
  };
  dataSources: string[];
  escrowAddress?: string;
  createdAt: string;
  setter: string;
  className?: string;
}

// ============================================
// Main Component
// ============================================

export function VaultInfoCard({
  stakeAmount,
  setupDeposit,
  resolutionTime,
  resolutionTimeRemaining,
  committee,
  dataSources,
  escrowAddress,
  createdAt,
  setter,
  className = '',
}: VaultInfoCardProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle icon={<span className="text-matrix-green">{'//'}</span>}>VAULT PARAMETERS</CardTitle>
      </CardHeader>

      <div className="space-y-4">
        {/* Primary Info Grid */}
        <div className="grid grid-cols-2 gap-3">
          <InfoItem 
            label="STAKE AMOUNT" 
            value={stakeAmount} 
            unit="OKB"
            highlight 
          />
          <InfoItem 
            label="SETUP DEPOSIT" 
            value={setupDeposit} 
            unit="OKB"
          />
        </div>

        {/* Resolution Time with Countdown */}
        {(resolutionTime || resolutionTimeRemaining != null) && (
          <InfoItem 
            label="RESOLUTION TIME" 
            value={resolutionTimeRemaining != null ? formatTimeRemaining(resolutionTimeRemaining) : (resolutionTime || '')}
            isCountdown={resolutionTimeRemaining != null}
          />
        )}

        {/* Committee Composition */}
        <CommitteeDisplay committee={committee} />

        {/* Data Sources */}
        {dataSources && dataSources.length > 0 && (
          <div className="space-y-2">
            <span className="text-xs text-matrix-dark font-mono">DATA SOURCES</span>
            <div className="space-y-1">
              {dataSources.map((source, i) => (
                <DataSourceItem key={i} source={source} index={i} />
              ))}
            </div>
          </div>
        )}

        {/* Escrow Address */}
        {escrowAddress && (
          <div className="pt-4 border-t border-matrix-dark space-y-2">
            <span className="text-xs text-matrix-dark font-mono">X LAYER ESCROW</span>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-matrix-green break-all">{escrowAddress}</span>
              <button 
                onClick={() => navigator.clipboard.writeText(escrowAddress)}
                className="shrink-0 px-2 py-1 border border-matrix-dark text-matrix-dark hover:text-matrix-green hover:border-matrix-green transition-colors text-xs font-mono"
              >
                COPY
              </button>
            </div>
          </div>
        )}

        {/* Meta Info */}
        <div className="pt-4 border-t border-matrix-dark grid grid-cols-2 gap-4 text-xs font-mono">
          <div>
            <span className="text-matrix-dark">CREATED</span>
            <p className="text-matrix-dim mt-1">{formatDate(createdAt)}</p>
          </div>
          <div>
            <span className="text-matrix-dark">SETTER</span>
            <p className="text-matrix-dim mt-1 truncate">{truncateAddress(setter)}</p>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ============================================
// Sub-Components
// ============================================

interface InfoItemProps {
  label: string;
  value: string;
  unit?: string;
  highlight?: boolean;
  isCountdown?: boolean;
}

function InfoItem({ label, value, unit, highlight, isCountdown }: InfoItemProps) {
  return (
    <div className={`p-3 border ${highlight ? 'border-matrix-green bg-matrix-green/5' : 'border-matrix-dark'}`}>
      <p className="text-xs text-matrix-dark mb-1 font-mono">{label}</p>
      <p className={`font-medium font-mono ${highlight ? 'text-matrix-green' : 'text-matrix-dim'} ${isCountdown ? 'text-yellow-400' : ''}`}>
        {value}
        {unit && <span className="text-matrix-dark ml-1">{unit}</span>}
      </p>
    </div>
  );
}

function CommitteeDisplay({ committee }: { committee: VaultInfoCardProps['committee'] }) {
  const { makers, verifiers, validators, auditors } = committee;
  const total = makers + verifiers + validators + auditors;

  return (
    <div className="space-y-2">
      <span className="text-xs text-matrix-dark font-mono">COMMITTEE</span>
      
      <div className="grid grid-cols-2 gap-2">
        {(makers > 0 || verifiers > 0) && (
          <CommitteeSlot label="RULE" count={`${makers} Maker + ${verifiers} Verifier`} />
        )}
        {(validators > 0 || auditors > 0) && (
          <CommitteeSlot label="RESOLUTION" count={`${validators} Validator + ${auditors} Auditor`} />
        )}
      </div>

      <div className="text-xs text-matrix-dark font-mono">
        TOTAL: {total} AGENTS
      </div>
    </div>
  );
}

function CommitteeSlot({ label, count }: { label: string; count: string }) {
  return (
    <div className="p-2 border border-matrix-dark bg-black/50">
      <p className="text-xs text-matrix-dark mb-1">{label}</p>
      <p className="text-sm text-matrix-green font-mono">{count}</p>
    </div>
  );
}

function DataSourceItem({ source, index }: { source: string; index: number }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-matrix-green font-mono text-xs">{index + 1}.</span>
      <span className="text-xs text-matrix-dim font-mono">{source}</span>
    </div>
  );
}

// ============================================
// Helper Functions
// ============================================

function formatTimeRemaining(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
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

function truncateAddress(address: string, length: number = 10): string {
  if (!address) return '-';
  if (address.length <= length * 2 + 2) return address;
  return `${address.slice(0, length)}...${address.slice(-length)}`;
}

// ============================================
// Default Export
// ============================================

export default VaultInfoCard;
