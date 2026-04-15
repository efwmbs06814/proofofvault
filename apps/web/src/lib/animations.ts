'use client';

/**
 * Animation Utilities
 * CSS classes and keyframes for Matrix-themed animations
 */

// ============================================
// Animation Classes
// ============================================

export const ANIMATIONS = {
  fadeIn: 'animate-fade-in',
  slideUp: 'animate-slide-up',
  slideDown: 'animate-slide-down',
  slideLeft: 'animate-slide-left',
  slideRight: 'animate-slide-right',
  pulse: 'animate-pulse',
  spin: 'animate-spin',
  bounce: 'animate-bounce',
  glow: 'animate-glow',
  float: 'animate-matrix-float',
  spinSlow: 'animate-matrix-spin-slow',
  bounceSubtle: 'animate-matrix-bounce',
} as const;

export type AnimationType = keyof typeof ANIMATIONS;

// ============================================
// Animation Keyframes CSS
// ============================================

export const ANIMATION_KEYFRAMES = `
  /* Glow Animation */
  @keyframes glow {
    0%, 100% {
      box-shadow: 0 0 5px rgba(255, 255, 255, 0.3);
    }
    50% {
      box-shadow: 0 0 20px rgba(255, 255, 255, 0.5), 0 0 30px rgba(255, 255, 255, 0.3);
    }
  }

  /* Slide Down */
  @keyframes slide-down {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Slide Left */
  @keyframes slide-left {
    from {
      opacity: 0;
      transform: translateX(10px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  /* Scale In */
  @keyframes scale-in {
    from {
      opacity: 0;
      transform: scale(0.9);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  /* Shake */
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
    20%, 40%, 60%, 80% { transform: translateX(4px); }
  }

  /* Typing Cursor */
  @keyframes typing-cursor {
    0%, 100% { border-color: var(--matrix-green); }
    50% { border-color: transparent; }
  }

  /* Matrix Rain Full */
  @keyframes matrix-rain-full {
    0% {
      transform: translateY(-100%);
      opacity: 0;
    }
    10% {
      opacity: 1;
    }
    90% {
      opacity: 1;
    }
    100% {
      transform: translateY(100vh);
      opacity: 0;
    }
  }
`;

// ============================================
// Animation Duration Classes
// ============================================

export const ANIMATION_DURATIONS = {
  fast: 'duration-150',
  normal: 'duration-300',
  slow: 'duration-500',
  slower: 'duration-700',
} as const;

// ============================================
// Animation Delay Classes
// ============================================

export const ANIMATION_DELAYS = {
  none: 'delay-0',
  100: 'delay-100',
  200: 'delay-200',
  300: 'delay-300',
  400: 'delay-400',
  500: 'delay-500',
} as const;

// ============================================
// Transition Utilities
// ============================================

export const TRANSITIONS = {
  fast: 'transition-all duration-150 ease-out',
  normal: 'transition-all duration-300 ease-out',
  slow: 'transition-all duration-500 ease-out',
  spring: 'transition-all duration-300 ease-in-out',
} as const;

// ============================================
// Stagger Animation Helper
// ============================================

/**
 * Generate stagger animation classes for list items
 */
export function getStaggerClass(index: number, baseDelay: number = 100): string {
  return `animate-fade-in delay-${Math.min(index * baseDelay, 500)}`;
}

// ============================================
// Animation Presets
// ============================================

export const PRESETS = {
  fadeIn: {
    animation: 'animate-fade-in',
    duration: 300,
  },
  slideUp: {
    animation: 'animate-slide-up',
    duration: 400,
  },
  slideRight: {
    animation: 'animate-slide-in-right',
    duration: 300,
  },
  glow: {
    animation: 'animate-glow',
    duration: 2000,
  },
  bounce: {
    animation: 'animate-bounce',
    duration: 1000,
  },
} as const;

// ============================================
// Class Name Helpers
// ============================================

/**
 * Combine animation classes
 */
export function combineAnimations(...animations: AnimationType[]): string {
  return animations.map((a) => ANIMATIONS[a]).join(' ');
}

/**
 * Create animation class string with delay
 */
export function createAnimation(
  animation: AnimationType,
  delay: number = 0
): string {
  const delayClass = delay > 0 ? `delay-${delay}` : '';
  return [ANIMATIONS[animation], delayClass].filter(Boolean).join(' ');
}

// ============================================
// Intersection Animation Hook Helper
// ============================================

/**
 * Get visible animation when element enters viewport
 */
export function getIntersectionAnimation(
  isVisible: boolean,
  animation: AnimationType = 'fadeIn'
): string {
  return isVisible ? ANIMATIONS[animation] : 'opacity-0';
}

// ============================================
// Export All
// ============================================

export default ANIMATIONS;
