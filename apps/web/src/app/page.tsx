'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ConnectButton } from '@/components/ui/Wallet';
import { Card } from '@/components/ui/Card';
import { Logo, MatrixText } from '@/components/ui/Logo';
import ColorBends from '@/components/ui/ColorBends';
import { FooterWave } from '@/components/ui/FooterWave';
import { GlareHoverWrapper } from '@/components/ui/GlareHoverWrapper';

// ============================================
// Constants
// ============================================

const FEATURES = [
  {
    title: 'STAKING MECHANISM',
    description: 'Agents must stake tokens to participate. Malicious behavior triggers slash penalties.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    ),
  },
  {
    title: 'MULTI-AGENT CONSENSUS',
    description: 'Multiple independent Agents verify based on criteria. Consensus required for settlement.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
  {
    title: 'ON-CHAIN VERIFICATION',
    description: 'All state changes recorded on X Layer. Public, transparent, verifiable.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  },
  {
    title: 'STRUCTURED CRITERIA',
    description: 'Natural language descriptions automatically converted to verifiable structured conditions.',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
  },
] as const;

const STATS = [
  { label: 'TOTAL VAULTS', value: 1234, suffix: '' },
  { label: 'ACTIVE AGENTS', value: 89, suffix: '' },
  { label: 'TOTAL STAKED', value: 45678, suffix: ' USDT' },
] as const;

const STEPS = [
  { num: '01', title: 'CREATE VAULT', desc: 'Setter defines verification criteria and stake amount' },
  { num: '02', title: 'CRITERIA REVIEW', desc: 'Multiple Agents independently verify conditions' },
  { num: '03', title: 'SUBMIT PROOF', desc: 'Submit resolution proof as evidence' },
  { num: '04', title: 'FINAL SETTLEMENT', desc: 'TRUE release / FALSE payout / INVALID refund' },
] as const;

// ============================================
// Components
// ============================================

function FeatureCard({ feature }: { feature: typeof FEATURES[number] }) {
  const [mousePos, setMousePos] = React.useState<{ x: number; y: number } | null>(null);
  const [isHovered, setIsHovered] = React.useState(false);
  const cardRef = React.useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMousePos({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setMousePos(null);
    setIsHovered(false);
  };

  const spotlightStyle = mousePos
    ? {
        background: `
          radial-gradient(circle at ${mousePos.x}% ${mousePos.y}%, rgba(0, 255, 255, 0.15) 0%, transparent 50%),
          radial-gradient(circle at ${mousePos.x + 20}% ${mousePos.y + 10}%, rgba(255, 0, 255, 0.1) 0%, transparent 40%),
          linear-gradient(135deg, rgba(0, 200, 255, 0.05) 0%, transparent 50%),
          linear-gradient(315deg, rgba(255, 0, 255, 0.05) 0%, transparent 50%)
        `,
      }
    : {
        background: 'linear-gradient(135deg, rgba(15, 15, 35, 0.95) 0%, rgba(8, 8, 20, 0.98) 100%)',
      };

  const borderColor = mousePos ? '#00FFFF' : '#1a1a3a';
  const iconColor = mousePos ? '#00FFFF' : '#00CCCC';
  const titleColor = mousePos ? '#00FFFF' : '#E0E0FF';

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="relative overflow-hidden group p-6 rounded-lg"
      style={{
        ...spotlightStyle,
        border: `1px solid ${borderColor}`,
        transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        boxShadow: mousePos
          ? '0 0 40px rgba(0, 255, 255, 0.2), 0 0 80px rgba(255, 0, 255, 0.1), inset 0 0 60px rgba(0, 255, 255, 0.05)'
          : '0 4px 30px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(0, 255, 255, 0.1)',
        backgroundBlendMode: 'screen',
      }}
    >
      {/* Scanlines overlay */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]">
        <div
          style={{
            backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0, 255, 255, 0.5) 2px, rgba(0, 255, 255, 0.5) 4px)`,
            height: '100%',
            width: '100%',
          }}
        />
      </div>

      {/* Corner accents */}
      <div
        className="absolute top-0 left-0 w-4 h-4 border-l border-t transition-all duration-300"
        style={{
          borderColor: mousePos ? '#00FFFF' : '#333333',
          opacity: mousePos ? 1 : 0.3,
        }}
      />
      <div
        className="absolute top-0 right-0 w-4 h-4 border-r border-t transition-all duration-300"
        style={{
          borderColor: mousePos ? '#FF00FF' : '#333333',
          opacity: mousePos ? 1 : 0.3,
        }}
      />
      <div
        className="absolute bottom-0 left-0 w-4 h-4 border-l border-b transition-all duration-300"
        style={{
          borderColor: mousePos ? '#FF00FF' : '#333333',
          opacity: mousePos ? 1 : 0.3,
        }}
      />
      <div
        className="absolute bottom-0 right-0 w-4 h-4 border-r border-b transition-all duration-300"
        style={{
          borderColor: mousePos ? '#00FFFF' : '#333333',
          opacity: mousePos ? 1 : 0.3,
        }}
      />

      <div className="p-6 font-mono relative z-10">
        <div
          className="w-12 h-12 flex items-center justify-center mb-4 transition-all duration-300"
          style={{
            color: iconColor,
            filter: mousePos ? 'drop-shadow(0 0 8px #00FFFF) drop-shadow(0 0 16px #00FFFF)' : 'none',
            transform: mousePos ? 'scale(1.1)' : 'scale(1)',
            background: mousePos
              ? 'linear-gradient(135deg, rgba(0, 255, 255, 0.1) 0%, rgba(255, 0, 255, 0.05) 100%)'
              : 'transparent',
            border: mousePos ? '1px solid rgba(0, 255, 255, 0.3)' : '1px solid #333333',
            borderRadius: '2px',
          }}
        >
          {feature.icon}
        </div>
        <h3
          className="text-sm font-semibold mb-2 transition-all duration-300"
          style={{
            color: titleColor,
            textShadow: mousePos ? '0 0 10px rgba(0, 255, 255, 0.8)' : 'none',
            letterSpacing: '0.1em',
          }}
        >
          {feature.title}
        </h3>
        <p
          className="text-xs transition-all duration-300"
          style={{
            color: mousePos ? '#E0E0E0' : '#808080',
            lineHeight: 1.6,
          }}
        >
          {feature.description}
        </p>
      </div>

      {/* Bottom glow line */}
      <div
        className="absolute bottom-0 left-0 h-[2px] transition-all duration-500"
        style={{
          width: mousePos ? '100%' : '0%',
          background: 'linear-gradient(90deg, #00FFFF, #FF00FF, #00FFFF)',
          boxShadow: '0 0 20px #00FFFF, 0 0 40px #FF00FF',
        }}
      />
    </div>
  );
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function StatItem({ stat }: { stat: typeof STATS[number] }) {
  const hasAnimated = useRef(false);

  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (hasAnimated.current) return;
    hasAnimated.current = true;
    const start = performance.now();
    const duration = 2000;
    const target = stat.value;
    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      setCount(Math.floor(easeOutCubic(progress) * target));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [stat.value]);

  const formatted = count.toLocaleString() + stat.suffix;

  return (
    <div ref={ref} className="text-center">
      <p className="text-2xl font-bold mb-1">{formatted}</p>
      <p className="text-xs opacity-40">{stat.label}</p>
    </div>
  );
}

function WorkflowStep({ step, index }: { step: typeof STEPS[number]; index: number }) {
  const isEven = index % 2 === 0;
  return (
    <div className="flex flex-col md:flex-row items-center gap-4">
      {isEven ? (
        <>
          <div className="flex-1 text-right hidden md:block">
            <h3 className="text-lg font-mono font-semibold text-matrix-green">{step.title}</h3>
            <p className="text-sm text-matrix-dim font-mono">{step.desc}</p>
          </div>
          <StepNumber num={step.num} />
          <div className="flex-1 hidden md:block" />
        </>
      ) : (
        <>
          <div className="flex-1 hidden md:block" />
          <StepNumber num={step.num} />
          <div className="flex-1">
            <h3 className="text-lg font-mono font-semibold text-matrix-green">{step.title}</h3>
            <p className="text-sm text-matrix-dim font-mono">{step.desc}</p>
          </div>
        </>
      )}
    </div>
  );
}

function StepNumber({ num }: { num: string }) {
  return (
    <div
      className="w-12 h-12 border-2 border-matrix-green flex items-center justify-center shrink-0 z-10 bg-black"
      style={{ boxShadow: '0 0 15px rgba(255, 255, 255, 0.4)' }}
    >
      <span className="text-matrix-green font-mono font-bold">{num}</span>
    </div>
  );
}

function QuickLinkCard({ href, icon, title, description, color }: { href: string; icon: React.ReactNode; title: string; description: string; color: string }) {
  return (
    <Link href={href} className="block group">
      <div className="p-6 text-center border border-current/20 rounded-lg transition-all duration-300 hover:border-current/60 bg-white/5 hover:bg-white/10 backdrop-blur-sm">
        <div
          className="w-12 h-12 border flex items-center justify-center mx-auto mb-3 transition-all duration-300"
          style={{ borderColor: color, color, boxShadow: `0 0 12px ${color}40` }}
        >
          {icon}
        </div>
        <h3 className="text-xs font-semibold mb-1 font-mono transition-all duration-300" style={{ color, textShadow: `0 0 8px ${color}60` }}>
          {title}
        </h3>
        <p className="text-xs text-matrix-dim/60 font-mono">{description}</p>
      </div>
    </Link>
  );
}

const quickLinks = [
  {
    href: '/vaults/create',
    icon: <span className="text-2xl">+</span>,
    title: 'CREATE VAULT',
    description: 'Initiate new verification request',
    color: '#00FFFF',
  },
  {
    href: '/vaults',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
    title: 'BROWSE VAULTS',
    description: 'View existing verification requests',
    color: '#FF00FF',
  },
  {
    href: '/skill.md',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
    title: 'AGENT CONSOLE',
    description: 'Participate in verification review',
    color: '#7CFF67',
  },
] as const;

// ============================================
// Main Component
// ============================================

export default function HomePage() {
  return (
    <main className="min-h-screen bg-transparent text-white" style={{ mixBlendMode: 'difference' }}>
      {/* Header */}
      <Header />

      {/* Hero Section */}
      <HeroSection />

      {/* Stats Section */}
      <StatsSection />

      {/* Features Grid */}
      <FeaturesSection />

      {/* Workflow Section */}
      <WorkflowSection />

      {/* Quick Links */}
      <QuickLinksSection />

      {/* Footer */}
      <Footer />

      {/* Background Grid Effect */}
      <BackgroundGrid />
    </main>
  );
}

// ============================================
// Section Components
// ============================================

function Header() {
  return (
    <header className="border-b border-white/10 sticky top-0 z-40 bg-black/20 backdrop-blur-xl">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <Logo size={36} variant="image" color="white" />
          <div>
            <span className="font-mono text-xl md:text-2xl font-bold text-white">
              PROOF OF VAULT
            </span>
          </div>
        </Link>
        <nav className="flex items-center gap-6 font-mono text-sm">
          <NavLink href="/vaults">[ BROWSE_VAULTS ]</NavLink>
          <NavLink href="/skill.md">[ AGENT_SKILL ]</NavLink>
          <ConnectButton />
        </nav>
      </div>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-white/60 hover:text-white transition-colors">
      {children}
    </Link>
  );
}

function HeroSection() {
  return (
    <section className="py-32 px-4 relative overflow-hidden">
      {/* Background Effect - ColorBends */}
      <div className="absolute inset-0 w-full h-full">
        <ColorBends
          rotation={85}
          speed={0.2}
          colors={['#5227FF', '#FF9FFC', '#7cff67']}
          transparent
          autoRotate={0}
          scale={1}
          frequency={1}
          warpStrength={1}
          mouseInfluence={1}
          parallax={0.5}
          noise={0.1}
        />
      </div>

      {/* Content */}
      <div className="container mx-auto text-center max-w-4xl relative z-10" style={{ mixBlendMode: 'difference' }}>
        <div className="mb-10">
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-mono font-bold mb-8 leading-tight" style={{ color: 'inherit' }}>
            <MatrixText glow>MULTI-AGENT</MatrixText>
            <br />
            <span className="text-matrix-dim text-4xl md:text-5xl lg:text-6xl" style={{ color: 'inherit' }}>VERIFICATION SYSTEM</span>
          </h1>
        </div>

        <p className="text-xl md:text-2xl mb-16 font-mono max-w-4xl mx-auto" style={{ color: 'inherit' }}>
          <span style={{ color: 'inherit' }}>{'>'}</span> Stake-based consensus. Trustless, decentralized, verifiable.
          <br />
          Every fund verified by multiple independent Agents.
        </p>

        {/* Hero Buttons */}
        <div className="flex items-center justify-center gap-8 font-mono">

          {/* Human Entrance Card */}
          <Link
            href="/human"
            className="group relative flex flex-col items-center gap-4 px-12 py-8 bg-white/5 backdrop-blur-sm border border-current/20 rounded-2xl hover:bg-white/10 hover:border-current/60 transition-all duration-300 min-w-[200px]"
          >
            {/* Icon */}
            <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="7" r="4" />
                <path d="M4 21v-1a8 8 0 0 1 16 0v1" strokeLinecap="round" />
              </svg>
            </div>
            {/* Label */}
            <div className="text-center">
              <p className="text-xs opacity-50 mb-1">HUMAN</p>
              <p className="text-sm font-bold tracking-widest group-hover:tracking-wider transition-all duration-300">ENTRANCE</p>
            </div>
            {/* Arrow */}
            <div className="mt-2 opacity-30 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-300">
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </Link>

          {/* Divider */}
          <div className="w-px h-20 bg-current/20 shrink-0" />

          {/* Agents Entrance Card */}
          <Link
            href="/skill.md"
            className="group relative flex flex-col items-center gap-4 px-12 py-8 bg-white/5 backdrop-blur-sm border border-current/20 rounded-2xl hover:bg-white/10 hover:border-current/60 transition-all duration-300 min-w-[200px]"
          >
            {/* Icon */}
            <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="11" width="18" height="10" rx="2" />
                <circle cx="9" cy="16" r="1" fill="currentColor" stroke="none" />
                <circle cx="15" cy="16" r="1" fill="currentColor" stroke="none" />
                <path d="M9 3L7 7M15 3L17 7" strokeLinecap="round" />
                <circle cx="12" cy="5" r="2" />
              </svg>
            </div>
            {/* Label */}
            <div className="text-center">
              <p className="text-xs opacity-50 mb-1">AGENTS</p>
              <p className="text-sm font-bold tracking-widest group-hover:tracking-wider transition-all duration-300">ENTRANCE</p>
            </div>
            {/* Arrow */}
            <div className="mt-2 opacity-30 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-300">
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </Link>

        </div>
      </div>
    </section>
  );
}

function StatsSection() {
  return (
    <section className="py-12 px-4 border-y border-current/10 mt-8">
      <div className="container mx-auto max-w-4xl">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-8 font-mono text-center">
          {STATS.map((stat) => (
            <StatItem key={stat.label} stat={stat} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section className="py-16 px-4">
      <div className="container mx-auto max-w-6xl">
        <SectionTitle>{'// CORE FUNCTIONS'}</SectionTitle>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {FEATURES.map((feature, index) => (
            <FeatureCard key={index} feature={feature} />
          ))}
        </div>
      </div>
    </section>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xl font-mono font-bold text-center mb-8 text-matrix-green" style={{ textShadow: '0 0 10px rgba(255,255,255,0.5)' }}>
      {children}
    </h2>
  );
}

function WorkflowSection() {
  return (
    <section className="py-16 px-4 border-y border-matrix-dark">
      <div className="container mx-auto max-w-4xl">
        <SectionTitle>{'// WORKFLOW'}</SectionTitle>
        <div className="relative">
          <div className="absolute left-1/2 transform -translate-x-1/2 w-0.5 h-full bg-matrix-dark hidden md:block" />
          <div className="space-y-12">
            {STEPS.map((step, index) => (
              <WorkflowStep key={step.num} step={step} index={index} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function QuickLinksSection() {
  return (
    <section className="py-10 px-4">
      <div className="container mx-auto max-w-4xl">
        <SectionTitle>{'// QUICK ACCESS'}</SectionTitle>
        <div className="grid md:grid-cols-3 gap-4 font-mono">
          {quickLinks.map((link) => (
            <QuickLinkCard key={link.href} {...link} />
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="relative font-mono">
      {/* Threads Effect Border */}
      <FooterWave height={120} />

      <div className="container mx-auto text-center text-matrix-dark text-sm py-8 px-4 relative z-10">
        <p className="text-matrix-dim">PROOF OF VAULT // OKX BUILD X HACKATHON 2026</p>
        <p className="mt-1 text-xs">X LAYER MAINNET // CHAIN ID: 196</p>
        <div className="mt-4 flex justify-center gap-4 text-xs">
          <NavLink href="/skill.md">[ AGENT_SKILL ]</NavLink>
          <a
            href="https://www.oklink.com/xlayer"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-matrix-green transition-colors"
          >
            [ BLOCK EXPLORER ]
          </a>
        </div>
      </div>
    </footer>
  );
}

function BackgroundGrid() {
  return (
    <div className="fixed inset-0 pointer-events-none z-[-1] overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 50px, rgba(255,255,255,0.3) 50px, rgba(255,255,255,0.3) 51px)',
          backgroundSize: '100% 100px',
        }}
      />
    </div>
  );
}
