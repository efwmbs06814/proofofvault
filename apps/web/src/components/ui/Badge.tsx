'use client';

import React from 'react';

// ============================================
// Types
// ============================================

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'gold';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  className?: string;
  pulse?: boolean;
}

// ============================================
// Constants
// ============================================

const variantStyles: Record<BadgeVariant, string> = {
  default: 'border-matrix-dark text-matrix-dark bg-transparent',
  success: 'border-matrix-green text-matrix-green bg-matrix-green/10',
  warning: 'border-yellow-500 text-yellow-400 bg-yellow-500/10',
  danger: 'border-red-500 text-red-400 bg-red-500/10',
  info: 'border-blue-500 text-blue-400 bg-blue-500/10',
  gold: 'border-matrix-green text-matrix-green bg-matrix-green/10',
};

const sizeStyles: Record<'sm' | 'md', string> = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-3 py-1 text-sm',
};

const statusConfig: Record<string, { label: string; variant: BadgeVariant }> = {
  Draft: { label: '[DRAFT]', variant: 'default' },
  PendingReview: { label: '[PENDING]', variant: 'warning' },
  Active: { label: '[ACTIVE]', variant: 'success' },
  Resolving: { label: '[RESOLVING]', variant: 'info' },
  ResolvedTrue: { label: '[VERIFIED]', variant: 'success' },
  ResolvedFalse: { label: '[REJECTED]', variant: 'danger' },
  ResolvedInvalid: { label: '[INVALID]', variant: 'warning' },
  approved: { label: '[APPROVED]', variant: 'success' },
  rejected: { label: '[REJECTED]', variant: 'danger' },
  pending: { label: '[PENDING]', variant: 'warning' },
  idle: { label: '[IDLE]', variant: 'default' },
  reviewing: { label: '[REVIEWING]', variant: 'info' },
  slash: { label: '[SLASHED]', variant: 'danger' },
};

const pulseStatuses = ['PendingReview', 'Active', 'Resolving', 'pending'];

const resultConfig: Record<'TRUE' | 'FALSE' | 'INVALID', { variant: BadgeVariant; label: string }> = {
  TRUE: { variant: 'success', label: 'VERIFIED' },
  FALSE: { variant: 'danger', label: 'REJECTED' },
  INVALID: { variant: 'warning', label: 'INVALID' },
};

// ============================================
// Components
// ============================================

export function Badge({
  children,
  variant = 'default',
  size = 'md',
  className = '',
  pulse = false,
}: BadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 border font-mono font-medium ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}>
      {pulse && <PulseIndicator />}
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] || { label: `[${status.toUpperCase()}]`, variant: 'default' as BadgeVariant };
  const isPulse = pulseStatuses.includes(status);

  return (
    <Badge variant={config.variant} pulse={isPulse}>
      {config.label}
    </Badge>
  );
}

export function ResolutionBadge({ result }: { result: 'TRUE' | 'FALSE' | 'INVALID' }) {
  const config = resultConfig[result];

  return (
    <Badge variant={config.variant} size="md">
      {result}{" // "}{config.label}
    </Badge>
  );
}

// ============================================
// Helper Components
// ============================================

function PulseIndicator() {
  return (
    <span className="relative flex h-2 w-2">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75" />
      <span className="relative inline-flex rounded-full h-2 w-2 bg-current" />
    </span>
  );
}

export default Badge;
