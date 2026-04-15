'use client';

/**
 * useIntersectionObserver Hook
 * Intersection observer hook for lazy loading and scroll-triggered animations
 */

import { useState, useEffect, useRef, useCallback } from 'react';

// ============================================
// Types
// ============================================

interface UseIntersectionOptions {
  threshold?: number | number[];
  rootMargin?: string;
  triggerOnce?: boolean;
  root?: Element | null;
}

interface UseIntersectionReturn {
  ref: React.RefObject<Element>;
  isIntersecting: boolean;
  hasIntersected: boolean;
  intersectionRatio: number;
  entry: IntersectionObserverEntry | null;
}

// ============================================
// Main Hook
// ============================================

/**
 * Hook for detecting when an element enters the viewport
 * @param options - Intersection observer options
 * @returns Object with ref and intersection state
 */
export function useIntersectionObserver(
  options: UseIntersectionOptions = {}
): UseIntersectionReturn {
  const { threshold = 0, rootMargin = '0px', triggerOnce = false, root = null } = options;

  const ref = useRef<Element>(null);
  const [state, setState] = useState({
    isIntersecting: false,
    hasIntersected: false,
    intersectionRatio: 0,
    entry: null as IntersectionObserverEntry | null,
  });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;

        const isIntersecting = entry.isIntersecting;

        setState((prev) => ({
          isIntersecting,
          hasIntersected: triggerOnce ? prev.hasIntersected || isIntersecting : isIntersecting,
          intersectionRatio: entry.intersectionRatio,
          entry,
        }));

        // Disconnect if triggerOnce and has intersected
        if (triggerOnce && isIntersecting) {
          observer.disconnect();
        }
      },
      {
        threshold: Array.isArray(threshold) ? threshold : [threshold],
        rootMargin,
        root,
      }
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [threshold, rootMargin, triggerOnce, root]);

  return {
    ref: ref as React.RefObject<Element>,
    ...state,
  };
}

// ============================================
// Variant Hooks
// ============================================

/**
 * Hook for lazy loading content
 */
export function useLazyLoad(options: Omit<UseIntersectionOptions, 'triggerOnce'> = {}) {
  const intersection = useIntersectionObserver({
    ...options,
    triggerOnce: true,
    rootMargin: options.rootMargin || '100px',
  });

  return {
    ref: intersection.ref,
    isVisible: intersection.hasIntersected,
  };
}

/**
 * Hook for scroll-triggered animations
 */
export function useScrollAnimation(
  options: UseIntersectionOptions = {}
): UseIntersectionReturn & { runAnimation: () => void } {
  const intersection = useIntersectionObserver(options);

  const runAnimation = useCallback(() => {
    // This can be used to trigger CSS animations manually
    const element = intersection.ref.current;
    if (element) {
      element.classList.add('animate-fade-in', 'animate-slide-up');
    }
  }, [intersection.ref]);

  return {
    ...intersection,
    runAnimation,
  };
}

/**
 * Hook for detecting when element is fully visible
 */
export function useFullVisibility(ref: React.RefObject<Element>) {
  const [isFullyVisible, setIsFullyVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry) {
          setIsFullyVisible(entry.intersectionRatio >= 1);
        }
      },
      { threshold: 1 }
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [ref]);

  return isFullyVisible;
}

/**
 * Hook for multiple element observation
 */
export function useIntersectionObserverList<T extends Element>(
  count: number,
  options: UseIntersectionOptions = {}
): {
  refs: React.RefObject<T>[];
  intersectedIndexes: Set<number>;
  intersectionRatioMap: Map<number, number>;
} {
  const refs = useRef<React.RefObject<T>[]>([]);
  const [intersectedIndexes, setIntersectedIndexes] = useState<Set<number>>(new Set());
  const [intersectionRatioMap, setIntersectionRatioMap] = useState<Map<number, number>>(new Map());

  // Initialize refs
  useEffect(() => {
    refs.current = Array.from({ length: count }, (_, i) => {
      if (!refs.current[i]) {
        refs.current[i] = { current: null } as React.RefObject<T>;
      }
      return refs.current[i];
    });
  }, [count]);

  useEffect(() => {
    const observers: IntersectionObserver[] = [];

    refs.current.forEach((ref, index) => {
      const element = ref.current;
      if (!element) return;

      const observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (!entry) return;

          setIntersectedIndexes((prev) => {
            const next = new Set(prev);
            if (entry.isIntersecting) {
              next.add(index);
            }
            return next;
          });

          setIntersectionRatioMap((prev) => {
            const next = new Map(prev);
            next.set(index, entry.intersectionRatio);
            return next;
          });
        },
        {
          threshold: options.threshold ?? 0,
          rootMargin: options.rootMargin ?? '0px',
        }
      );

      observer.observe(element);
      observers.push(observer);
    });

    return () => {
      observers.forEach((observer) => observer.disconnect());
    };
  }, [count, options.threshold, options.rootMargin]);

  return {
    refs: refs.current,
    intersectedIndexes,
    intersectionRatioMap,
  };
}

// ============================================
// Utility Functions
// ============================================

/**
 * Create a threshold array for progressive loading
 */
export function createThresholdArray(steps: number = 10): number[] {
  return Array.from({ length: steps }, (_, i) => (i + 1) / steps);
}

/**
 * Common root margins for common use cases
 */
export const ROOT_MARGINS = {
  lazy: '100px',
  preload: '200px',
  visible: '0px',
  aboveViewport: '-100px',
  belowViewport: '100px',
} as const;

export default useIntersectionObserver;
