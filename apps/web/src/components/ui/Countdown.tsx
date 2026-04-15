'use client';

/**
 * Countdown 倒计时组件
 * 显示目标日期的实时倒计时
 */

import React from 'react';
import { useCountdown } from '@/hooks/useCountdown';

// ============================================
// Types
// ============================================

interface CountdownProps {
  /** 目标日期 (字符串或 Date 对象) */
  targetDate: string | Date;
  /** 倒计时完成时的回调 */
  onComplete?: () => void;
  /** 尺寸变体 */
  size?: 'sm' | 'md' | 'lg';
  /** 是否显示单位标签 */
  showLabels?: boolean;
  /** 过期后显示的文本 */
  expiredText?: string;
  /** 自定义类名 */
  className?: string;
}

// ============================================
// Constants
// ============================================

const sizeConfigs = {
  sm: {
    container: 'gap-1',
    digitBox: 'w-8 h-10 text-sm',
    digit: 'text-base',
    label: 'text-[10px]',
    separator: 'text-sm',
  },
  md: {
    container: 'gap-2',
    digitBox: 'w-12 h-14 text-base',
    digit: 'text-xl',
    label: 'text-xs',
    separator: 'text-lg',
  },
  lg: {
    container: 'gap-3',
    digitBox: 'w-16 h-20 text-lg',
    digit: 'text-3xl',
    label: 'text-sm',
    separator: 'text-2xl',
  },
};

// ============================================
// Components
// ============================================

export function Countdown({
  targetDate,
  onComplete,
  size = 'md',
  showLabels = true,
  expiredText = 'EXPIRED',
  className = '',
}: CountdownProps) {
  const {
    days,
    hours,
    minutes,
    seconds,
    isExpired,
    formattedDays,
    formattedHours,
    formattedMinutes,
    formattedSeconds,
    remaining,
  } = useCountdown(targetDate);

  const config = sizeConfigs[size];
  const isWarning = remaining > 0 && remaining <= 24 * 60 * 60 * 1000;
  const isCritical = remaining > 0 && remaining <= 60 * 60 * 1000;

  React.useEffect(() => {
    if (isExpired && onComplete) {
      onComplete();
    }
  }, [isExpired, onComplete]);

  if (isExpired) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <ExpiredDisplay expiredText={expiredText} size={size} />
      </div>
    );
  }

  return (
    <div className={`flex items-center ${className}`}>
      <TimeUnit
        value={formattedDays}
        label="DAYS"
        config={config}
        showLabels={showLabels}
        isWarning={isWarning}
        isCritical={isCritical}
      />
      <Separator config={config} />
      <TimeUnit
        value={formattedHours}
        label="HRS"
        config={config}
        showLabels={showLabels}
        isWarning={isWarning}
        isCritical={isCritical}
      />
      <Separator config={config} />
      <TimeUnit
        value={formattedMinutes}
        label="MIN"
        config={config}
        showLabels={showLabels}
        isWarning={isWarning}
        isCritical={isCritical}
      />
      <Separator config={config} />
      <TimeUnit
        value={formattedSeconds}
        label="SEC"
        config={config}
        showLabels={showLabels}
        isWarning={isWarning}
        isCritical={isCritical}
      />
    </div>
  );
}

// ============================================
// Sub-components
// ============================================

interface TimeUnitProps {
  value: string;
  label: string;
  config: typeof sizeConfigs['md'];
  showLabels: boolean;
  isWarning: boolean;
  isCritical: boolean;
}

function TimeUnit({ value, label, config, showLabels, isWarning, isCritical }: TimeUnitProps) {
  const baseClasses = `
    flex flex-col items-center
    ${config.container}
  `;

  const digitBoxClasses = `
    relative flex items-center justify-center
    bg-black border border-matrix-green rounded
    ${config.digitBox}
    ${isWarning && !isCritical ? 'border-red-500' : ''}
    ${isCritical ? 'border-red-500 animate-pulse' : ''}
  `;

  const glowStyle = isWarning && !isCritical
    ? { boxShadow: '0 0 10px rgba(239, 68, 68, 0.5)' }
    : isCritical
      ? { boxShadow: '0 0 15px rgba(239, 68, 68, 0.7)' }
      : { boxShadow: '0 0 10px rgba(0, 255, 65, 0.3)' };

  const textColor = isWarning ? 'text-red-400' : 'text-matrix-green';

  return (
    <div className={baseClasses}>
      <div className={digitBoxClasses} style={glowStyle}>
        <span className={`font-mono font-bold ${config.digit} ${textColor} tabular-nums`}>
          {value}
        </span>
      </div>
      {showLabels && (
        <span className={`font-mono mt-1 ${config.label} text-matrix-dim`}>
          {label}
        </span>
      )}
    </div>
  );
}

interface SeparatorProps {
  config: typeof sizeConfigs['md'];
}

function Separator({ config }: SeparatorProps) {
  return (
    <span className={`font-mono font-bold ${config.separator} text-matrix-green self-start mt-2`}>
      :
    </span>
  );
}

interface ExpiredDisplayProps {
  expiredText: string;
  size: 'sm' | 'md' | 'lg';
}

function ExpiredDisplay({ expiredText, size }: ExpiredDisplayProps) {
  const textSize = size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-2xl' : 'text-lg';
  
  return (
    <div
      className={`
        px-4 py-2
        bg-red-500/10 border border-red-500 rounded
        ${textSize} font-mono font-bold text-red-400
        animate-pulse
      `}
      style={{ boxShadow: '0 0 15px rgba(239, 68, 68, 0.5)' }}
    >
      [{expiredText}]
    </div>
  );
}

// ============================================
// Compact Version
// ============================================

interface CountdownCompactProps {
  targetDate: string | Date;
  className?: string;
}

export function CountdownCompact({ targetDate, className = '' }: CountdownCompactProps) {
  const { days, hours, minutes, seconds, isExpired } = useCountdown(targetDate);

  if (isExpired) {
    return <span className={`font-mono text-red-400 ${className}`}>[EXPIRED]</span>;
  }

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours.toString().padStart(2, '0')}h`);
  parts.push(`${minutes.toString().padStart(2, '0')}m`);
  parts.push(`${seconds.toString().padStart(2, '0')}s`);

  const isWarning = (days === 0 && hours < 24);

  return (
    <span className={`font-mono tabular-nums ${isWarning ? 'text-red-400' : 'text-matrix-green'} ${className}`}>
      {parts.join(' ')}
    </span>
  );
}

// ============================================
// Inline Version
// ============================================

interface CountdownInlineProps {
  targetDate: string | Date;
  className?: string;
}

export function CountdownInline({ targetDate, className = '' }: CountdownInlineProps) {
  const { days, hours, minutes, seconds, isExpired } = useCountdown(targetDate);

  if (isExpired) {
    return <span className={`font-mono text-red-400 ${className}`}>expired</span>;
  }

  if (days > 0) {
    return (
      <span className={`font-mono tabular-nums ${className}`}>
        {days}d {hours.toString().padStart(2, '0')}h {minutes.toString().padStart(2, '0')}m
      </span>
    );
  }

  if (hours > 0) {
    return (
      <span className={`font-mono tabular-nums ${className}`}>
        {hours.toString().padStart(2, '0')}h {minutes.toString().padStart(2, '0')}m {seconds.toString().padStart(2, '0')}s
      </span>
    );
  }

  return (
    <span className={`font-mono tabular-nums ${className}`}>
      {minutes.toString().padStart(2, '0')}m {seconds.toString().padStart(2, '0')}s
    </span>
  );
}

export default Countdown;
