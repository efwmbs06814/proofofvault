'use client';

/**
 * Error Boundary Component
 * Matrix-themed error boundary for catching React errors
 */

import React, { Component, ReactNode } from 'react';

// ============================================
// Types
// ============================================

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  fallbackContent?: {
    title?: string;
    message?: string;
    showStack?: boolean;
  };
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

// ============================================
// Main Component
// ============================================

/**
 * Error boundary component that catches React errors
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.setState({ errorInfo });
    this.props.onError?.(error, errorInfo);
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleGoHome = (): void => {
    window.location.href = '/';
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <ErrorFallback
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          onRetry={this.handleRetry}
          onGoHome={this.handleGoHome}
          config={this.props.fallbackContent}
        />
      );
    }

    return this.props.children;
  }
}

// ============================================
// Sub-Components
// ============================================

interface ErrorFallbackProps {
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  onRetry: () => void;
  onGoHome: () => void;
  config?: {
    title?: string;
    message?: string;
    showStack?: boolean;
  };
}

function ErrorFallback({ error, errorInfo, onRetry, onGoHome, config }: ErrorFallbackProps) {
  const [showStack, setShowStack] = React.useState(config?.showStack ?? false);

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div
            className="w-20 h-20 rounded-full border-2 border-red-500 flex items-center justify-center mx-auto mb-6"
            style={{ boxShadow: '0 0 20px rgba(255, 0, 0, 0.3)' }}
          >
            <svg
              className="w-10 h-10 text-red-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>

          <h1
            className="text-2xl font-bold text-red-500 font-mono mb-2"
            style={{ textShadow: '0 0 10px rgba(255, 0, 0, 0.5)' }}
          >
            {config?.title || '[SYSTEM ERROR]'}
          </h1>

          <p className="text-matrix-dim font-mono text-sm">
            {config?.message || 'An unexpected error has occurred'}
          </p>
        </div>

        {/* Error Details Card */}
        <div className="border border-matrix-dark bg-black p-6 mb-6">
          {/* Error Message */}
          {error && (
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-red-500 text-lg">!</span>
                <span className="text-red-500 font-mono text-sm font-semibold">
                  ERROR MESSAGE
                </span>
              </div>
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded">
                <p className="text-red-400 font-mono text-sm break-all">
                  {error.name}: {error.message}
                </p>
              </div>
            </div>
          )}

          {/* Stack Trace */}
          {errorInfo && (
            <div className="mb-4">
              <button
                onClick={() => setShowStack(!showStack)}
                className="flex items-center gap-2 text-matrix-dim hover:text-matrix-green transition-colors font-mono text-sm"
              >
                <span>{showStack ? '[-]' : '[+]'}</span>
                <span>STACK TRACE</span>
              </button>

              {showStack && errorInfo.componentStack && (
                <div className="mt-2 p-3 bg-matrix-dark/20 border border-matrix-dark rounded overflow-x-auto">
                  <pre className="text-matrix-dim font-mono text-xs whitespace-pre-wrap break-all">
                    {errorInfo.componentStack}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Component Stack */}
          {error?.stack && showStack && (
            <div className="mb-4">
              <p className="text-matrix-dim font-mono text-xs mb-2">ORIGINAL STACK:</p>
              <div className="p-3 bg-matrix-dark/20 border border-matrix-dark rounded overflow-x-auto max-h-48">
                <pre className="text-matrix-dim font-mono text-xs whitespace-pre-wrap">
                  {error.stack}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={onRetry}
            className="px-6 py-3 border border-matrix-green text-matrix-green font-mono
                       hover:bg-matrix-green hover:text-black transition-all
                       flex items-center justify-center gap-2"
            style={{ boxShadow: '0 0 10px rgba(255, 255, 255, 0.2)' }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            [ RETRY ]
          </button>

          <button
            onClick={onGoHome}
            className="px-6 py-3 border border-matrix-dark text-matrix-dim font-mono
                       hover:border-matrix-green hover:text-matrix-green transition-all
                       flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
              />
            </svg>
            [ GO HOME ]
          </button>
        </div>

        {/* Footer */}
        <p className="text-center text-matrix-dark font-mono text-xs mt-8">
          PROOF OF VAULT // ERROR BOUNDARY v1.0
        </p>
      </div>
    </div>
  );
}

// ============================================
// Higher Order Component
// ============================================

/**
 * Wrap a component with error boundary
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  fallbackProps?: ErrorBoundaryProps['fallbackContent']
): React.FC<P> {
  const WithErrorBoundary: React.FC<P> = (props) => (
    <ErrorBoundary fallbackContent={fallbackProps}>
      <Component {...props} />
    </ErrorBoundary>
  );

  WithErrorBoundary.displayName = `WithErrorBoundary(${
    Component.displayName || Component.name || 'Component'
  })`;

  return WithErrorBoundary;
}

// ============================================
// Simple Fallback Component
// ============================================

/**
 * Simple error fallback for inline use
 */
export function SimpleErrorFallback({
  message = 'Something went wrong',
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="p-6 border border-red-500 bg-black text-center">
      <p className="text-red-500 font-mono mb-4">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 border border-matrix-green text-matrix-green font-mono
                     hover:bg-matrix-green hover:text-black transition-all"
        >
          [ RETRY ]
        </button>
      )}
    </div>
  );
}

export default ErrorBoundary;
