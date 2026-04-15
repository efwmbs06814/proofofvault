'use client';

import React from 'react';

// ============================================
// Types
// ============================================

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hover?: boolean;
  onClick?: () => void;
}

interface CardSubComponentProps {
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}

interface CardTitleProps {
  children: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
}

// ============================================
// Constants
// ============================================

const paddingStyles: Record<NonNullable<CardProps['padding']>, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
};

// ============================================
// Components
// ============================================

export function Card({
  children,
  className = '',
  padding = 'md',
  hover = false,
  onClick,
}: CardProps) {
  const Component = onClick ? 'button' : 'div';

  return (
    <Component
      onClick={onClick}
      className={`
        bg-black border border-matrix-dark
        ${paddingStyles[padding]}
        ${hover ? 'hover:border-matrix-green transition-all cursor-pointer hover:shadow-[0_0_15px_rgba(0,255,65,0.3)]' : ''}
        ${onClick ? 'w-full text-left' : ''}
        ${className}
      `}
    >
      {children}
    </Component>
  );
}

export function CardHeader({ children, className = '', action }: CardSubComponentProps) {
  return (
    <div className={`flex items-center justify-between mb-4 ${className}`}>
      <div className="flex items-center gap-2">{children}</div>
      {action}
    </div>
  );
}

export function CardTitle({ children, className = '', icon }: CardTitleProps) {
  return (
    <h3 className={`text-lg font-semibold flex items-center gap-2 font-mono text-matrix-green ${className}`}>
      {icon}
      {children}
    </h3>
  );
}

export function CardContent({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={className}>{children}</div>;
}

export function CardFooter({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`mt-4 pt-4 border-t border-matrix-dark ${className}`}>
      {children}
    </div>
  );
}

export default Card;
