'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';

type GlitchIntensity = 'low' | 'medium' | 'high';

interface GlitchTextProps {
  children: React.ReactNode;
  intensity?: GlitchIntensity;
  interval?: number;
  className?: string;
  enableHover?: boolean;
  enableRandom?: boolean;
}

const INTENSITY_CONFIG: Record<GlitchIntensity, {
  skewX: number;
  clipPathOffsets: number[];
  animationDuration: number;
}> = {
  low: { skewX: 2, clipPathOffsets: [-2, 2], animationDuration: 0.2 },
  medium: { skewX: 5, clipPathOffsets: [-4, 4, -2, 2], animationDuration: 0.3 },
  high: { skewX: 10, clipPathOffsets: [-6, 6, -4, 4, -2, 2], animationDuration: 0.4 },
};

export function GlitchText({
  children,
  intensity = 'medium',
  interval = 5000,
  className = '',
  enableHover = true,
  enableRandom = true,
}: GlitchTextProps) {
  const [isGlitching, setIsGlitching] = useState(false);
  const [clipPath, setClipPath] = useState<string>('');
  const containerRef = useRef<HTMLSpanElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const config = INTENSITY_CONFIG[intensity];

  const generateClipPath = useCallback(() => {
    const offsets = config.clipPathOffsets;
    const randomOffset = offsets[Math.floor(Math.random() * offsets.length)];
    return `polygon(0 0, 100% 0, 100% ${randomOffset}%, 0 ${randomOffset}%)`;
  }, [config.clipPathOffsets]);

  const triggerGlitch = useCallback(() => {
    if (isGlitching) return;
    setIsGlitching(true);
    setClipPath(generateClipPath());
    timeoutRef.current = setTimeout(() => {
      setClipPath(generateClipPath());
    }, config.animationDuration * 1000);
    setTimeout(() => {
      setClipPath('');
      setIsGlitching(false);
    }, config.animationDuration * 1000 * 3);
  }, [isGlitching, generateClipPath, config.animationDuration]);

  const handleMouseEnter = useCallback(() => {
    if (enableHover) triggerGlitch();
  }, [enableHover, triggerGlitch]);

  useEffect(() => {
    if (!enableRandom) return;
    intervalRef.current = setInterval(() => {
      if (Math.random() > 0.7) triggerGlitch();
    }, interval);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [enableRandom, interval, triggerGlitch]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return (
    <span
      ref={containerRef}
      className={`relative inline-block cursor-default ${isGlitching ? 'animate-glitch-text' : ''} ${className}`}
      onMouseEnter={handleMouseEnter}
      style={{
        transform: isGlitching ? `skewX(${config.skewX}deg)` : 'none',
        transition: isGlitching ? 'none' : 'transform 0.1s ease',
      }}
    >
      <span className="relative z-10">{children}</span>

      {isGlitching && (
        <>
          <span
            className="absolute inset-0 z-20 pointer-events-none"
            style={{
              clipPath,
              transform: 'translateX(-2px)',
              opacity: 0.8,
              color: '#00ffff',
              textShadow: '2px 0 #ff00ff',
            }}
            aria-hidden="true"
          >
            {children}
          </span>
          <span
            className="absolute inset-0 z-20 pointer-events-none"
            style={{
              clipPath,
              transform: 'translateX(2px)',
              opacity: 0.8,
              color: '#ff00ff',
              textShadow: '-2px 0 #00ffff',
            }}
            aria-hidden="true"
          >
            {children}
          </span>
          <span className="absolute inset-0 z-30 pointer-events-none overflow-hidden animate-glitch-scan" aria-hidden="true">
            <span className="absolute w-full h-[2px] bg-matrix-green/50" style={{ top: '50%' }} />
          </span>
        </>
      )}
    </span>
  );
}

export function GlitchTitle({ children, className = '', ...props }: GlitchTextProps) {
  return (
    <GlitchText className={`text-4xl md:text-5xl lg:text-6xl font-bold font-mono text-white ${className}`} {...props}>
      {children}
    </GlitchText>
  );
}

export function GlitchNumber({ children, className = '', ...props }: GlitchTextProps) {
  return (
    <GlitchText className={`text-[8rem] md:text-[12rem] font-bold font-mono leading-none text-matrix-green ${className}`} {...props}>
      {children}
    </GlitchText>
  );
}

export function GlitchHeading({ children, className = '', ...props }: GlitchTextProps) {
  return (
    <GlitchText className={`text-2xl md:text-3xl font-bold font-mono text-white ${className}`} {...props}>
      {children}
    </GlitchText>
  );
}

export default GlitchText;
