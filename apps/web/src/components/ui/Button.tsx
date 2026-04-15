'use client';

import React from 'react';

// ============================================
// Types
// ============================================

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'gold';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

// ============================================
// Constants
// ============================================

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'border-matrix-green text-matrix-green hover:bg-matrix-green hover:text-black',
  secondary: 'border-matrix-dark text-matrix-dark hover:border-matrix-green hover:text-matrix-green',
  danger: 'border-red-500 text-red-500 hover:bg-red-600 hover:text-white hover:border-red-600',
  ghost: 'border-transparent text-matrix-green hover:border-matrix-green',
  gold: 'border-matrix-green text-matrix-green hover:bg-matrix-green hover:text-black',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-base',
  lg: 'px-6 py-3 text-lg',
};

const glowVariants: ButtonVariant[] = ['primary', 'gold'];
const glowStyle = { boxShadow: '0 0 10px rgba(0, 255, 65, 0.3)' };

// ============================================
// Components
// ============================================

export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  fullWidth = false,
  disabled,
  children,
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled || isLoading}
      className={`
        inline-flex items-center justify-center gap-2
        font-mono font-medium border
        transition-all duration-200
        disabled:opacity-50 disabled:cursor-not-allowed
        focus:outline-none focus:ring-2 focus:ring-matrix-green focus:ring-offset-2 focus:ring-offset-black
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
      style={glowVariants.includes(variant) ? glowStyle : undefined}
      {...props}
    >
      {isLoading ? <LoadingSpinner /> : <ButtonContent leftIcon={leftIcon} rightIcon={rightIcon}>{children}</ButtonContent>}
    </button>
  );
}

function LoadingSpinner() {
  return (
    <>
      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        />
      </svg>
      <span>PROCESSING...</span>
    </>
  );
}

interface ButtonContentProps {
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  children: React.ReactNode;
}

function ButtonContent({ leftIcon, rightIcon, children }: ButtonContentProps) {
  return (
    <>
      {leftIcon}
      {children}
      {rightIcon}
    </>
  );
}

export default Button;