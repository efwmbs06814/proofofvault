'use client';

/**
 * Skeleton Components
 * Matrix-themed loading skeleton components with animated pulse effects
 */

import React from 'react';

// ============================================
// Types
// ============================================

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'card' | 'table-row' | 'avatar';
  lines?: number;
}

// ============================================
// Constants
// ============================================

const SKELETON_BASE_CLASSES = 'animate-pulse bg-matrix-dark rounded font-mono';

const VARIANT_CLASSES = {
  text: 'h-4 w-full',
  card: 'h-32 w-full',
  'table-row': 'h-12 w-full',
  avatar: 'w-10 h-10 rounded-full',
};

// ============================================
// Main Component
// ============================================

/**
 * Basic skeleton component with variants
 */
export function Skeleton({ className = '', variant = 'text', lines = 1 }: SkeletonProps) {
  if (variant === 'avatar') {
    return <div className={`${SKELETON_BASE_CLASSES} ${VARIANT_CLASSES.avatar} ${className}`} />;
  }

  if (variant === 'card') {
    return <SkeletonCard className={className} />;
  }

  if (variant === 'table-row') {
    return <SkeletonTableRow className={className} />;
  }

  // Default: text variant with multiple lines
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={`${SKELETON_BASE_CLASSES} ${VARIANT_CLASSES.text}`}
          style={{
            animationDelay: `${i * 100}ms`,
            width: i === lines - 1 && lines > 1 ? '60%' : '100%',
          }}
        />
      ))}
    </div>
  );
}

// ============================================
// Vault Card Skeleton
// ============================================

/**
 * Skeleton loader for VaultCard component
 */
export function VaultCardSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`p-6 border border-matrix-dark bg-black ${className}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1 space-y-2">
          <div className={`${SKELETON_BASE_CLASSES} h-6 w-3/4`} />
          <div className={`${SKELETON_BASE_CLASSES} h-3 w-1/3`} />
        </div>
        <div className={`${SKELETON_BASE_CLASSES} w-20 h-6`} />
      </div>

      {/* Description */}
      <div className="mb-4 space-y-2">
        <div className={`${SKELETON_BASE_CLASSES} h-4 w-full`} />
        <div className={`${SKELETON_BASE_CLASSES} h-4 w-2/3`} />
      </div>

      {/* Meta */}
      <div className="flex gap-4">
        <div className={`${SKELETON_BASE_CLASSES} h-4 w-20`} />
        <div className={`${SKELETON_BASE_CLASSES} h-4 w-24`} />
        <div className={`${SKELETON_BASE_CLASSES} h-4 w-20`} />
      </div>

      {/* Transaction Link */}
      <div className={`mt-4 pt-4 border-t border-matrix-dark ${SKELETON_BASE_CLASSES} h-3 w-32`} />
    </div>
  );
}

// ============================================
// Agent Card Skeleton
// ============================================

/**
 * Skeleton loader for AgentCard component
 */
export function AgentCardSkeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`p-6 border border-matrix-dark bg-black ${className}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`${SKELETON_BASE_CLASSES} w-10 h-10 rounded-full`} />
          <div className="space-y-2">
            <div className={`${SKELETON_BASE_CLASSES} h-4 w-24`} />
            <div className={`${SKELETON_BASE_CLASSES} h-3 w-32`} />
          </div>
        </div>
        <div className={`${SKELETON_BASE_CLASSES} w-16 h-5`} />
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between mb-4">
        <div className={`${SKELETON_BASE_CLASSES} h-4 w-28`} />
        <div className={`${SKELETON_BASE_CLASSES} w-12 h-12 rounded-full`} />
      </div>

      {/* Results Preview */}
      <div className="mb-4 p-3 border border-matrix-dark space-y-2">
        <div className="flex items-center justify-between">
          <div className={`${SKELETON_BASE_CLASSES} h-3 w-16`} />
          <div className={`${SKELETON_BASE_CLASSES} h-3 w-12`} />
        </div>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className={`${SKELETON_BASE_CLASSES} w-6 h-6`} />
          ))}
        </div>
      </div>

      {/* Results List */}
      <div className="space-y-2 mb-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-start gap-2">
            <div className={`${SKELETON_BASE_CLASSES} w-5 h-5`} />
            <div className={`${SKELETON_BASE_CLASSES} h-4 flex-1`} style={{ width: `${70 + i * 5}%` }} />
          </div>
        ))}
      </div>

      {/* Action Button */}
      <div className={`${SKELETON_BASE_CLASSES} h-10 w-full`} />
    </div>
  );
}

// ============================================
// Table Row Skeleton
// ============================================

/**
 * Skeleton loader for table rows
 */
export function TableRowSkeleton({
  columns = 4,
  className = '',
}: {
  columns?: number;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-4 p-4 border-b border-matrix-dark ${className}`}>
      {Array.from({ length: columns }).map((_, i) => {
        const widths = ['w-1/4', 'w-1/3', 'w-1/2', 'w-1/4', 'w-16', 'w-20'];
        return (
          <div
            key={i}
            className={`${SKELETON_BASE_CLASSES} h-4 ${widths[i] || 'w-1/4'}`}
          />
        );
      })}
    </div>
  );
}

// ============================================
// List Skeleton
// ============================================

/**
 * Generic list skeleton with custom item renderer
 */
export function ListSkeleton({
  count = 5,
  className = '',
  renderItem,
}: {
  count?: number;
  className?: string;
  renderItem?: (index: number) => React.ReactNode;
}) {
  return (
    <div className={`space-y-4 ${className}`}>
      {Array.from({ length: count }).map((_, i) =>
        renderItem ? (
          <React.Fragment key={i}>{renderItem(i)}</React.Fragment>
        ) : (
          <SkeletonCard key={i} />
        )
      )}
    </div>
  );
}

// ============================================
// Card Skeleton (Internal)
// ============================================

function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`p-6 border border-matrix-dark bg-black ${className}`}>
      <div className="space-y-4">
        <div className={`${SKELETON_BASE_CLASSES} h-6 w-3/4`} />
        <div className={`${SKELETON_BASE_CLASSES} h-4 w-full`} />
        <div className={`${SKELETON_BASE_CLASSES} h-4 w-2/3`} />
        <div className="flex gap-2 pt-2">
          <div className={`${SKELETON_BASE_CLASSES} h-8 w-20`} />
          <div className={`${SKELETON_BASE_CLASSES} h-8 w-20`} />
        </div>
      </div>
    </div>
  );
}

// ============================================
// Table Row Skeleton (Internal)
// ============================================

function SkeletonTableRow({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-4 p-4 border border-matrix-dark bg-black ${className}`}>
      <div className={`${SKELETON_BASE_CLASSES} w-8 h-8 rounded-full`} />
      <div className={`${SKELETON_BASE_CLASSES} h-4 flex-1`} />
      <div className={`${SKELETON_BASE_CLASSES} h-4 w-24`} />
      <div className={`${SKELETON_BASE_CLASSES} h-4 w-20`} />
      <div className={`${SKELETON_BASE_CLASSES} h-8 w-16`} />
    </div>
  );
}

export default Skeleton;
