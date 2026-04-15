'use client';

import React, { useState } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';

// ============================================
// Types
// ============================================

interface ResolutionPanelProps {
  vaultId: string;
  agentId: string;
  criteriaResults?: Array<{ criterion: string; passed: boolean; reason: string }>;
  onSubmit?: (result: 'TRUE' | 'FALSE' | 'INVALID', proof: string) => Promise<void>;
  className?: string;
}

interface CommitRevealPanelProps extends ResolutionPanelProps {
  onCommit?: (commitHash: string) => Promise<void>;
  commitPhase?: boolean;
  revealPhase?: boolean;
}

type ResolutionType = 'TRUE' | 'FALSE' | 'INVALID';

// ============================================
// Constants
// ============================================

const RESULT_CONFIG: Record<ResolutionType, { label: string; description: string; color: string; bgColor: string }> = {
  TRUE: { label: 'TRUE', description: 'All criteria met', color: 'border-matrix-green text-matrix-green', bgColor: 'bg-matrix-green/10' },
  FALSE: { label: 'FALSE', description: 'Criteria not met', color: 'border-red-500 text-red-400', bgColor: 'bg-red-500/10' },
  INVALID: { label: 'INVALID', description: 'Cannot verify', color: 'border-yellow-500 text-yellow-400', bgColor: 'bg-yellow-500/10' },
};

// ============================================
// Main Components
// ============================================

export function ResolutionPanel({
  vaultId,
  agentId,
  criteriaResults = [],
  onSubmit,
  className = '',
}: ResolutionPanelProps) {
  const [selectedResult, setSelectedResult] = useState<ResolutionType | null>(null);
  const [proof, setProof] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const suggestedResult = getSuggestedResult(criteriaResults);

  const handleSubmit = async () => {
    if (!selectedResult) { setError('Please select result'); return; }
    if (!proof.trim()) { setError('Please enter proof'); return; }
    setIsSubmitting(true);
    setError('');
    try {
      await onSubmit?.(selectedResult, proof);
    } catch (err: any) {
      setError(err.message || 'Submit failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className={className}>
      <h3 className="text-lg font-mono font-semibold mb-4 text-matrix-green">SUBMIT RESOLUTION</h3>

      <div className="mb-4">
        <label className="block text-sm font-mono text-matrix-dim mb-3">SELECT RESULT</label>
        <div className="grid grid-cols-3 gap-3">
          {(['TRUE', 'FALSE', 'INVALID'] as ResolutionType[]).map((result) => (
            <ResultButton
              key={result}
              result={result}
              isSelected={selectedResult === result}
              isSuggested={suggestedResult === result}
              onClick={() => setSelectedResult(result)}
            />
          ))}
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-mono text-matrix-dim mb-2">PROOF *</label>
        <textarea
          value={proof}
          onChange={(e) => setProof(e.target.value)}
          placeholder="Enter verification proof..."
          rows={6}
          className="w-full px-4 py-3 bg-black border border-matrix-dark text-matrix-green font-mono text-sm focus:border-matrix-green focus:outline-none resize-none placeholder:text-matrix-dark"
        />
        <p className="mt-2 text-xs text-matrix-dark font-mono">Proof stored on-chain. Ensure accuracy.</p>
      </div>

      {criteriaResults.length > 0 && <CriteriaSummary results={criteriaResults} />}

      {error && <ErrorMessage message={error} />}

      <Button
        onClick={handleSubmit}
        disabled={!selectedResult || !proof.trim() || isSubmitting}
        isLoading={isSubmitting}
        fullWidth
        size="lg"
      >
        [ SUBMIT ]
      </Button>
    </Card>
  );
}

// ============================================
// Commit-Reveal Panel
// ============================================

export function CommitRevealPanel({
  vaultId,
  agentId,
  criteriaResults = [],
  onSubmit,
  onCommit,
  commitPhase = true,
  revealPhase = false,
  className = '',
}: CommitRevealPanelProps) {
  const [step, setStep] = useState<'commit' | 'reveal' | 'done'>('commit');
  const [result, setResult] = useState<ResolutionType | null>(null);
  const [proof, setProof] = useState('');
  const [salt, setSalt] = useState('');
  const [commitHash, setCommitHash] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleCommit = async () => {
    if (!result || !proof) { setError('Select result and enter proof'); return; }
    setIsSubmitting(true);
    const hash = generateCommitHash({ vaultId, agentId, result, proof, salt });
    setCommitHash(hash);
    try {
      await onCommit?.(hash);
      setStep('reveal');
    } catch (err: any) {
      setError(err.message || 'Commit failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReveal = async () => {
    setIsSubmitting(true);
    try {
      await onSubmit?.(result!, proof);
      setStep('done');
    } catch (err: any) {
      setError(err.message || 'Reveal failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (step === 'done') {
    return <CommitDoneView commitHash={commitHash} />;
  }

  if (step === 'reveal') {
    return (
      <RevealPhaseView
        commitHash={commitHash}
        error={error}
        onReveal={handleReveal}
        isSubmitting={isSubmitting}
      />
    );
  }

  return (
    <Card className={className}>
      <h3 className="text-lg font-mono font-semibold mb-4 text-matrix-green">COMMIT-REVEAL SUBMIT</h3>

      <StepIndicator commitPhase={commitPhase} revealPhase={revealPhase} />

      <div className="mb-4">
        <label className="block text-sm font-mono text-matrix-dim mb-3">SELECT RESULT</label>
        <div className="grid grid-cols-3 gap-3">
          {(['TRUE', 'FALSE', 'INVALID'] as ResolutionType[]).map((r) => (
            <ResultButton
              key={r}
              result={r}
              isSelected={result === r}
              onClick={() => setResult(r)}
            />
          ))}
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-mono text-matrix-dim mb-2">PROOF</label>
        <textarea
          value={proof}
          onChange={(e) => setProof(e.target.value)}
          placeholder="Enter verification proof..."
          rows={4}
          className="w-full px-4 py-3 bg-black border border-matrix-dark text-matrix-green font-mono text-sm focus:border-matrix-green focus:outline-none resize-none placeholder:text-matrix-dark"
        />
      </div>

      <div className="mb-4">
        <label className="block text-sm font-mono text-matrix-dim mb-2">SALT</label>
        <input
          type="text"
          value={salt}
          onChange={(e) => setSalt(e.target.value)}
          placeholder="Random string for security"
          className="w-full px-4 py-2 bg-black border border-matrix-dark text-matrix-green font-mono text-sm focus:border-matrix-green focus:outline-none placeholder:text-matrix-dark"
        />
      </div>

      {error && <ErrorMessage message={error} />}

      <Button
        onClick={handleCommit}
        disabled={!result || !proof || !salt || isSubmitting}
        isLoading={isSubmitting}
        fullWidth
        size="lg"
      >
        [ GENERATE COMMIT ]
      </Button>
    </Card>
  );
}

// ============================================
// Helper Functions
// ============================================

function getSuggestedResult(criteriaResults: Array<{ passed: boolean }>): ResolutionType | null {
  if (criteriaResults.length === 0) return null;
  const passedCount = criteriaResults.filter((r) => r.passed).length;
  const passRate = passedCount / criteriaResults.length;
  if (passRate === 1) return 'TRUE';
  if (passRate === 0) return 'FALSE';
  if (passRate < 0.5) return 'FALSE';
  return 'INVALID';
}

function generateCommitHash(data: { vaultId: string; agentId: string; result: ResolutionType | null; proof: string; salt: string }): string {
  const json = JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < json.length; i++) {
    const char = json.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `0x${Math.abs(hash).toString(16).padStart(64, '0')}`;
}

// ============================================
// Sub-Components
// ============================================

function ResultButton({
  result,
  isSelected,
  isSuggested,
  onClick,
}: {
  result: ResolutionType;
  isSelected: boolean;
  isSuggested?: boolean;
  onClick: () => void;
}) {
  const config = RESULT_CONFIG[result];
  return (
    <button
      onClick={onClick}
      className={`p-4 border text-center transition-all font-mono ${
        isSelected ? `${config.color} ${config.bgColor}` : 'border-matrix-dark text-matrix-dark hover:border-matrix-green'
      }`}
    >
      <span className="block text-lg font-bold">{config.label}</span>
      <span className="block text-xs mt-1 opacity-70">{config.description}</span>
      {isSuggested && !isSelected && <span className="block text-xs mt-1 text-matrix-green">[SUGGESTED]</span>}
    </button>
  );
}

function CriteriaSummary({ results }: { results: Array<{ criterion: string; passed: boolean }> }) {
  return (
    <div className="mb-4 p-4 border border-matrix-dark font-mono">
      <h4 className="text-sm font-mono text-matrix-dim mb-3">CRITERIA SUMMARY</h4>
      <div className="space-y-2">
        {results.map((result, i) => (
          <CriteriaSummaryItem key={i} result={result} />
        ))}
      </div>
    </div>
  );
}

function CriteriaSummaryItem({ result }: { result: { criterion: string; passed: boolean } }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className={`w-5 h-5 rounded flex items-center justify-center text-xs shrink-0 ${
        result.passed ? 'border border-matrix-green text-matrix-green' : 'border border-red-500 text-red-400'
      }`}>
        {result.passed ? 'OK' : 'X'}
      </span>
      <span className="text-matrix-dim flex-1">{result.criterion}</span>
    </div>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return <div className="mb-4 p-3 border border-red-500 text-red-400 font-mono text-sm">{message}</div>;
}

function StepIndicator({ commitPhase, revealPhase }: { commitPhase: boolean; revealPhase: boolean }) {
  return (
    <div className="flex items-center gap-4 mb-4 font-mono">
      <StepTag index={1} label="COMMIT" active={commitPhase} />
      <div className="flex-1 h-0.5 bg-matrix-dark" />
      <StepTag index={2} label="REVEAL" active={revealPhase} />
    </div>
  );
}

function StepTag({ index, label, active }: { index: number; label: string; active: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
        active ? 'bg-matrix-green text-black' : 'bg-matrix-dark text-matrix-dark'
      }`}>
        {index}
      </span>
      <span className={active ? 'text-matrix-green' : 'text-matrix-dark'}>{label}</span>
    </div>
  );
}

function CommitDoneView({ commitHash }: { commitHash: string }) {
  return (
    <Card>
      <div className="text-center py-4">
        <div className="w-16 h-16 rounded-full border-2 border-matrix-green flex items-center justify-center mx-auto mb-4" style={{ boxShadow: '0 0 20px rgba(0, 255, 65, 0.3)' }}>
          <span className="text-2xl text-matrix-green">OK</span>
        </div>
        <h3 className="text-xl font-mono font-semibold mb-2 text-matrix-green">SUBMITTED</h3>
        <p className="text-matrix-dim font-mono text-sm">Resolution submitted. Waiting for settlement.</p>
        <div className="mt-4 p-3 border border-matrix-dark text-left font-mono">
          <p className="text-xs text-matrix-dark mb-1">COMMIT HASH</p>
          <p className="text-xs text-matrix-green break-all">{commitHash}</p>
        </div>
      </div>
    </Card>
  );
}

function RevealPhaseView({ commitHash, error, onReveal, isSubmitting }: {
  commitHash: string;
  error: string;
  onReveal: () => void;
  isSubmitting: boolean;
}) {
  return (
    <Card>
      <h3 className="text-lg font-mono font-semibold mb-4 text-matrix-green">REVEAL PHASE</h3>
      <div className="p-4 border border-matrix-dark mb-4 font-mono">
        <p className="text-xs text-matrix-dark mb-1">COMMIT HASH</p>
        <p className="text-xs text-matrix-green break-all">{commitHash}</p>
      </div>
      <p className="text-sm text-matrix-dim mb-4 font-mono">Reveal your result and proof. System will verify consistency.</p>
      {error && <ErrorMessage message={error} />}
      <Button onClick={onReveal} isLoading={isSubmitting} fullWidth size="lg">[ REVEAL ]</Button>
    </Card>
  );
}

export default ResolutionPanel;