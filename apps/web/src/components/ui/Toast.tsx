'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';

// ============================================
// Types
// ============================================

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (type: ToastType, message: string, duration?: number) => void;
  removeToast: (id: string) => void;
}

interface ToastProviderProps {
  children: React.ReactNode;
}

// ============================================
// Constants
// ============================================

const styleMap: Record<ToastType, { border: string; text: string; glow: string; icon: string }> = {
  success: { border: 'border-matrix-green', text: 'text-matrix-green', glow: 'shadow-[0_0_10px_rgba(0,255,65,0.3)]', icon: '>' },
  error: { border: 'border-red-500', text: 'text-red-500', glow: 'shadow-[0_0_10px_rgba(255,0,0,0.3)]', icon: '!' },
  warning: { border: 'border-yellow-500', text: 'text-yellow-400', glow: 'shadow-[0_0_10px_rgba(255,200,0,0.3)]', icon: '#' },
  info: { border: 'border-blue-500', text: 'text-blue-400', glow: 'shadow-[0_0_10px_rgba(0,100,255,0.3)]', icon: 'i' },
};

// ============================================
// Context
// ============================================

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

// ============================================
// Provider
// ============================================

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((type: ToastType, message: string, duration = 5000) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts((prev) => [...prev, { id, type, message, duration }]);

    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastContainer />
    </ToastContext.Provider>
  );
}

// ============================================
// Hook
// ============================================

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');

  return {
    success: (message: string, duration?: number) => context.addToast('success', message, duration),
    error: (message: string, duration?: number) => context.addToast('error', message, duration),
    warning: (message: string, duration?: number) => context.addToast('warning', message, duration),
    info: (message: string, duration?: number) => context.addToast('info', message, duration),
  };
}

// ============================================
// Components
// ============================================

function ToastContainer() {
  const context = useContext(ToastContext);
  if (!context) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-md font-mono">
      {context.toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onClose={() => context.removeToast(toast.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const styles = styleMap[toast.type];

  return (
    <div className={`flex items-center gap-3 p-4 border bg-black animate-slide-in-right ${styles.border} ${styles.text} ${styles.glow}`}>
      <span className="shrink-0 text-lg font-bold">{styles.icon}</span>
      <p className="flex-1 text-sm">{toast.message}</p>
      <button
        onClick={onClose}
        className="shrink-0 p-1 hover:opacity-70 transition-opacity text-matrix-dark"
      >
        [x]
      </button>
    </div>
  );
}

export default ToastProvider;