'use client';

import { useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface GlareMeshProps {
  color?: string;
}

function GlareMesh({ color = '#00FFFF' }: GlareMeshProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 });
  const targetPos = useRef({ x: 0.5, y: 0.5 });
  const colorObj = useMemo(() => new THREE.Color(color), [color]);
  const secondaryColor = useMemo(() => new THREE.Color('#FF00FF'), []);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      uColor: { value: colorObj },
      uSecondaryColor: { value: secondaryColor },
    }),
    [colorObj, secondaryColor]
  );

  const handlePointerMove = (e: { uv?: { x: number; y: number } }) => {
    if (e.uv) {
      targetPos.current = { x: e.uv.x, y: 1.0 - e.uv.y };
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setMousePos((prev) => ({
        x: prev.x + (targetPos.current.x - prev.x) * 0.08,
        y: prev.y + (targetPos.current.y - prev.y) * 0.08,
      }));
    }, 16);
    return () => clearInterval(interval);
  }, []);

  useFrame((state) => {
    if (meshRef.current) {
      uniforms.uTime.value = state.clock.elapsedTime;
      uniforms.uMouse.value.set(mousePos.x, mousePos.y);
    }
  });

  const shaderMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uTime;
          uniform vec2 uMouse;
          uniform vec3 uColor;
          uniform vec3 uSecondaryColor;
          varying vec2 vUv;

          void main() {
            vec2 dir = vUv - uMouse;
            float dist = length(dir);

            // Primary glare from mouse
            float glare = 1.0 - smoothstep(0.0, 0.4, dist);

            // Secondary glow offset from mouse
            vec2 glareCenter2 = uMouse + vec2(0.15, 0.1);
            float dist2 = length(vUv - glareCenter2);
            float glare2 = (1.0 - smoothstep(0.0, 0.25, dist2)) * 0.4;

            // Animated pulse
            float pulse = 0.85 + sin(uTime * 3.0) * 0.15;

            // Cyberpunk grid effect
            float gridX = step(0.98, fract(vUv.x * 20.0)) * 0.1;
            float gridY = step(0.98, fract(vUv.y * 20.0)) * 0.1;
            float grid = max(gridX, gridY);

            // Edge glow
            float edgeGlowX = pow(1.0 - abs(vUv.x - 0.5) * 2.0, 4.0) * 0.12;
            float edgeGlowY = pow(1.0 - abs(vUv.y - 0.5) * 2.0, 4.0) * 0.12;
            float edgeGlow = edgeGlowX + edgeGlowY;

            // Scanline effect
            float scanline = sin(vUv.y * 80.0 + uTime * 2.0) * 0.03;

            // Final composition
            vec3 baseColor = vec3(0.02, 0.02, 0.04);
            vec3 glareColor = mix(uColor, vec3(1.0), 0.2);
            vec3 secondaryGlare = uSecondaryColor * glare2;

            vec3 finalColor = baseColor;
            finalColor += glareColor * glare * 0.5 * pulse;
            finalColor += secondaryGlare;
            finalColor += uColor * edgeGlow;
            finalColor += vec3(grid * 0.5);
            finalColor += vec3(scanline);

            float alpha = max(glare * 0.4, edgeGlow * 0.3) * pulse;

            gl_FragColor = vec4(finalColor, max(alpha, 0.01));
          }
        `,
        transparent: true,
        side: THREE.DoubleSide,
      }),
    [uniforms]
  );

  return (
    <mesh
      ref={meshRef}
      material={shaderMaterial}
      onPointerMove={(e) => handlePointerMove(e)}
      onPointerLeave={() => (targetPos.current = { x: 0.5, y: 0.5 })}
    >
      <planeGeometry args={[1.02, 1.02]} />
    </mesh>
  );
}

interface GlareCardProps {
  children: React.ReactNode;
  className?: string;
  color?: string;
  onClick?: () => void;
}

export function GlareCard({ children, className = '', color = '#00FFFF', onClick }: GlareCardProps) {
  return (
    <div className={`relative overflow-hidden cursor-pointer ${className}`} onClick={onClick}>
      <div className="absolute inset-0 z-10 pointer-events-none">
        <Canvas camera={{ position: [0, 0, 1], fov: 75 }} gl={{ alpha: true }}>
          <GlareMesh color={color} />
        </Canvas>
      </div>
      <div className="relative z-20">{children}</div>
    </div>
  );
}

export default GlareCard;