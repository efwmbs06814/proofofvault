'use client';

import React from 'react';

// ============================================
// Types
// ============================================

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  options: Array<{ value: string; label: string }>;
}

// ============================================
// Utility Functions
// ============================================

function generateId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================
// Components
// ============================================

export function Input({
  label,
  error,
  hint,
  leftIcon,
  rightIcon,
  className = '',
  id,
  ...props
}: InputProps) {
  const inputId = id || generateId('input');

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium mb-2 text-matrix-green font-mono">
          {label}
          {props.required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <div className="relative">
        {leftIcon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-matrix-dark">{leftIcon}</div>
        )}
        <input
          id={inputId}
          className={`
            w-full px-4 py-3 font-mono text-sm
            bg-black border-2 transition-colors
            placeholder:text-matrix-dark
            focus:outline-none
            disabled:opacity-50 disabled:cursor-not-allowed
            ${leftIcon ? 'pl-10' : ''}
            ${rightIcon ? 'pr-10' : ''}
            ${error ? 'border-red-500' : 'border-matrix-dark hover:border-matrix-dim focus:border-matrix-green'}
            ${className}
          `}
          style={error ? undefined : { boxShadow: 'none' }}
          {...props}
        />
        {rightIcon && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-matrix-dark">{rightIcon}</div>
        )}
      </div>
      <HelperText error={error} hint={hint} />
    </div>
  );
}

export function Textarea({
  label,
  error,
  hint,
  className = '',
  id,
  ...props
}: TextareaProps) {
  const textareaId = id || generateId('textarea');

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={textareaId} className="block text-sm font-medium mb-2 text-matrix-green font-mono">
          {label}
          {props.required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <textarea
        id={textareaId}
        className={`
          w-full px-4 py-3 font-mono text-sm resize-none
          bg-black border-2 transition-colors
          placeholder:text-matrix-dark
          focus:outline-none
          disabled:opacity-50 disabled:cursor-not-allowed
          ${error ? 'border-red-500' : 'border-matrix-dark hover:border-matrix-dim focus:border-matrix-green'}
          ${className}
        `}
        {...props}
      />
      <HelperText error={error} hint={hint} />
    </div>
  );
}

export function Select({
  label,
  error,
  hint,
  options,
  className = '',
  id,
  ...props
}: SelectProps) {
  const selectId = id || generateId('select');

  return (
    <div className="w-full">
      {label && (
        <label htmlFor={selectId} className="block text-sm font-medium mb-2 text-matrix-green font-mono">
          {label}
          {props.required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      <select
        id={selectId}
        className={`
          w-full px-4 py-3 font-mono text-sm
          bg-black border-2 transition-colors
          focus:outline-none
          disabled:opacity-50 disabled:cursor-not-allowed
          ${error ? 'border-red-500 text-red-500' : 'border-matrix-dark text-matrix-green hover:border-matrix-dim focus:border-matrix-green'}
          ${className}
        `}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-black">
            {option.label}
          </option>
        ))}
      </select>
      <HelperText error={error} hint={hint} />
    </div>
  );
}

// ============================================
// Helper Components
// ============================================

function HelperText({ error, hint }: { error?: string; hint?: string }) {
  if (error) return <p className="mt-1 text-sm text-red-500 font-mono">{error}</p>;
  if (hint) return <p className="mt-1 text-sm text-matrix-dark font-mono">{hint}</p>;
  return null;
}

export default Input;