'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

const Threads = dynamic(
  () => import('@appletosolutions/reactbits').then((m) => m.Threads),
  { ssr: false }
);

interface FooterThreadsProps {
  height?: number;
}

export function FooterThreads({ height = 160 }: FooterThreadsProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  return (
    <div 
      className="w-full overflow-hidden" 
      style={{ height: `${height}px` }}
    >
      <div style={{ width: '100%', height: '100%', position: 'relative' }}>
        {mounted ? (
          <Threads
            color={[0.6039215686274509, 0.5843137254901961, 0.6745098039215687]}
            amplitude={0.7}
            distance={0}
            enableMouseInteraction
          />
        ) : (
          <div className="w-full h-full bg-black" />
        )}
      </div>
    </div>
  );
}

export default FooterThreads;
