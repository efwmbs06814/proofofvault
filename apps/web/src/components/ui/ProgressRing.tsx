'use client';

/**
 * ProgressRing 圆形进度环组件
 * 用于显示声誉/进度等数值
 */

import React from 'react';

// ============================================
// Types
// ============================================

interface ProgressRingProps {
  /** 当前值 (0-100) */
  value: number;
  /** 圆环尺寸 (px) */
  size?: number;
  /** 描边宽度 (px) */
  strokeWidth?: number;
  /** 中心标签文本 */
  label?: string;
  /** 是否显示数值 */
  showValue?: boolean;
  /** 颜色主题 */
  color?: 'green' | 'yellow' | 'red' | 'purple';
  /** 自定义类名 */
  className?: string;
  /** 是否显示动画 */
  animated?: boolean;
}

// ============================================
// Constants
// ============================================

const colorConfig = {
  green: {
    stroke: '#00FF41',
    glow: 'rgba(0, 255, 65, 0.5)',
    text: 'text-matrix-green',
  },
  yellow: {
    stroke: '#EAB308',
    glow: 'rgba(234, 179, 8, 0.5)',
    text: 'text-yellow-400',
  },
  red: {
    stroke: '#EF4444',
    glow: 'rgba(239, 68, 68, 0.5)',
    text: 'text-red-400',
  },
  purple: {
    stroke: '#A855F7',
    glow: 'rgba(168, 85, 247, 0.5)',
    text: 'text-purple-400',
  },
};

// ============================================
// Components
// ============================================

export function ProgressRing({
  value,
  size = 120,
  strokeWidth = 10,
  label,
  showValue = true,
  color = 'green',
  className = '',
  animated = true,
}: ProgressRingProps) {
  const percentage = Math.min(Math.max(value, 0), 100);
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;
  const config = colorConfig[color];

  const getAutoColor = (val: number): typeof colorConfig.green => {
    if (val >= 70) return colorConfig.green;
    if (val >= 30) return colorConfig.yellow;
    return colorConfig.red;
  };

  const displayConfig = color === 'green' && percentage < 70
    ? getAutoColor(percentage)
    : config;

  const textSize = size >= 100 ? 'text-2xl' : size >= 80 ? 'text-xl' : 'text-lg';

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <svg
        width={size}
        height={size}
        className="transform -rotate-90"
      >
        <defs>
          <filter id={`glow-${color}`}>
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          className="text-matrix-dark"
        />

        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={displayConfig.stroke}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          filter={`url(#glow-${color})`}
          className={animated ? 'transition-all duration-500 ease-out' : ''}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {showValue && (
          <span className={`font-mono font-bold ${textSize} ${displayConfig.text}`}>
            {percentage.toFixed(0)}
          </span>
        )}
        {showValue && (
          <span className="font-mono text-xs text-matrix-dim">%</span>
        )}
        {label && (
          <span className="font-mono text-xs text-matrix-dim mt-1 text-center px-2">
            {label}
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================
// Reputation Ring Variant
// ============================================

interface ReputationRingProps {
  score: number;
  size?: number;
  showLabel?: boolean;
  className?: string;
}

export function ReputationRing({
  score,
  size = 100,
  showLabel = true,
  className = '',
}: ReputationRingProps) {
  const getReputationColor = (score: number): 'green' | 'yellow' | 'red' => {
    if (score >= 70) return 'green';
    if (score >= 40) return 'yellow';
    return 'red';
  };

  const label = score >= 70 ? 'HIGH' : score >= 40 ? 'MED' : 'LOW';

  return (
    <ProgressRing
      value={score}
      size={size}
      strokeWidth={8}
      label={showLabel ? label : undefined}
      showValue={true}
      color={getReputationColor(score)}
      className={className}
    />
  );
}

// ============================================
// Gauge Ring Variant
// ============================================

interface GaugeRingProps {
  value: number;
  max?: number;
  size?: number;
  label?: string;
  className?: string;
}

export function GaugeRing({
  value,
  max = 100,
  size = 100,
  label,
  className = '',
}: GaugeRingProps) {
  const percentage = (value / max) * 100;

  return (
    <ProgressRing
      value={percentage}
      size={size}
      strokeWidth={6}
      label={label}
      showValue={true}
      color="green"
      className={className}
    />
  );
}

// ============================================
// Mini Ring (compact version)
// ============================================

interface MiniRingProps {
  value: number;
  size?: number;
  className?: string;
}

export function MiniRing({
  value,
  size = 32,
  className = '',
}: MiniRingProps) {
  const percentage = Math.min(Math.max(value, 0), 100);
  const strokeWidth = Math.max(3, size / 8);
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  const getColor = (val: number) => {
    if (val >= 70) return '#00FF41';
    if (val >= 30) return '#EAB308';
    return '#EF4444';
  };

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <svg
        width={size}
        height={size}
        className="transform -rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          className="text-matrix-dark/30"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={getColor(percentage)}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-300"
        />
      </svg>
      <span className="absolute font-mono text-[10px] font-bold text-matrix-green">
        {percentage.toFixed(0)}
      </span>
    </div>
  );
}

export default ProgressRing;
