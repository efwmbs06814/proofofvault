'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

const GlareHover = dynamic(
  () => import('@appletosolutions/reactbits').then((m) => m.GlareHover),
  { ssr: false }
);

interface GlareHoverWrapperProps {
  children?: React.ReactNode;
  className?: string;
  background?: string;
  borderRadius?: string;
  borderColor?: string;
  glareColor?: string;
  glareOpacity?: number;
  glareAngle?: number;
  glareSize?: number;
  transitionDuration?: number;
  playOnce?: boolean;
  style?: React.CSSProperties;
}

export function GlareHoverWrapper(props: GlareHoverWrapperProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  if (!mounted) {
    const { children, className, style, ..._rest } = props;
    return <div className={className} style={style}>{children}</div>;
  }

  const { children, className, style, ...rest } = props;
  return (
    <div suppressHydrationWarning>
      <GlareHover {...rest} className={className} style={style}>
        {children}
      </GlareHover>
    </div>
  );
}
