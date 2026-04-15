'use client';

import React from 'react';

// ============================================
// Types
// ============================================

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

interface LoadingProps {
  text?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

interface SkeletonProps {
  className?: string;
}

interface SkeletonCardProps {
  lines?: number;
}

interface SkeletonListProps {
  count?: number;
}

interface PageLoadingProps {
  fullScreen?: boolean;
}

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
  className?: string;
}

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

// ============================================
// Constants
// ============================================

const sizeStyles: Record<NonNullable<SpinnerProps['size']>, string> = {
  sm: 'w-4 h-4',
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
};

// ============================================
// Components
// ============================================

export function Spinner({ size = 'md', className = '' }: SpinnerProps) {
  return (
    <svg className={`animate-spin ${sizeStyles[size]} ${className}`} viewBox="0 0 24 24" fill="none" style={{ filter: 'drop-shadow(0 0 5px #00ff41)' }}>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}

export function Loading({ text = 'INITIALIZING...', size = 'md', className = '' }: LoadingProps) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 ${className}`}>
      <Spinner size={size} className="text-matrix-green" />
      <p className="text-matrix-green font-mono text-sm" style={{ textShadow: '0 0 5px #00ff41' }}>{text}</p>
    </div>
  );
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return <div className={`animate-pulse bg-matrix-dark rounded ${className}`} />;
}

export function SkeletonCard({ lines = 3 }: SkeletonCardProps) {
  return (
    <div className="p-6 bg-black border border-matrix-dark space-y-4">
      <Skeleton className="h-6 w-3/4" />
      <Skeleton className="h-4 w-full" />
      {Array.from({ length: lines - 1 }).map((_, i) => (
        <Skeleton key={i} className="h-4 w-2/3" />
      ))}
      <div className="flex gap-2 pt-2">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
      </div>
    </div>
  );
}

export function SkeletonList({ count = 5 }: SkeletonListProps) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export function PageLoading({ fullScreen = true }: PageLoadingProps) {
  if (fullScreen) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loading size="lg" text="LOADING SYSTEM..." />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center py-12">
      <Loading text="PROCESSING..." />
    </div>
  );
}

export function ErrorState({ message = 'SYSTEM ERROR - RETRY', onRetry, className = '' }: ErrorStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 ${className}`}>
      <div className="w-16 h-16 rounded-full border-2 border-red-500 flex items-center justify-center mb-4">
        <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      </div>
      <p className="text-red-500 mb-4 font-mono">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 border border-matrix-green text-matrix-green font-mono hover:bg-matrix-green hover:text-black transition-all"
        >
          RETRY
        </button>
      )}
    </div>
  );
}

export function EmptyState({ icon, title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 text-center ${className}`}>
      <div className="w-16 h-16 rounded-full border border-matrix-dark flex items-center justify-center mb-4 text-matrix-dark">
        {icon || <DefaultEmptyIcon />}
      </div>
      <h3 className="text-lg font-medium font-mono text-matrix-green mb-2" style={{ textShadow: '0 0 5px #00ff41' }}>
        {title}
      </h3>
      {description && <p className="text-matrix-dark mb-4 font-mono text-sm max-w-md">{description}</p>}
      {action}
    </div>
  );
}

function DefaultEmptyIcon() {
  return (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
    </svg>
  );
}

export default Loading;