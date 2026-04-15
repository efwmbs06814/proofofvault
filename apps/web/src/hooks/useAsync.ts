'use client';

/**
 * useAsync Hook
 * Custom hook for async operations with loading/error state management
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// ============================================
// Types
// ============================================

interface UseAsyncState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  status: 'idle' | 'pending' | 'success' | 'error';
}

interface UseAsyncOptions {
  immediate?: boolean;
  onSuccess?: (data: any) => void;
  onError?: (error: Error) => void;
}

type UseAsyncReturn<T> = UseAsyncState<T> & {
  execute: () => Promise<void>;
  reset: () => void;
};

type UseAsyncCallbackReturn<T extends (...args: any[]) => Promise<any>> = UseAsyncState<Awaited<ReturnType<T>>> & {
  callback: T;
  execute: (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>>;
};

// ============================================
// Main Hook - useAsync
// ============================================

/**
 * Hook for async operations with state management
 * @param asyncFn - Async function to execute
 * @param deps - Dependency array for auto-refresh
 * @returns State and execute function
 */
export function useAsync<T>(
  asyncFn: () => Promise<T>,
  deps: React.DependencyList = [],
  options: UseAsyncOptions = { immediate: true }
): UseAsyncReturn<T> {
  const { immediate = true, onSuccess, onError } = options;

  const [state, setState] = useState<UseAsyncState<T>>({
    data: null,
    loading: immediate,
    error: null,
    status: immediate ? 'pending' : 'idle',
  });

  const mountedRef = useRef(true);
  const callbackRef = useRef(asyncFn);

  // Update callback ref when asyncFn changes
  useEffect(() => {
    callbackRef.current = asyncFn;
  }, [asyncFn]);

  const execute = useCallback(async () => {
    if (!mountedRef.current) return;

    setState((prev) => ({ ...prev, loading: true, error: null, status: 'pending' }));

    try {
      const result = await callbackRef.current();

      if (mountedRef.current) {
        setState({
          data: result,
          loading: false,
          error: null,
          status: 'success',
        });
        onSuccess?.(result);
      }
    } catch (error) {
      if (mountedRef.current) {
        const err = error instanceof Error ? error : new Error('Unknown error');
        setState({
          data: null,
          loading: false,
          error: err,
          status: 'error',
        });
        onError?.(err);
      }
    }
    // `deps` is a caller-controlled DependencyList for this generic hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSuccess, onError, ...deps]);

  // Execute on mount if immediate
  useEffect(() => {
    if (immediate) {
      execute();
    }

    return () => {
      mountedRef.current = false;
    };
  }, [execute, immediate]);

  const reset = useCallback(() => {
    setState({
      data: null,
      loading: false,
      error: null,
      status: 'idle',
    });
  }, []);

  return { ...state, execute, reset };
}

// ============================================
// Callback Hook - useAsyncCallback
// ============================================

/**
 * Hook for memoized async callbacks with state
 * @param callback - Async function to memoize
 * @returns Memoized callback with state
 */
export function useAsyncCallback<T extends (...args: any[]) => Promise<any>>(
  callback: T
): UseAsyncCallbackReturn<T> {
  const [state, setState] = useState<UseAsyncState<Awaited<ReturnType<T>>>>({
    data: null,
    loading: false,
    error: null,
    status: 'idle',
  });

  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const execute = useCallback(async (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> => {
    setState((prev) => ({ ...prev, loading: true, error: null, status: 'pending' }));

    try {
      const result = await callbackRef.current(...args);
      setState({
        data: result,
        loading: false,
        error: null,
        status: 'success',
      });
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Unknown error');
      setState({
        data: null,
        loading: false,
        error: err,
        status: 'error',
      });
      throw err;
    }
  }, []);

  const memoizedCallback = useCallback(
    (...args: Parameters<T>) => execute(...args),
    [execute]
  ) as T;

  return { ...state, callback: memoizedCallback, execute };
}

// ============================================
// Utility Hook - useAsyncRetry
// ============================================

interface UseAsyncRetryOptions extends UseAsyncOptions {
  retryCount?: number;
  retryDelay?: number;
}

type UseAsyncRetryReturn<T> = UseAsyncReturn<T> & {
  retry: () => Promise<void>;
  attemptCount: number;
};

/**
 * Hook with automatic retry functionality
 */
export function useAsyncRetry<T>(
  asyncFn: () => Promise<T>,
  deps: React.DependencyList = [],
  options: UseAsyncRetryOptions = { immediate: true, retryCount: 3, retryDelay: 1000 }
): UseAsyncRetryReturn<T> {
  const { immediate = true, retryCount = 3, retryDelay = 1000, onSuccess, onError } = options;

  const [attemptCount, setAttemptCount] = useState(0);

  const asyncFnWithRetry = useCallback(async () => {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retryCount; attempt++) {
      try {
        setAttemptCount(attempt);
        return await asyncFn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        if (attempt < retryCount) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        }
      }
    }

    throw lastError;
  }, [asyncFn, retryCount, retryDelay]);

  const result = useAsync<T>(asyncFnWithRetry, deps, {
    immediate,
    onSuccess,
    onError,
  });

  return {
    ...result,
    attemptCount,
    retry: result.execute,
  };
}

export default useAsync;
