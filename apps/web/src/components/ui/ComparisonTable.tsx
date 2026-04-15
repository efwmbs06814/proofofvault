'use client';

import React from 'react';

// ============================================
// Types
// ============================================

export interface ComparisonRow {
  feature: string;
  pov?: string | boolean;
  alternatives?: Record<string, string | boolean>;
}

export interface ComparisonTableProps {
  title: string;
  headers: string[];
  rows: ComparisonRow[];
  highlightColumn?: string;
  showPOVColumn?: boolean;
}

// ============================================
// Icons
// ============================================

function CheckIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function CrossIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

// ============================================
// Cell Renderer
// ============================================

function CellContent({ value, isHighlight }: { value: string | boolean | undefined; isHighlight: boolean }) {
  if (value === undefined || value === null) {
    return <span className="text-matrix-dark">—</span>;
  }

  if (typeof value === 'boolean') {
    return value ? (
      <span className={`inline-flex items-center justify-center ${isHighlight ? 'text-white' : 'text-matrix-green'}`}>
        <CheckIcon />
      </span>
    ) : (
      <span className="inline-flex items-center justify-center text-red-500">
        <CrossIcon />
      </span>
    );
  }

  return (
    <span className={`text-sm ${isHighlight ? 'text-white font-medium' : 'text-matrix-dim'}`}>
      {value}
    </span>
  );
}

// ============================================
// Component
// ============================================

export function ComparisonTable({
  title,
  headers,
  rows,
  highlightColumn,
  showPOVColumn = true,
}: ComparisonTableProps) {
  const povIndex = showPOVColumn ? 1 : 0;

  return (
    <div className="w-full overflow-hidden">
      {/* Title */}
      <h3 className="text-xl font-mono font-bold text-white mb-6">{title}</h3>

      {/* Table Container */}
      <div className="responsive-table-container border border-matrix-dark">
        <table className="w-full font-mono">
          {/* Header */}
          <thead>
            <tr className="border-b border-matrix-dark">
              <th className="px-4 py-3 text-left text-xs font-semibold text-matrix-dark uppercase tracking-wider bg-black sticky top-0">
                Feature
              </th>
              {headers.map((header, index) => (
                <th
                  key={index}
                  className={`
                    px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider
                    bg-black sticky top-0
                    ${showPOVColumn && index === 0 ? 'text-matrix-green' : 'text-matrix-dim'}
                    ${highlightColumn === header || (showPOVColumn && index === 0) ? 'bg-matrix-dark/20' : ''}
                  `}
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>

          {/* Body */}
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className={`
                  border-b border-matrix-dark/50 transition-colors duration-200
                  hover:bg-matrix-dark/10
                  ${rowIndex % 2 === 0 ? 'bg-black' : 'bg-black/50'}
                `}
              >
                {/* Feature Name */}
                <td className="px-4 py-4 text-sm text-matrix-dim">
                  {row.feature}
                </td>

                {/* POV Column (always first if shown) */}
                {showPOVColumn && (
                  <td className="px-4 py-4 text-center bg-matrix-dark/20">
                    <div className="flex justify-center">
                      <CellContent value={row.pov} isHighlight={true} />
                    </div>
                  </td>
                )}

                {/* Alternative Columns */}
                {headers.slice(showPOVColumn ? 1 : 0).map((header, altIndex) => {
                  const altValue = row.alternatives?.[header];
                  return (
                    <td key={altIndex} className="px-4 py-4 text-center">
                      <div className="flex justify-center">
                        <CellContent value={altValue} isHighlight={false} />
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-4 text-xs text-matrix-dark font-mono">
        <div className="flex items-center gap-2">
          <span className="text-matrix-green"><CheckIcon /></span>
          <span>Supported / Available</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-red-500"><CrossIcon /></span>
          <span>Not Supported / Unavailable</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-matrix-dark">—</span>
          <span>Varies / Partial</span>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Pre-built Comparison Templates
// ============================================

export const PROTOCOL_COMPARISON_ROWS: ComparisonRow[] = [
  {
    feature: 'Decentralized Verification',
    pov: true,
    alternatives: {
      'Traditional Insurance': false,
      'Prediction Markets': true,
      'Oracle Services': 'Partial',
    },
  },
  {
    feature: 'Multi-Agent Consensus',
    pov: true,
    alternatives: {
      'Traditional Insurance': false,
      'Prediction Markets': false,
      'Oracle Services': false,
    },
  },
  {
    feature: 'Stake-Based Security',
    pov: true,
    alternatives: {
      'Traditional Insurance': false,
      'Prediction Markets': true,
      'Oracle Services': 'Partial',
    },
  },
  {
    feature: 'Instant Settlement',
    pov: true,
    alternatives: {
      'Traditional Insurance': false,
      'Prediction Markets': true,
      'Oracle Services': 'Partial',
    },
  },
  {
    feature: 'Transparent Criteria',
    pov: true,
    alternatives: {
      'Traditional Insurance': false,
      'Prediction Markets': true,
      'Oracle Services': true,
    },
  },
  {
    feature: 'No Central Authority',
    pov: true,
    alternatives: {
      'Traditional Insurance': false,
      'Prediction Markets': true,
      'Oracle Services': 'Partial',
    },
  },
  {
    feature: 'Automatic Execution',
    pov: true,
    alternatives: {
      'Traditional Insurance': false,
      'Prediction Markets': true,
      'Oracle Services': true,
    },
  },
  {
    feature: 'Human Appeal Process',
    pov: true,
    alternatives: {
      'Traditional Insurance': true,
      'Prediction Markets': false,
      'Oracle Services': false,
    },
  },
];

export default ComparisonTable;
