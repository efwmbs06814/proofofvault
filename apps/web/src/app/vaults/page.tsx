'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { getVaults, VaultSummary, VaultStatus } from '@/lib/api/vault';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/Badge';
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/Loading';
import { VaultCard, VaultCardList } from '@/components/vault/VaultCard';
import { ConnectButton } from '@/components/ui/Wallet';
import { Logo } from '@/components/ui/Logo';

type FilterStatus = VaultStatus | 'all';

const statusConfig: Record<VaultStatus, { label: string; color: string }> = {
  Draft: { label: '[DRAFT]', color: 'text-matrix-dark' },
  PendingReview: { label: '[PENDING]', color: 'text-yellow-400' },
  Active: { label: '[ACTIVE]', color: 'text-matrix-green' },
  Resolving: { label: '[RESOLVING]', color: 'text-purple-400' },
  ResolvedTrue: { label: '[VERIFIED]', color: 'text-matrix-green' },
  ResolvedFalse: { label: '[REJECTED]', color: 'text-red-400' },
  ResolvedInvalid: { label: '[INVALID]', color: 'text-orange-400' },
};

export default function VaultsPageV2() {
  const [vaults, setVaults] = useState<VaultSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const loadVaults = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = filter === 'all' ? {} : { status: filter };
      const response = await getVaults(query);
      setVaults(response.items);
    } catch (err) {
      console.error('Failed to load vaults:', err);
      setError(err instanceof Error ? err.message : 'Failed to load vaults.');
      setVaults([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadVaults();
  }, [loadVaults]);

  const filteredVaults = vaults.filter(v => {
    const matchesFilter = filter === 'all' || v.status === filter;
    const matchesSearch = !searchQuery || 
      v.title.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const stats = {
    total: vaults.length,
    active: vaults.filter(v => v.status === 'Active' || v.status === 'PendingReview').length,
    resolvedTrue: vaults.filter(v => v.status === 'ResolvedTrue').length,
    resolvedFalse: vaults.filter(v => v.status === 'ResolvedFalse').length,
  };

  return (
    <main className="min-h-screen bg-black text-matrix-green font-mono">
      {/* Header */}
      <header className="border-b border-matrix-dark sticky top-0 z-40 bg-black/90 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <Logo size={32} variant="image" color="white" />
            <span className="font-mono text-lg font-bold text-matrix-green">PROOF OF VAULT</span>
          </Link>
          <div className="flex items-center gap-4">
            <ConnectButton />
            <Link
              href="/vaults/create"
              className="px-4 py-2 border border-matrix-green text-matrix-green hover:bg-matrix-green hover:text-black transition-all text-sm font-mono"
              style={{ boxShadow: '0 0 10px rgba(0, 255, 65, 0.3)' }}
            >
              [ CREATE ]
            </Link>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Title & Stats */}
        <div className="mb-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold mb-2 text-matrix-green" style={{ textShadow: '0 0 10px #00ff41' }}>
                {'// ALL VAULTS'}
              </h1>
              <p className="text-sm text-matrix-dark">Browse and manage verification requests</p>
            </div>
            
            <div className="flex gap-4 font-mono text-xs">
              <div className="px-4 py-2 border border-matrix-dark text-center">
                <p className="text-lg font-bold text-matrix-green">{stats.total}</p>
                <p className="text-matrix-dark">TOTAL</p>
              </div>
              <div className="px-4 py-2 border border-matrix-dark text-center">
                <p className="text-lg font-bold text-yellow-400">{stats.active}</p>
                <p className="text-matrix-dark">ACTIVE</p>
              </div>
              <div className="px-4 py-2 border border-matrix-dark text-center">
                <p className="text-lg font-bold text-matrix-green">{stats.resolvedTrue}</p>
                <p className="text-matrix-dark">VERIFIED</p>
              </div>
              <div className="px-4 py-2 border border-matrix-dark text-center">
                <p className="text-lg font-bold text-red-400">{stats.resolvedFalse}</p>
                <p className="text-matrix-dark">REJECTED</p>
              </div>
            </div>
          </div>

          {/* Search & Filter */}
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-matrix-green">{'>'}</span>
              <input
                type="text"
                placeholder="SEARCH VAULTS..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-black border border-matrix-dark text-matrix-green font-mono text-sm focus:border-matrix-green focus:outline-none transition-colors placeholder:text-matrix-dark"
              />
            </div>
            
            <div className="flex flex-wrap gap-2 font-mono text-xs">
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-2 border transition-colors ${
                  filter === 'all'
                    ? 'border-matrix-green text-matrix-green bg-matrix-green/10'
                    : 'border-matrix-dark text-matrix-dark hover:border-matrix-green hover:text-matrix-green'
                }`}
              >
                ALL
              </button>
              {Object.entries(statusConfig).map(([status, config]) => (
                <button
                  key={status}
                  onClick={() => setFilter(status as VaultStatus)}
                  className={`px-3 py-2 border transition-colors ${
                    filter === status
                      ? 'border-matrix-green text-matrix-green bg-matrix-green/10'
                      : 'border-matrix-dark text-matrix-dark hover:border-matrix-green hover:text-matrix-green'
                  }`}
                >
                  {config.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 border border-red-500 text-red-400 font-mono text-sm flex items-center gap-3">
            <span>!</span>
            {error}
          </div>
        )}

        {/* Loading State */}
        {loading && <SkeletonList count={3} />}

        {/* Vault List */}
        {!loading && (
          <>
            {filteredVaults.length > 0 ? (
              <VaultCardList
                vaults={filteredVaults.map(v => ({
                  ...v,
                  stakedCount: v.agentCount,
                }))}
              />
            ) : (
              <EmptyState
                title={searchQuery ? '[NO MATCHES]' : '[NO VAULTS]'}
                description={searchQuery ? 'Try different search terms' : 'Create your first vault to get started'}
                action={
                  !searchQuery && (
                    <Link href="/vaults/create">
                      <Button>[ CREATE VAULT ]</Button>
                    </Link>
                  )
                }
              />
            )}
          </>
        )}

        {/* Load More */}
        {filteredVaults.length > 0 && filteredVaults.length >= 10 && (
          <div className="mt-8 text-center">
            <Button variant="secondary">[ LOAD MORE ]</Button>
          </div>
        )}
      </div>
    </main>
  );
}
