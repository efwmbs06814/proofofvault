'use client';

import React from 'react';
import Image from 'next/image';

// ============================================
// Types
// ============================================

interface LogoProps {
  size?: number;
  className?: string;
  showCheck?: boolean;
  variant?: 'svg' | 'image';
  color?: 'white' | 'black';
}

interface MatrixTextProps {
  children: React.ReactNode;
  className?: string;
  glow?: boolean;
  blink?: boolean;
}

// ============================================
// Logo Component
// ============================================

export function Logo({ size = 32, className = '', showCheck = true, variant = 'svg', color = 'white' }: LogoProps) {
  if (variant === 'image') {
    const src = color === 'white' ? '/logo-white.png' : '/logo.png';
    return (
      <div className={`relative inline-block ${className}`} style={{ width: size, height: size }}>
        <Image
          src={src}
          alt="Proof of Vault"
          width={size}
          height={size}
          className="object-contain"
          priority
        />
      </div>
    );
  }

  return <SvgLogo size={size} className={className} showCheck={showCheck} />;
}

// ============================================
// SVG Logo (fallback / alternative)
// ============================================

const SCANLINE_POSITIONS = [20, 30, 40, 50, 60, 70, 80, 90, 100];

function SvgLogo({ size, className, showCheck }: { size: number; className: string; showCheck: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Background */}
      <rect width="120" height="120" rx="20" fill="#000000" />

      {/* Grid Effect */}
      <rect x="10" y="10" width="100" height="100" rx="12" fill="none" stroke="#ffffff" strokeWidth="0.5" strokeOpacity="0.15" />

      {/* Scanlines */}
      {SCANLINE_POSITIONS.map((y) => (
        <line key={y} x1="15" y1={y} x2="105" y2={y} stroke="#ffffff" strokeWidth="0.3" strokeOpacity="0.08" />
      ))}

      {/* Checkmark */}
      {showCheck && (
        <path
          d="M30 62L50 82L90 38"
          stroke="#ffffff"
          strokeWidth="8"
          strokeLinecap="square"
          strokeLinejoin="miter"
          fill="none"
          style={{ filter: 'drop-shadow(0 0 6px #ffffff) drop-shadow(0 0 12px #ffffff)' }}
        />
      )}

      {/* Corner Accents */}
      <path d="M15 35 L15 15 L35 15" stroke="#ffffff" strokeWidth="1.5" strokeOpacity="0.4" fill="none" />
      <path d="M85 15 L105 15 L105 35" stroke="#ffffff" strokeWidth="1.5" strokeOpacity="0.4" fill="none" />
      <path d="M15 85 L15 105 L35 105" stroke="#ffffff" strokeWidth="1.5" strokeOpacity="0.4" fill="none" />
      <path d="M85 105 L105 105 L105 85" stroke="#ffffff" strokeWidth="1.5" strokeOpacity="0.4" fill="none" />
    </svg>
  );
}

// ============================================
// Matrix Text Component
// ============================================

export function MatrixText({ children, className = '', glow = true, blink = false }: MatrixTextProps) {
  return (
    <span className={`text-white font-mono ${glow ? 'matrix-glow' : ''} ${blink ? 'matrix-blink' : ''} ${className}`}>
      {children}
    </span>
  );
}

export default Logo;