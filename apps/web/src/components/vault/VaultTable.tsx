'use client';

import React from 'react';
import Link from 'next/link';
import { StatusBadge } from '../ui/Badge';

interface VaultTableProps {
  vaults: VaultSummary[];
  sortBy?: 'createdAt' | 'stakeAmount' | 'agentCount';
  sortOrder?: 'asc' | 'desc';
  onSort?: (field: 'createdAt' | 'stakeAmount' | 'agentCount') => void;
}

interface VaultSummary {
  id: string;
  title: string;
  status: string;
  stakeAmount: string;
  agentCount: number;
  criteriaCount: number;
  createdAt: string;
  transactionHash?: string;
}

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).toUpperCase();
};

const formatRelativeTime = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'TODAY';
  if (diffDays === 1) return 'YESTERDAY';
  if (diffDays < 7) return `${diffDays} DAYS AGO`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} WEEKS AGO`;
  return `${Math.floor(diffDays / 30)} MONTHS AGO`;
};

function SortIcon({ field, currentSort, sortOrder }: { field: string; currentSort?: string; sortOrder?: 'asc' | 'desc' }) {
  const isActive = field === currentSort;
  return (
    <span className={`ml-1 inline-block ${isActive ? 'text-white' : 'text-white/30'}`}>
      {isActive && sortOrder === 'desc' ? '▼' : isActive && sortOrder === 'asc' ? '▲' : '▽'}
    </span>
  );
}

export function VaultTable({
  vaults,
  sortBy,
  sortOrder = 'desc',
  onSort,
}: VaultTableProps) {
  const handleSort = (field: 'createdAt' | 'stakeAmount' | 'agentCount') => {
    if (onSort) {
      onSort(field);
    }
  };

  if (vaults.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 rounded-full border border-white/20 flex items-center justify-center mx-auto mb-4">
          <span className="text-white/40 text-2xl font-mono">[]</span>
        </div>
        <p className="text-white/60 font-mono">NO VAULTS FOUND</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto min-w-[600px]">
      <table className="w-full text-sm font-mono">
        <thead>
          <tr className="border-b border-white/10 bg-white/5">
            <th className="text-left p-4 text-white/60 font-normal">VAULT</th>
            <th 
              className="text-left p-4 text-white/60 font-normal cursor-pointer hover:text-white transition-colors"
              onClick={() => handleSort('createdAt')}
            >
              CREATED
              <SortIcon field="createdAt" currentSort={sortBy} sortOrder={sortOrder} />
            </th>
            <th 
              className="text-right p-4 text-white/60 font-normal cursor-pointer hover:text-white transition-colors"
              onClick={() => handleSort('stakeAmount')}
            >
              STAKE
              <SortIcon field="stakeAmount" currentSort={sortBy} sortOrder={sortOrder} />
            </th>
            <th className="text-center p-4 text-white/60 font-normal">STATUS</th>
            <th 
              className="text-center p-4 text-white/60 font-normal cursor-pointer hover:text-white transition-colors"
              onClick={() => handleSort('agentCount')}
            >
              AGENTS
              <SortIcon field="agentCount" currentSort={sortBy} sortOrder={sortOrder} />
            </th>
            <th className="text-center p-4 text-white/60 font-normal">CRITERIA</th>
            <th className="text-left p-4 text-white/60 font-normal">TX</th>
          </tr>
        </thead>
        <tbody>
          {vaults.map((vault, index) => (
            <tr
              key={vault.id}
              className={`
                border-b border-white/5 
                hover:bg-white/5 
                cursor-pointer 
                transition-colors
                ${index % 2 === 1 ? 'bg-white/[0.02]' : ''}
              `}
              onClick={() => window.location.href = `/vaults/${vault.id}`}
            >
              <td className="p-4">
                <div className="max-w-xs">
                  <p className="text-white font-medium hover:text-white/80 transition-colors truncate">
                    {vault.title}
                  </p>
                </div>
              </td>
              <td className="p-4">
                <div className="text-white/60 text-xs">
                  <p>{formatDate(vault.createdAt)}</p>
                  <p className="text-white/40">{formatRelativeTime(vault.createdAt)}</p>
                </div>
              </td>
              <td className="p-4 text-right">
                <span className="text-white font-bold">
                  {Number(vault.stakeAmount).toLocaleString()} OKB
                </span>
              </td>
              <td className="p-4 text-center">
                <StatusBadge status={vault.status} />
              </td>
              <td className="p-4 text-center">
                <div className="flex items-center justify-center gap-1">
                  <span className="text-white/80">{vault.agentCount}</span>
                  <span className="text-white/40 text-xs">AGENTS</span>
                </div>
              </td>
              <td className="p-4 text-center">
                <span className="text-white/60">{vault.criteriaCount} CRITERIA</span>
              </td>
              <td className="p-4">
                {vault.transactionHash ? (
                  <a
                    href={`https://www.oklink.com/xlayer/tx/${vault.transactionHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-white/40 hover:text-white text-xs transition-colors"
                  >
                    {vault.transactionHash.slice(0, 8)}...
                  </a>
                ) : (
                  <span className="text-white/20">-</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function VaultTableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="overflow-x-auto min-w-[600px]">
      <table className="w-full text-sm font-mono">
        <thead>
          <tr className="border-b border-white/10 bg-white/5">
            <th className="text-left p-4 text-white/60 font-normal">VAULT</th>
            <th className="text-left p-4 text-white/60 font-normal">CREATED</th>
            <th className="text-right p-4 text-white/60 font-normal">STAKE</th>
            <th className="text-center p-4 text-white/60 font-normal">STATUS</th>
            <th className="text-center p-4 text-white/60 font-normal">AGENTS</th>
            <th className="text-center p-4 text-white/60 font-normal">CRITERIA</th>
            <th className="text-left p-4 text-white/60 font-normal">TX</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, index) => (
            <tr
              key={index}
              className={`border-b border-white/5 ${index % 2 === 1 ? 'bg-white/[0.02]' : ''}`}
            >
              <td className="p-4">
                <div className="h-4 w-48 bg-white/10 rounded animate-pulse" />
              </td>
              <td className="p-4">
                <div className="h-4 w-24 bg-white/10 rounded animate-pulse" />
              </td>
              <td className="p-4">
                <div className="h-4 w-20 bg-white/10 rounded animate-pulse ml-auto" />
              </td>
              <td className="p-4">
                <div className="h-5 w-16 bg-white/10 rounded animate-pulse mx-auto" />
              </td>
              <td className="p-4">
                <div className="h-4 w-8 bg-white/10 rounded animate-pulse mx-auto" />
              </td>
              <td className="p-4">
                <div className="h-4 w-16 bg-white/10 rounded animate-pulse mx-auto" />
              </td>
              <td className="p-4">
                <div className="h-4 w-12 bg-white/10 rounded animate-pulse" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default VaultTable;
