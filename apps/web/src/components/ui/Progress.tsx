'use client';

import React from 'react';

// ============================================
// Types
// ============================================

interface ProgressProps {
  value: number;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'success' | 'warning' | 'danger';
  showLabel?: boolean;
  label?: string;
  className?: string;
}

interface StepProgressProps {
  steps: string[];
  currentStep: number;
  className?: string;
}

interface CircularProgressProps {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  variant?: 'default' | 'success' | 'warning' | 'danger';
  showValue?: boolean;
  className?: string;
}

// ============================================
// Constants
// ============================================

const sizeStyles: Record<NonNullable<ProgressProps['size']>, string> = {
  sm: 'h-1',
  md: 'h-2',
  lg: 'h-3',
};

const variantStyles: Record<NonNullable<ProgressProps['variant']>, string> = {
  default: 'bg-matrix-green',
  success: 'bg-matrix-green',
  warning: 'bg-yellow-500',
  danger: 'bg-red-500',
};

const circularVariantStyles: Record<NonNullable<CircularProgressProps['variant']>, string> = {
  default: 'text-matrix-green',
  success: 'text-matrix-green',
  warning: 'text-yellow-500',
  danger: 'text-red-500',
};

// ============================================
// Components
// ============================================

export function Progress({
  value,
  max = 100,
  size = 'md',
  variant = 'default',
  showLabel = false,
  label,
  className = '',
}: ProgressProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

  return (
    <div className={`w-full ${className}`}>
      {(showLabel || label) && (
        <div className="flex justify-between mb-2 text-sm font-mono">
          <span className="text-matrix-dim">{label}</span>
          {showLabel && <span className="text-matrix-green">{percentage.toFixed(0)}%</span>}
        </div>
      )}
      <div className={`w-full bg-matrix-dark rounded-full overflow-hidden ${sizeStyles[size]}`}>
        <div
          className={`h-full transition-all duration-300 rounded-full ${variantStyles[variant]}`}
          style={{ width: `${percentage}%`, boxShadow: '0 0 10px rgba(0, 255, 65, 0.5)' }}
        />
      </div>
    </div>
  );
}

export function StepProgress({ steps, currentStep, className = '' }: StepProgressProps) {
  return (
    <div className={`w-full ${className}`}>
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;
          const isLast = index === steps.length - 1;

          return (
            <div key={index} className="flex items-center flex-1">
              <StepItem
                index={index}
                step={step}
                isCompleted={isCompleted}
                isCurrent={isCurrent}
              />
              {!isLast && <Connector isCompleted={isCompleted} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StepItem({ index, step, isCompleted, isCurrent }: { index: number; step: string; isCompleted: boolean; isCurrent: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <div
        className={`
          w-8 h-8 rounded-full flex items-center justify-center text-sm font-mono border-2
          transition-all duration-300
          ${isCompleted ? 'bg-matrix-green text-black border-matrix-green' : isCurrent ? 'bg-black text-matrix-green border-matrix-green' : 'bg-black text-matrix-dark border-matrix-dark'}
        `}
        style={isCurrent ? { boxShadow: '0 0 15px rgba(0, 255, 65, 0.5)' } : undefined}
      >
        {isCompleted ? (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          `0${index + 1}`
        )}
      </div>
      <span className={`mt-2 text-xs text-center max-w-[80px] font-mono ${isCurrent ? 'text-matrix-green' : 'text-matrix-dark'}`}>
        {step}
      </span>
    </div>
  );
}

function Connector({ isCompleted }: { isCompleted: boolean }) {
  return <div className={`flex-1 h-0.5 mx-2 ${isCompleted ? 'bg-matrix-green' : 'bg-matrix-dark'}`} />;
}

export function CircularProgress({
  value,
  max = 100,
  size = 80,
  strokeWidth = 8,
  variant = 'default',
  showValue = true,
  className = '',
}: CircularProgressProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} stroke="currentColor" strokeWidth={strokeWidth} fill="none" className="text-matrix-dark" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          className={circularVariantStyles[variant]}
          style={{
            strokeDasharray: circumference,
            strokeDashoffset: offset,
            transition: 'stroke-dashoffset 0.5s ease',
            filter: 'drop-shadow(0 0 5px rgba(0, 255, 65, 0.5))',
          }}
        />
      </svg>
      {showValue && (
        <span className={`absolute text-lg font-bold font-mono ${circularVariantStyles[variant]}`}>
          {percentage.toFixed(0)}%
        </span>
      )}
    </div>
  );
}

export default Progress;