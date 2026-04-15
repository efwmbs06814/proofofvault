'use client';

import React, { useEffect, useCallback } from 'react';

// ============================================
// Types
// ============================================

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showClose?: boolean;
}

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning' | 'info';
  isLoading?: boolean;
}

// ============================================
// Constants
// ============================================

const sizeStyles: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

// ============================================
// Components
// ============================================

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  showClose = true,
}: ModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div
        className={`
          relative w-full ${sizeStyles[size]}
          bg-black border border-matrix-green rounded-lg
          shadow-[0_0_30px_rgba(0,255,65,0.3)]
          transform transition-all animate-fade-in
        `}
      >
        {(title || showClose) && (
          <div className="flex items-center justify-between p-4 border-b border-matrix-dark">
            {title && (
              <h2 className="text-lg font-mono font-semibold text-matrix-green" style={{ textShadow: '0 0 5px #00ff41' }}>
                {title}
              </h2>
            )}
            {showClose && (
              <button
                onClick={onClose}
                className="p-2 border border-matrix-dark text-matrix-dark hover:border-matrix-green hover:text-matrix-green transition-all font-mono"
              >
                [X]
              </button>
            )}
          </div>
        )}
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'CONFIRM',
  cancelText = 'CANCEL',
  variant = 'danger',
  isLoading = false,
}: ConfirmModalProps) {
  const buttonStyle =
    variant === 'danger'
      ? 'border-red-500 text-red-500 hover:bg-red-600 hover:text-white hover:border-red-600'
      : 'border-matrix-green text-matrix-green hover:bg-matrix-green hover:text-black hover:border-matrix-green';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <div className="space-y-6">
        <p className="text-matrix-green font-mono text-sm">{message}</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 border border-matrix-dark text-matrix-dark font-mono hover:border-matrix-green hover:text-matrix-green transition-all disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-4 py-2 border font-mono transition-all disabled:opacity-50 ${buttonStyle}`}
          >
            {isLoading ? 'PROCESSING...' : confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default Modal;