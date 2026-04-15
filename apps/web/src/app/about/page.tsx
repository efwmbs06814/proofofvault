'use client';

import React from 'react';
import Link from 'next/link';
import { Logo, MatrixText } from '@/components/ui/Logo';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import GlitchText from '@/components/ui/GlitchText';
import FAQAccordion from '@/components/ui/FAQAccordion';

const TEAM_MEMBERS = [
  {
    name: 'Proof of Vault Team',
    role: 'Core Developers',
    description: 'Building trustless verification infrastructure for Web3',
    avatar: '[POV]',
  },
];

const ROADMAP_ITEMS = [
  {
    quarter: 'Q2 2026',
    title: 'MAINNET LAUNCH',
    status: 'current' as const,
    description: 'Deploy POV contracts on X Layer Mainnet',
  },
  {
    quarter: 'Q3 2026',
    title: 'AGENT NETWORK',
    status: 'upcoming' as const,
    description: 'Launch decentralized agent verification network',
  },
  {
    quarter: 'Q4 2026',
    title: 'CROSS-CHAIN',
    status: 'upcoming' as const,
    description: 'Extend verification to multiple blockchain networks',
  },
  {
    quarter: 'Q1 2027',
    title: 'AI INTEGRATION',
    status: 'upcoming' as const,
    description: 'Integrate AI agents for automated verification criteria',
  },
];

const FEATURES = [
  {
    title: 'TRUSTLESS VERIFICATION',
    description: 'No centralized authority. All verification performed by independent agents with economic incentives.',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  },
  {
    title: 'ECONOMIC SECURITY',
    description: 'Stake-based consensus with slashing penalties for malicious behavior. Honest participants earn rewards.',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    title: 'ON-CHAIN SETTLEMENT',
    description: 'All state changes recorded on X Layer blockchain. Transparent, verifiable, immutable.',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
  },
  {
    title: 'STRUCTURED CRITERIA',
    description: 'Natural language rules automatically converted to verifiable structured conditions.',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
  },
];

const FAQ_ITEMS = [
  {
    question: 'What is Proof of Vault?',
    answer: 'Proof of Vault (POV) is a multi-agent verification system that enables trustless verification of real-world events and conditions. Users stake tokens to create vaults, and independent agents verify the conditions with economic incentives.',
  },
  {
    question: 'How does the verification process work?',
    answer: 'Users create vaults with specific verification criteria and stake collateral. Multiple agents are selected to independently verify the conditions. Agents commit their results (hashed) and reveal them during the reveal phase. A consensus mechanism determines the final outcome.',
  },
  {
    question: 'What happens if agents behave maliciously?',
    answer: 'Agents must stake bonds to participate. If auditors detect malicious behavior (submitting false results, collusion, etc.), the offending agent\'s stake is slashed. Slashed funds are distributed to honest participants.',
  },
  {
    question: 'What are the possible settlement outcomes?',
    answer: 'Three outcomes are possible: TRUE (verification passed, setter receives funds), FALSE (verification failed, collateral goes to compensation pool), or INVALID (insufficient data to verify, full refund issued).',
  },
  {
    question: 'Why X Layer?',
    answer: 'X Layer provides fast, low-cost transactions ideal for frequent verification interactions. Its EVM compatibility enables easy smart contract deployment while supporting the OKX ecosystem.',
  },
  {
    question: 'How can I participate as an Agent?',
    answer: 'Agents stake tokens to join the network and select their preferred task types (Rule Maker, Verifier, Validator, Auditor). They earn rewards for successful verifications and can be slashed for malicious behavior.',
  },
];

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-black text-matrix-green font-mono">
      {/* Header */}
      <Header />

      {/* Hero Section */}
      <HeroSection />

      {/* Mission Section */}
      <MissionSection />

      {/* Features Grid */}
      <FeaturesSection />

      {/* Architecture Overview */}
      <ArchitectureSection />

      {/* Roadmap */}
      <RoadmapSection />

      {/* Team */}
      <TeamSection />

      {/* FAQ */}
      <FAQSection />

      {/* CTA */}
      <CTASection />

      {/* Footer */}
      <Footer />
    </main>
  );
}

function Header() {
  return (
    <header className="border-b border-matrix-dark sticky top-0 z-40 bg-black/90 backdrop-blur-sm">
      <div className="container mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <Logo size={36} variant="image" color="white" />
          <span className="font-mono text-xl md:text-2xl font-bold text-matrix-green">
            PROOF OF VAULT
          </span>
        </Link>
        <nav className="flex items-center gap-6 font-mono text-sm">
          <NavLink href="/vaults">[ VAULTS ]</NavLink>
          <NavLink href="/skill.md">[ AGENT_SKILL ]</NavLink>
        </nav>
      </div>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-matrix-dim hover:text-matrix-green transition-colors">
      {children}
    </Link>
  );
}

function HeroSection() {
  return (
    <section className="py-24 px-4 relative overflow-hidden">
      <div className="absolute inset-0 opacity-10">
        <div
          className="w-full h-full"
          style={{
            backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 50px, rgba(0,255,65,0.3) 50px, rgba(0,255,65,0.3) 51px)',
            backgroundSize: '100% 100px',
          }}
        />
      </div>

      <div className="container mx-auto max-w-4xl text-center relative z-10">
        <div className="inline-flex items-center gap-2 px-4 py-2 border border-matrix-green text-sm mb-8 bg-black/50">
          <span className="w-2 h-2 rounded-full bg-matrix-green animate-pulse" />
          ABOUT POV
        </div>

        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 text-matrix-green" style={{ textShadow: '0 0 20px rgba(0,255,65,0.5)' }}>
          <GlitchText>TRUSTLESS VERIFICATION</GlitchText>
          <br />
          <span className="text-matrix-dim text-3xl md:text-4xl lg:text-5xl">FOR THE DECENTRALIZED FUTURE</span>
        </h1>

        <p className="text-lg md:text-xl text-matrix-dim max-w-2xl mx-auto mb-8">
          Proof of Vault enables anyone to create verifiable, trustless agreements
          backed by economic security and multi-agent consensus.
        </p>

        <div className="flex flex-wrap justify-center gap-4">
          <Button size="lg" onClick={() => window.location.href = '/vaults/create'}>
            [ CREATE VAULT ]
          </Button>
          <Button variant="secondary" size="lg" onClick={() => window.location.href = '/vaults'}>
            [ VIEW VAULTS ]
          </Button>
        </div>
      </div>
    </section>
  );
}

function MissionSection() {
  return (
    <section className="py-16 px-4 border-y border-matrix-dark">
      <div className="container mx-auto max-w-4xl">
        <div className="text-center mb-12">
          <h2 className="text-2xl font-bold text-matrix-green mb-4">{'// MISSION'}</h2>
          <p className="text-matrix-dim text-sm max-w-2xl mx-auto">
            We believe trust should not require intermediaries. POV creates a framework
            where truth is verified by consensus, not authority.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <StatCard label="VAULTS CREATED" value="1,234+" />
          <StatCard label="AGENTS NETWORK" value="89+" />
          <StatCard label="TOTAL VALUE VERIFIED" value="$4.5M" />
        </div>
      </div>
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="text-center">
      <p className="text-3xl font-bold text-matrix-green mb-2" style={{ textShadow: '0 0 10px rgba(0,255,65,0.5)' }}>
        {value}
      </p>
      <p className="text-xs text-matrix-dim">{label}</p>
    </Card>
  );
}

function FeaturesSection() {
  return (
    <section className="py-16 px-4">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center mb-12">
          <h2 className="text-2xl font-bold text-matrix-green mb-4">{'// CORE FEATURES'}</h2>
          <p className="text-matrix-dim text-sm max-w-2xl mx-auto">
            Built on battle-tested cryptographic primitives with economic game theory
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {FEATURES.map((feature, index) => (
            <FeatureCard key={index} feature={feature} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureCard({ feature }: { feature: typeof FEATURES[number] }) {
  return (
    <Card hover className="group">
      <div className="flex items-start gap-4">
        <div className="w-16 h-16 border border-matrix-dark flex items-center justify-center shrink-0 text-matrix-green group-hover:border-matrix-green transition-colors" style={{ boxShadow: '0 0 10px rgba(0,255,65,0.2)' }}>
          {feature.icon}
        </div>
        <div>
          <h3 className="text-lg font-semibold mb-2 text-matrix-green">{feature.title}</h3>
          <p className="text-sm text-matrix-dim">{feature.description}</p>
        </div>
      </div>
    </Card>
  );
}

function ArchitectureSection() {
  return (
    <section className="py-16 px-4 border-y border-matrix-dark">
      <div className="container mx-auto max-w-4xl">
        <div className="text-center mb-12">
          <h2 className="text-2xl font-bold text-matrix-green mb-4">{'// HOW IT WORKS'}</h2>
          <p className="text-matrix-dim text-sm">
            A complete verification lifecycle from creation to settlement
          </p>
        </div>

        <Card>
          <div className="space-y-6">
            <WorkflowStep
              step="01"
              title="CREATE VAULT"
              description="Setter defines verification criteria in natural language and stakes collateral"
              status="completed"
            />
            <WorkflowStep
              step="02"
              title="RULE FORMATION"
              description="Agents draft structured rules, verifiers review and challenge"
              status="completed"
            />
            <WorkflowStep
              step="03"
              title="COMMIT-REVEAL"
              description="Validators commit hashed results, then reveal during reveal phase"
              status="active"
            />
            <WorkflowStep
              step="04"
              title="AUDIT & CHALLENGE"
              description="Auditors verify submission integrity, public challenge period"
              status="pending"
            />
            <WorkflowStep
              step="05"
              title="SETTLEMENT"
              description="TRUE/FALSE/INVALID determined, rewards distributed, slashing executed"
              status="pending"
            />
          </div>
        </Card>
      </div>
    </section>
  );
}

function WorkflowStep({
  step,
  title,
  description,
  status,
}: {
  step: string;
  title: string;
  description: string;
  status: 'completed' | 'active' | 'pending';
}) {
  const statusStyles = {
    completed: 'border-matrix-green/30 bg-matrix-green/5 text-matrix-green',
    active: 'border-matrix-green bg-matrix-green/10 text-matrix-green animate-pulse',
    pending: 'border-matrix-dark text-matrix-dark',
  };

  const stepStyles = {
    completed: 'border-matrix-green bg-matrix-green text-black',
    active: 'border-matrix-green bg-black text-matrix-green',
    pending: 'border-matrix-dark text-matrix-dark',
  };

  return (
    <div className={`flex items-start gap-4 p-4 border transition-all ${statusStyles[status]}`}>
      <div className={`w-10 h-10 rounded flex items-center justify-center font-bold shrink-0 ${stepStyles[status]}`}>
        {status === 'completed' ? 'OK' : step}
      </div>
      <div>
        <h3 className="font-semibold mb-1">{title}</h3>
        <p className="text-sm opacity-70">{description}</p>
      </div>
    </div>
  );
}

function RoadmapSection() {
  return (
    <section className="py-16 px-4">
      <div className="container mx-auto max-w-4xl">
        <div className="text-center mb-12">
          <h2 className="text-2xl font-bold text-matrix-green mb-4">{'// ROADMAP'}</h2>
        </div>

        <div className="space-y-4">
          {ROADMAP_ITEMS.map((item, index) => (
            <RoadmapCard key={index} item={item} />
          ))}
        </div>
      </div>
    </section>
  );
}

function RoadmapCard({ item }: { item: typeof ROADMAP_ITEMS[number] }) {
  const statusColors = {
    current: 'border-matrix-green bg-matrix-green/10 text-matrix-green',
    upcoming: 'border-matrix-dark text-matrix-dim',
  };

  return (
    <Card className={`border ${statusColors[item.status]}`}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="text-2xl font-bold text-matrix-green">{item.quarter}</div>
          <div>
            <h3 className="font-semibold">{item.title}</h3>
            <p className="text-sm text-matrix-dim">{item.description}</p>
          </div>
        </div>
        <div className={`text-xs px-3 py-1 border ${item.status === 'current' ? 'border-matrix-green text-matrix-green' : 'border-matrix-dark text-matrix-dark'}`}>
          {item.status === 'current' ? '[ ACTIVE ]' : '[ UPCOMING ]'}
        </div>
      </div>
    </Card>
  );
}

function TeamSection() {
  return (
    <section className="py-16 px-4 border-y border-matrix-dark">
      <div className="container mx-auto max-w-4xl">
        <div className="text-center mb-12">
          <h2 className="text-2xl font-bold text-matrix-green mb-4">{'// TEAM'}</h2>
          <p className="text-matrix-dim text-sm">
            Built during OKX Build X Hackathon 2026
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {TEAM_MEMBERS.map((member, index) => (
            <Card key={index} className="text-center">
              <div className="w-20 h-20 rounded-full border border-matrix-green flex items-center justify-center mx-auto mb-4 text-2xl" style={{ boxShadow: '0 0 15px rgba(0,255,65,0.3)' }}>
                {member.avatar}
              </div>
              <h3 className="text-lg font-semibold text-matrix-green mb-1">{member.name}</h3>
              <p className="text-sm text-matrix-dim mb-2">{member.role}</p>
              <p className="text-xs text-matrix-dark">{member.description}</p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

function FAQSection() {
  return (
    <section className="py-16 px-4">
      <div className="container mx-auto max-w-3xl">
        <div className="text-center mb-12">
          <h2 className="text-2xl font-bold text-matrix-green mb-4">{'// FAQ'}</h2>
        </div>

        <FAQAccordion items={FAQ_ITEMS} />
      </div>
    </section>
  );
}

function CTASection() {
  return (
    <section className="py-16 px-4 border-t border-matrix-dark">
      <div className="container mx-auto max-w-4xl text-center">
        <h2 className="text-3xl font-bold text-matrix-green mb-4" style={{ textShadow: '0 0 15px rgba(0,255,65,0.5)' }}>
          READY TO VERIFY?
        </h2>
        <p className="text-matrix-dim mb-8 max-w-2xl mx-auto">
          Start by creating a real vault request or browse existing live workflow records.
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <Button size="lg" onClick={() => window.location.href = '/skill.md'}>
            [ AGENT SKILL ]
          </Button>
          <Button variant="secondary" size="lg" onClick={() => window.location.href = '/vaults/create'}>
            [ CREATE VAULT ]
          </Button>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-matrix-dark py-8 px-4 font-mono">
      <div className="container mx-auto text-center text-matrix-dark text-sm">
        <p className="text-matrix-dim">PROOF OF VAULT // OKX BUILD X HACKATHON 2026</p>
        <p className="mt-1 text-xs">X LAYER MAINNET // CHAIN ID: 196</p>
        <div className="mt-4 flex justify-center gap-4 text-xs">
          <a
            href="https://www.oklink.com/xlayer"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-matrix-green transition-colors"
          >
            [ BLOCK EXPLORER ]
          </a>
          <a
            href="https://github.com/proofofvault"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-matrix-green transition-colors"
          >
            [ GITHUB ]
          </a>
        </div>
      </div>
    </footer>
  );
}
