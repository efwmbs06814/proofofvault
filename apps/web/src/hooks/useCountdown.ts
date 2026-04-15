'use client';

/**
 * useCountdown Hook
 * Countdown timer hook for tracking time until a target date
 */

import { useState, useEffect, useCallback, useMemo } from 'react';

// ============================================
// Types
// ============================================

interface CountdownState {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalSeconds: number;
  isExpired: boolean;
  formatted: string;
  remaining: number; // milliseconds
}

interface UseCountdownReturn extends CountdownState {
  progress: number; // 0-100 percentage of time elapsed
  formattedDays: string;
  formattedHours: string;
  formattedMinutes: string;
  formattedSeconds: string;
}

// ============================================
// Constants
// ============================================

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

// ============================================
// Helper Functions
// ============================================

function padZero(num: number): string {
  return num.toString().padStart(2, '0');
}

function calculateTimeRemaining(targetMs: number): {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalSeconds: number;
  isExpired: boolean;
} {
  const now = Date.now();
  const diff = targetMs - now;

  if (diff <= 0) {
    return {
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      totalSeconds: 0,
      isExpired: true,
    };
  }

  const days = Math.floor(diff / DAY_MS);
  const hours = Math.floor((diff % DAY_MS) / HOUR_MS);
  const minutes = Math.floor((diff % HOUR_MS) / MINUTE_MS);
  const seconds = Math.floor((diff % MINUTE_MS) / SECOND_MS);
  const totalSeconds = Math.floor(diff / SECOND_MS);

  return {
    days,
    hours,
    minutes,
    seconds,
    totalSeconds,
    isExpired: false,
  };
}

// ============================================
// Main Hook
// ============================================

/**
 * Countdown timer hook
 * @param targetDate - Target date as string or Date object
 * @returns Countdown state and formatted values
 */
export function useCountdown(targetDate: string | Date): UseCountdownReturn {
  const targetMs = useMemo(() => {
    return typeof targetDate === 'string'
      ? new Date(targetDate).getTime()
      : targetDate.getTime();
  }, [targetDate]);

  const [countdown, setCountdown] = useState<CountdownState>(() => {
    const time = calculateTimeRemaining(targetMs);
    return {
      ...time,
      formatted: formatTime(time),
      remaining: Math.max(0, targetMs - Date.now()),
    };
  });

  useEffect(() => {
    // Initial calculation
    const time = calculateTimeRemaining(targetMs);
    setCountdown({
      ...time,
      formatted: formatTime(time),
      remaining: Math.max(0, targetMs - Date.now()),
    });

    // Skip interval if already expired
    if (time.isExpired) return;

    // Update every second
    const interval = setInterval(() => {
      const newTime = calculateTimeRemaining(targetMs);
      setCountdown({
        ...newTime,
        formatted: formatTime(newTime),
        remaining: Math.max(0, targetMs - Date.now()),
      });

      if (newTime.isExpired) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [targetMs]);

  const progress = useMemo(() => {
    const totalDuration = targetMs - (countdown.remaining + (Date.now() - targetMs + countdown.remaining));
    if (totalDuration <= 0) return 100;
    return Math.min(100, Math.max(0, (countdown.totalSeconds / totalDuration) * 100));
  }, [targetMs, countdown.totalSeconds, countdown.remaining]);

  return {
    ...countdown,
    progress,
    formattedDays: padZero(countdown.days),
    formattedHours: padZero(countdown.hours),
    formattedMinutes: padZero(countdown.minutes),
    formattedSeconds: padZero(countdown.seconds),
  };
}

// ============================================
// Helper Functions
// ============================================

function formatTime(time: Omit<CountdownState, 'formatted' | 'remaining'>): string {
  const parts: string[] = [];

  if (time.days > 0) {
    parts.push(`${time.days}d`);
  }
  if (time.hours > 0 || parts.length > 0) {
    parts.push(`${padZero(time.hours)}h`);
  }
  if (time.minutes > 0 || parts.length > 0) {
    parts.push(`${padZero(time.minutes)}m`);
  }
  parts.push(`${padZero(time.seconds)}s`);

  return parts.join(' ');
}

// ============================================
// Variants Hooks
// ============================================

interface UseCountdownSecondsOptions {
  interval?: number;
  onComplete?: () => void;
}

/**
 * Simple countdown from seconds
 */
export function useCountdownSeconds(
  seconds: number,
  options: UseCountdownSecondsOptions = {}
): { remaining: number; isExpired: boolean; reset: () => void } {
  const { interval = 1000, onComplete } = options;
  const [remaining, setRemaining] = useState(seconds);
  const targetRef = useMemo(() => Date.now() + seconds * 1000, [seconds]);

  useEffect(() => {
    setRemaining(seconds);
  }, [seconds]);

  useEffect(() => {
    if (remaining <= 0) {
      onComplete?.();
      return;
    }

    const timeout = setTimeout(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          onComplete?.();
          return 0;
        }
        return prev - 1;
      });
    }, interval);

    return () => clearTimeout(timeout);
  }, [remaining, interval, onComplete]);

  const reset = useCallback(() => {
    setRemaining(seconds);
  }, [seconds]);

  return {
    remaining,
    isExpired: remaining <= 0,
    reset,
  };
}

/**
 * Formatted countdown for display
 */
export function useCountdownFormatted(targetDate: string | Date): string {
  const countdown = useCountdown(targetDate);
  return countdown.formatted;
}

export default useCountdown;
