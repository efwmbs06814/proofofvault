'use client';

import React from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';

// ============================================
// Types
// ============================================

export interface FinalResultDisplayProps {
  result: 'TRUE' | 'FALSE' | 'INVALID';
  reason: string;
  vaultTitle: string;
  stakeAmount: string;
  chainTx?: string;
  finalizedAt?: string;
  finalizedBy?: string;
  setterAddress?: string;
  onClaim?: () => void;
}

// ============================================
// Constants
// ============================================

const RESULT_CONFIG = {
  TRUE: {
    label: 'TRUE',
    title: 'VERIFIED',
    subtitle: 'SETTER CAN CLAIM',
    color: 'text-matrix-green',
    bgColor: 'bg-matrix-green',
    borderColor: 'border-matrix-green',
    glowColor: 'rgba(0, 255, 65, 0.5)',
    badge: 'CLAIM',
    particleClass: 'particle-true',
  },
  FALSE: {
    label: 'FALSE',
    title: 'REJECTED',
    subtitle: 'TO COMPENSATION POOL',
    color: 'text-red-400',
    bgColor: 'bg-red-500',
    borderColor: 'border-red-500',
    glowColor: 'rgba(239, 68, 68, 0.5)',
    badge: 'POOL',
    particleClass: 'particle-false',
  },
  INVALID: {
    label: 'INVALID',
    title: 'INVALID',
    subtitle: 'REFUND INITIATED',
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500',
    borderColor: 'border-yellow-500',
    glowColor: 'rgba(234, 179, 8, 0.5)',
    badge: 'REFUND',
    particleClass: 'particle-invalid',
  },
};

function getMessage(result: 'TRUE' | 'FALSE' | 'INVALID', stakeAmount: string): string {
  switch (result) {
    case 'TRUE': return `${stakeAmount} OKB available for claiming`;
    case 'FALSE': return `${stakeAmount} OKB redistributed to verifiers`;
    case 'INVALID': return `${stakeAmount} OKB refunded to setter`;
  }
}

// ============================================
// Component
// ============================================

export function FinalResultDisplay({
  result,
  reason,
  vaultTitle,
  stakeAmount,
  chainTx,
  finalizedAt,
  finalizedBy,
  setterAddress,
  onClaim,
}: FinalResultDisplayProps) {
  const config = RESULT_CONFIG[result];
  const isTrue = result === 'TRUE';
  const now = finalizedAt || new Date().toISOString();

  const truncateAddress = (address: string) => {
    if (address.length <= 12) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).toUpperCase();
  };

  return (
    <div className="relative w-full">
      {/* Particle Effect Background */}
      <div className={`absolute inset-0 overflow-hidden pointer-events-none ${config.particleClass}`}>
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 rounded-full animate-float-particle"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 5}s`,
              backgroundColor: config.glowColor,
            }}
          />
        ))}
      </div>

      {/* Main Card */}
      <Card
        className={`
          relative overflow-hidden
          border-2 ${config.borderColor}
        `}
        padding="lg"
      >
        {/* Glow Effect */}
        <div
          className="absolute inset-0 opacity-20 pointer-events-none"
          style={{
            boxShadow: `inset 0 0 60px ${config.glowColor}`,
          }}
        />

        {/* Content */}
        <div className="relative z-10">
          {/* Big Result Badge */}
          <div className="text-center mb-8">
            {/* Decorative Corners */}
            <div className="inline-block relative">
              <div className={`absolute -top-2 -left-2 w-8 h-8 border-t-2 border-l-2 ${config.borderColor}`} />
              <div className={`absolute -top-2 -right-2 w-8 h-8 border-t-2 border-r-2 ${config.borderColor}`} />
              <div className={`absolute -bottom-2 -left-2 w-8 h-8 border-b-2 border-l-2 ${config.borderColor}`} />
              <div className={`absolute -bottom-2 -right-2 w-8 h-8 border-b-2 border-r-2 ${config.borderColor}`} />

              {/* Result Text */}
              <div className={`px-12 py-6 ${config.borderColor} border-2 bg-black/80`}>
                <div className={`text-6xl md:text-7xl font-bold font-mono ${config.color} matrix-glow-strong`}>
                  {config.label}
                </div>
                <div className={`text-xl md:text-2xl font-mono mt-2 ${config.color} opacity-80`}>
                  [{config.title}]
                </div>
              </div>
            </div>
          </div>

          {/* Subtitle */}
          <div className="text-center mb-8">
            <div className={`inline-flex items-center gap-3 px-6 py-3 border-2 ${config.borderColor} bg-black/50`}>
              <span className={`text-2xl ${config.color}`}>
                {isTrue ? '>' : result === 'FALSE' ? '!' : '#'}
              </span>
              <span className={`text-xl font-mono font-semibold ${config.color}`}>
                {config.subtitle}
              </span>
              <Badge variant={isTrue ? 'success' : result === 'FALSE' ? 'danger' : 'warning'}>
                [{config.badge}]
              </Badge>
            </div>
          </div>

          {/* Message */}
          <div className={`text-center mb-8 p-4 border ${config.borderColor} border-opacity-30 bg-black/30`}>
            <p className="text-lg font-mono text-matrix-dim">
              {getMessage(result, stakeAmount)}
            </p>
          </div>

          {/* Details Grid */}
          <div className="grid md:grid-cols-2 gap-4 mb-8">
            {/* Reason */}
            <div className={`p-4 border ${config.borderColor} border-opacity-30 bg-black/30`}>
              <p className="text-xs text-matrix-dark mb-2 font-mono">FINALIZATION REASON</p>
              <p className="text-sm font-mono text-matrix-dim">{reason}</p>
            </div>

            {/* Vault Stake */}
            <div className={`p-4 border ${config.borderColor} border-opacity-30 bg-black/30`}>
              <p className="text-xs text-matrix-dark mb-2 font-mono">VAULT STAKE</p>
              <p className="text-2xl font-mono font-bold text-matrix-green">{stakeAmount} OKB</p>
            </div>
          </div>

          {/* Chain Info */}
          <div className={`p-4 border ${config.borderColor} border-opacity-30 bg-black/30 mb-6`}>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-matrix-dark mb-1 font-mono">FINALIZED AT</p>
                <p className="text-sm font-mono text-matrix-green">
                  {formatDate(now)}
                </p>
              </div>
              {finalizedBy && (
                <div>
                  <p className="text-xs text-matrix-dark mb-1 font-mono">FINALIZER</p>
                  <p className="text-sm font-mono text-matrix-green">
                    {truncateAddress(finalizedBy)}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Chain Transaction */}
          {chainTx && (
            <div className={`p-4 border ${config.borderColor} border-opacity-30 bg-black/30 mb-6`}>
              <p className="text-xs text-matrix-dark mb-2 font-mono">CHAIN TRANSACTION</p>
              <div className="flex items-center justify-between">
                <code className="text-sm font-mono text-matrix-green break-all">
                  {chainTx}
                </code>
                <a
                  href={`https://www.oklink.com/xlayer/tx/${chainTx}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-4 shrink-0 px-3 py-1 border border-matrix-green text-matrix-green hover:bg-matrix-green hover:text-black transition-colors text-xs font-mono"
                >
                  [VIEW]
                </a>
              </div>
            </div>
          )}

          {/* Setter Address */}
          <div className={`p-4 border ${config.borderColor} border-opacity-30 bg-black/30 mb-6`}>
            <p className="text-xs text-matrix-dark mb-2 font-mono">SETTER ADDRESS</p>
            <div className="flex items-center justify-between">
              <code className="text-sm font-mono text-matrix-green break-all">
                {setterAddress || '0x0000000000000000000000000000000000000000'}
              </code>
              {setterAddress && (
                <button
                  onClick={() => navigator.clipboard.writeText(setterAddress)}
                  className="ml-4 shrink-0 px-3 py-1 border border-matrix-dark text-matrix-dark hover:border-matrix-green hover:text-matrix-green transition-colors text-xs font-mono"
                >
                  [COPY]
                </button>
              )}
            </div>
          </div>

          {/* Vault Title */}
          {vaultTitle && (
            <div className={`p-4 border ${config.borderColor} border-opacity-30 bg-black/30 mb-6`}>
              <p className="text-xs text-matrix-dark mb-2 font-mono">VAULT</p>
              <p className="text-sm font-mono text-matrix-green">{vaultTitle}</p>
            </div>
          )}

          {/* Claim Button (TRUE only) */}
          {isTrue && onClaim && (
            <div className="text-center pt-4 border-t border-matrix-dark">
              <Button
                onClick={onClaim}
                size="lg"
                className="min-w-[200px]"
              >
                [ CLAIM {stakeAmount} OKB ]
              </Button>
              <p className="mt-3 text-xs text-matrix-dark font-mono">
                Claim will initiate on-chain transaction
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* CSS for particle animations */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes float-particle {
          0%, 100% {
            transform: translateY(0) scale(1);
            opacity: 0.3;
          }
          50% {
            transform: translateY(-20px) scale(1.5);
            opacity: 0.8;
          }
        }

        .animate-float-particle {
          animation: float-particle 3s ease-in-out infinite;
        }

        .particle-true::before {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          width: 200px;
          height: 200px;
          background: radial-gradient(circle, rgba(0, 255, 65, 0.3) 0%, transparent 70%);
          transform: translate(-50%, -50%);
          animation: pulse-glow 2s ease-in-out infinite;
        }

        .particle-false::before {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          width: 200px;
          height: 200px;
          background: radial-gradient(circle, rgba(239, 68, 68, 0.3) 0%, transparent 70%);
          transform: translate(-50%, -50%);
          animation: pulse-glow 2s ease-in-out infinite;
        }

        .particle-invalid::before {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          width: 200px;
          height: 200px;
          background: radial-gradient(circle, rgba(234, 179, 8, 0.3) 0%, transparent 70%);
          transform: translate(-50%, -50%);
          animation: pulse-glow 2s ease-in-out infinite;
        }

        @keyframes pulse-glow {
          0%, 100% {
            transform: translate(-50%, -50%) scale(1);
            opacity: 0.3;
          }
          50% {
            transform: translate(-50%, -50%) scale(1.5);
            opacity: 0.5;
          }
        }
      `}} />
    </div>
  );
}

function Badge({ variant, children }: { variant: 'success' | 'danger' | 'warning'; children: React.ReactNode }) {
  const variantStyles = {
    success: 'bg-matrix-green/10 text-matrix-green border-matrix-green',
    danger: 'bg-red-500/10 text-red-400 border-red-500',
    warning: 'bg-yellow-500/10 text-yellow-400 border-yellow-500',
  };

  return (
    <span className={`inline-flex items-center px-2 py-0.5 border text-xs font-mono ${variantStyles[variant]}`}>
      {children}
    </span>
  );
}

export default FinalResultDisplay;
