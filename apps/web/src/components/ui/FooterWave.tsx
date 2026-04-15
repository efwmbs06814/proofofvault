'use client';

import { useEffect, useRef } from 'react';

interface ThreadLine {
  points: { x: number; y: number }[];
  speed: number;
  amplitude: number;
  phase: number;
  opacity: number;
  thickness: number;
  baseYOffset: number;
}

interface FooterWaveProps {
  height?: number;
}

export function FooterWave({ height = 120 }: FooterWaveProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const linesRef = useRef<ThreadLine[]>([]);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const parent = canvas.parentElement;
      if (!parent) return;
      canvas.width = parent.clientWidth * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${parent.clientWidth}px`;
      canvas.style.height = `${height}px`;
      ctx.scale(dpr, dpr);
    };

    resize();
    window.addEventListener('resize', resize);

    const lineCount = 8;
    linesRef.current = Array.from({ length: lineCount }, (_, i) => {
      const t = i / (lineCount - 1);
      const centerOffset = (t - 0.5) * 0.6;
      return {
        points: Array.from({ length: 40 }, () => ({ x: 0, y: 0 })),
        speed: 0.3 + Math.random() * 0.4,
        amplitude: 4 + Math.abs(t - 0.5) * 8,
        phase: Math.random() * Math.PI * 2,
        opacity: 0.3 + (1 - Math.abs(t - 0.5)) * 0.6,
        thickness: 0.8 + (1 - Math.abs(t - 0.5)) * 0.8,
        baseYOffset: centerOffset * 30,
      };
    });

    let startTime = performance.now();
    const draw = (time: number) => {
      const elapsed = (time - startTime) / 1000;
      const w = canvas.width / (window.devicePixelRatio || 1);
      const h = canvas.height / (window.devicePixelRatio || 1);

      ctx.clearRect(0, 0, w, h);

      linesRef.current.forEach((line, lineIdx) => {
        const baseY = h * 0.5 + (line.baseYOffset || 0);
        const { points, speed, amplitude, phase, opacity, thickness } = line;

        for (let i = 0; i < points.length; i++) {
          const tx = (i / (points.length - 1)) * w;
          const freq1 = 0.008 + lineIdx * 0.002;
          const freq2 = 0.015 + lineIdx * 0.003;

          const waveY =
            Math.sin(tx * freq1 + elapsed * speed + phase) * amplitude +
            Math.sin(tx * freq2 + elapsed * speed * 0.6 + phase * 1.3) * (amplitude * 0.4);

          points[i] = { x: tx, y: baseY + waveY };
        }

        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);

        for (let i = 1; i < points.length - 1; i++) {
          const xc = (points[i].x + points[i + 1].x) / 2;
          const yc = (points[i].y + points[i + 1].y) / 2;
          ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
        }

        const grad = ctx.createLinearGradient(0, 0, w, 0);
        grad.addColorStop(0, `rgba(255,255,255,0)`);
        grad.addColorStop(0.15, `rgba(200,210,255,${opacity})`);
        grad.addColorStop(0.5, `rgba(255,255,255,${opacity})`);
        grad.addColorStop(0.85, `rgba(200,210,255,${opacity})`);
        grad.addColorStop(1, `rgba(255,255,255,0)`);

        ctx.strokeStyle = grad;
        ctx.lineWidth = thickness;
        ctx.lineCap = 'round';
        ctx.stroke();

        ctx.shadowBlur = 6;
        ctx.shadowColor = 'rgba(180,200,255,0.5)';
        ctx.stroke();
        ctx.shadowBlur = 0;
      });

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [height]);

  return (
    <div
      className="w-full overflow-hidden"
      style={{ height: `${height}px`, position: 'relative' }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          width: '100%',
          height: `${height}px`,
        }}
      />
    </div>
  );
}

export default FooterWave;
