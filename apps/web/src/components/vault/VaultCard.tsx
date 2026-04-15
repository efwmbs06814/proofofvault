'use client';

import React from 'react';
import Link from 'next/link';
import { Card } from '../ui/Card';
import { StatusBadge } from '../ui/Badge';

// ============================================
// Types
// ============================================

interface VaultCardProps {
  id: string;
  title: string;
  description?: string;
  status: string;
  stakeAmount: string;
  agentCount: number;
  stakedCount?: number;
  criteriaCount: number;
  createdAt: string;
  transactionHash?: string;
  onClick?: () => void;
}

interface VaultCardListProps {
  vaults: VaultCardProps[];
  emptyMessage?: string;
}

// ============================================
// Constants
// ============================================

const EMPTY_STATE_ICON = '[]';

// ============================================
// Components
// ============================================

export function VaultCard({
  id,
  title,
  description,
  status,
  stakeAmount,
  agentCount,
  stakedCount,
  criteriaCount,
  createdAt,
  transactionHash,
}: VaultCardProps) {
  return (
    <Link href={`/vaults/${id}`}>
      <Card hover className="group">
        <Header title={title} status={status} createdAt={createdAt} />
        {description && <Description text={description} />}
        <MetaData
          stakeAmount={stakeAmount}
          agentCount={agentCount}
          stakedCount={stakedCount}
          criteriaCount={criteriaCount}
        />
        {transactionHash && <TransactionLink hash={transactionHash} />}
      </Card>
    </Link>
  );
}

export function VaultCardList({ vaults, emptyMessage = 'NO VAULTS FOUND' }: VaultCardListProps) {
  if (vaults.length === 0) {
    return (
      <div className="text-center py-12">
        <EmptyState icon={EMPTY_STATE_ICON} message={emptyMessage} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {vaults.map((vault) => (
        <VaultCard key={vault.id} {...vault} />
      ))}
    </div>
  );
}

// ============================================
// Sub-Components
// ============================================

function Header({ title, status, createdAt }: { title: string; status: string; createdAt: string }) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div className="flex-1">
        <h3 className="text-lg font-mono font-semibold mb-1 text-matrix-green group-hover:text-white transition-colors">
          {title}
        </h3>
        <p className="text-xs text-matrix-dark font-mono">
          CREATED: {new Date(createdAt).toLocaleDateString('en-US').toUpperCase()}
        </p>
      </div>
      <StatusBadge status={status} />
    </div>
  );
}

function Description({ text }: { text: string }) {
  return <p className="text-matrix-dim text-sm mb-4 font-mono line-clamp-2">{text}</p>;
}

function MetaData({ stakeAmount, agentCount, stakedCount, criteriaCount }: {
  stakeAmount: string;
  agentCount: number;
  stakedCount?: number;
  criteriaCount: number;
}) {
  return (
    <div className="flex flex-wrap gap-4 text-xs font-mono">
      <MetaItem icon="$" value={`${stakeAmount} OKB`} />
      <MetaItem icon="@" value={`${stakedCount !== undefined ? `${stakedCount}/` : ''}${agentCount} AGENTS`} />
      <MetaItem icon="#" value={`${criteriaCount} CRITERIA`} />
    </div>
  );
}

function MetaItem({ icon, value }: { icon: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-matrix-dim">
      <span className="text-matrix-green">{icon}</span>
      <span>{value}</span>
    </div>
  );
}

function TransactionLink({ hash }: { hash: string }) {
  return (
    <div className="mt-4 pt-4 border-t border-matrix-dark">
      <a
        href={`https://www.oklink.com/xlayer/tx/${hash}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="inline-flex items-center gap-2 text-xs text-matrix-green font-mono hover:text-white transition-colors"
      >
        <span>{'>'}_</span>
        VIEW ON-CHAIN TX
      </a>
    </div>
  );
}

function EmptyState({ icon, message }: { icon: string; message: string }) {
  return (
    <>
      <div className="w-16 h-16 rounded-full border border-matrix-dark flex items-center justify-center mx-auto mb-4">
        <span className="text-matrix-dark text-2xl font-mono">{icon}</span>
      </div>
      <p className="text-matrix-dark font-mono">{message}</p>
    </>
  );
}

export default VaultCard;
