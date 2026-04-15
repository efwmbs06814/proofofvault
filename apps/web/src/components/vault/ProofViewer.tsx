'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle } from '../ui/Card';

// ============================================
// Types
// ============================================

export interface ProofViewerProps {
  proof: {
    content: string;
    dataSources: string[];
    calculations: string;
    proofHash: string;
    submittedBy: string;
    submittedAt: string;
    result?: 'TRUE' | 'FALSE' | 'INVALID';
    reason?: string;
  };
  expanded?: boolean;
}

// ============================================
// Constants
// ============================================

const SOURCE_ICONS: Record<string, string> = {
  'chainlink': '#',
  'uniswap': '!',
  'coingecko': '$',
  'etherscan': '>',
  'openSea': '*',
  'theGraph': '@',
  'default': '+',
};

const RESULT_CONFIG = {
  TRUE: {
    label: 'TRUE',
    color: 'text-matrix-green border-matrix-green',
    bgColor: 'bg-matrix-green/10',
  },
  FALSE: {
    label: 'FALSE',
    color: 'text-red-400 border-red-500',
    bgColor: 'bg-red-500/10',
  },
  INVALID: {
    label: 'INVALID',
    color: 'text-yellow-400 border-yellow-500',
    bgColor: 'bg-yellow-500/10',
  },
};

// ============================================
// Component
// ============================================

export function ProofViewer({ proof, expanded = false }: ProofViewerProps) {
  const [isExpanded, setIsExpanded] = useState(expanded);
  const [copiedHash, setCopiedHash] = useState(false);

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).toUpperCase();
  };

  const copyHash = async () => {
    await navigator.clipboard.writeText(proof.proofHash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  const getSourceIcon = (source: string) => {
    const lowerSource = source.toLowerCase();
    for (const [key, icon] of Object.entries(SOURCE_ICONS)) {
      if (lowerSource.includes(key)) return icon;
    }
    return SOURCE_ICONS.default;
  };

  return (
    <Card padding="none" className="overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-matrix-dark bg-black/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-matrix-green text-lg">{'>'}_</span>
            <div>
              <h3 className="text-sm font-mono text-matrix-green">PROOF VERIFICATION</h3>
              <p className="text-xs text-matrix-dark">
                BY: {truncateAddress(proof.submittedBy)} | {formatDate(proof.submittedAt)}
              </p>
            </div>
          </div>
          
          {/* Result Badge */}
          {proof.result && (
            <div className={`px-3 py-1 border ${RESULT_CONFIG[proof.result].color.split(' ')[0]} ${RESULT_CONFIG[proof.result].bgColor}`}>
              <span className={`text-sm font-bold font-mono ${RESULT_CONFIG[proof.result].color.split(' ')[0]}`}>
                {proof.result}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Proof Hash */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-matrix-dark font-mono">PROOF HASH</p>
            <button
              onClick={copyHash}
              className="text-xs font-mono text-matrix-dim hover:text-matrix-green transition-colors"
            >
              {copiedHash ? '[ COPIED! ]' : '[ COPY ]'}
            </button>
          </div>
          <div className="p-3 border border-matrix-dark bg-black/80 flex items-center gap-2">
            <span className="text-matrix-green">#</span>
            <code className="text-xs font-mono text-matrix-green break-all">
              {proof.proofHash}
            </code>
          </div>
        </div>

        {/* Verification Status */}
        <div className="flex items-center gap-4 p-3 border border-matrix-dark bg-black/30">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-matrix-green animate-pulse" />
            <span className="text-xs font-mono text-matrix-green">VERIFIED</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-matrix-green" />
            <span className="text-xs font-mono text-matrix-dim">ON-CHAIN</span>
          </div>
        </div>

        {/* Content/Reason */}
        {proof.content && (
          <div>
            <p className="text-xs text-matrix-dark mb-2 font-mono">CONTENT</p>
            <div className="p-4 border border-matrix-dark bg-black/50 text-sm font-mono text-matrix-dim whitespace-pre-wrap">
              {proof.content}
            </div>
          </div>
        )}

        {/* Reason (if different from content) */}
        {proof.reason && proof.reason !== proof.content && (
          <div>
            <p className="text-xs text-matrix-dark mb-2 font-mono">REASON</p>
            <div className="p-4 border border-matrix-dark bg-black/50 text-sm font-mono text-matrix-dim whitespace-pre-wrap">
              {proof.reason}
            </div>
          </div>
        )}

        {/* Data Sources */}
        {proof.dataSources && proof.dataSources.length > 0 && (
          <div>
            <p className="text-xs text-matrix-dark mb-2 font-mono">DATA SOURCES ({proof.dataSources.length})</p>
            <div className="border border-matrix-dark bg-black/30">
              {proof.dataSources.map((source, index) => (
                <div
                  key={index}
                  className={`
                    flex items-center gap-3 p-3 
                    ${index !== proof.dataSources.length - 1 ? 'border-b border-matrix-dark' : ''}
                  `}
                >
                  <span className="text-matrix-green text-sm">{getSourceIcon(source)}</span>
                  <div className="flex-1">
                    <span className="text-sm font-mono text-matrix-dim">{source}</span>
                  </div>
                  <span className="text-xs text-matrix-dark">VERIFIED</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Calculations */}
        {proof.calculations && (
          <div>
            <p className="text-xs text-matrix-dark mb-2 font-mono">CALCULATIONS</p>
            <pre className="p-4 border border-matrix-dark bg-black/80 text-xs font-mono text-matrix-dim overflow-x-auto whitespace-pre-wrap">
              {proof.calculations}
            </pre>
          </div>
        )}

        {/* Expand/Collapse for long content */}
        {(proof.content?.length > 300 || proof.calculations?.length > 300) && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full py-2 border border-matrix-dark text-matrix-dim hover:text-matrix-green hover:border-matrix-green transition-colors text-xs font-mono"
          >
            {isExpanded ? '[ COLLAPSE ]' : '[ EXPAND ALL ]'}
          </button>
        )}
      </div>
    </Card>
  );
}

export default ProofViewer;
