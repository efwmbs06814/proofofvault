'use client';

import React from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';

// ============================================
// Types
// ============================================

interface Criteria {
  id?: string;
  criterion: string;
  passed?: boolean;
  reason?: string;
}

interface CriteriaListProps {
  criteria: string[] | Criteria[];
  mode?: 'display' | 'edit' | 'review';
  onChange?: (criteria: string[]) => void;
  onResultChange?: (results: Criteria[]) => void;
  className?: string;
}

// ============================================
// Main Component
// ============================================

export function CriteriaList({
  criteria,
  mode = 'display',
  onChange,
  onResultChange,
  className = '',
}: CriteriaListProps) {
  const [localCriteria, setLocalCriteria] = React.useState<string[]>(
    criteria.map((c) => (typeof c === 'string' ? c : c.criterion))
  );
  const [newCriterion, setNewCriterion] = React.useState('');

  const criteriaList: Criteria[] = criteria.map((c) => (typeof c === 'string' ? { criterion: c } : c));

  const handleAdd = () => {
    if (!newCriterion.trim()) return;
    const updated = [...localCriteria, newCriterion.trim()];
    setLocalCriteria(updated);
    setNewCriterion('');
    onChange?.(updated);
  };

  const handleRemove = (index: number) => {
    const updated = localCriteria.filter((_, i) => i !== index);
    setLocalCriteria(updated);
    onChange?.(updated);
  };

  const handleUpdate = (index: number, value: string) => {
    const updated = localCriteria.map((c, i) => (i === index ? value : c));
    setLocalCriteria(updated);
    onChange?.(updated);
  };

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="space-y-3">
        {criteriaList.map((item, index) => (
          <CriteriaItem
            key={item.id || index}
            criterion={item}
            index={index}
            mode={mode}
            onUpdate={mode === 'edit' ? (value) => handleUpdate(index, value) : undefined}
            onRemove={mode === 'edit' ? () => handleRemove(index) : undefined}
          />
        ))}
      </div>

      {mode === 'edit' && (
        <div className="flex gap-2">
          <input
            type="text"
            value={newCriterion}
            onChange={(e) => setNewCriterion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="ADD NEW CRITERION..."
            className="flex-1 px-4 py-2 bg-black border border-matrix-dark text-matrix-green font-mono text-sm focus:border-matrix-green focus:outline-none transition-colors placeholder:text-matrix-dark"
          />
          <Button onClick={handleAdd} variant="secondary" size="sm">[ + ]</Button>
        </div>
      )}
    </div>
  );
}

// ============================================
// Criteria Item Component
// ============================================

interface CriteriaItemProps {
  criterion: Criteria;
  index: number;
  mode: 'display' | 'edit' | 'review';
  onUpdate?: (value: string) => void;
  onRemove?: () => void;
  onReviewChange?: (passed: boolean, reason: string) => void;
}

function CriteriaItem({ criterion, index, mode, onUpdate, onRemove, onReviewChange }: CriteriaItemProps) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [editValue, setEditValue] = React.useState(criterion.criterion);
  const [reviewPassed, setReviewPassed] = React.useState<boolean | null>(
    criterion.passed !== undefined ? criterion.passed : null
  );
  const [reviewReason, setReviewReason] = React.useState(criterion.reason || '');

  const handleSave = () => {
    onUpdate?.(editValue);
    setIsEditing(false);
  };

  const handleReview = (passed: boolean) => {
    setReviewPassed(passed);
    onReviewChange?.(passed, reviewReason);
  };

  const borderColor = reviewPassed === true
    ? 'border-matrix-green bg-matrix-green/5'
    : reviewPassed === false
    ? 'border-red-500 bg-red-500/5'
    : 'border-matrix-dark';

  const badgeStyle = reviewPassed === true
    ? 'border-matrix-green bg-matrix-green text-black'
    : reviewPassed === false
    ? 'border-red-500 bg-red-500 text-white'
    : 'border-matrix-dark text-matrix-green';

  const badgeText = reviewPassed === true ? 'OK' : reviewPassed === false ? 'X' : `0${index + 1}`;

  return (
    <div className={`p-4 border transition-colors font-mono text-sm ${borderColor}`}>
      <div className="flex items-start gap-3">
        <div className={`w-8 h-8 rounded flex items-center justify-center shrink-0 text-xs font-bold border ${badgeStyle}`}>
          {badgeText}
        </div>

        <div className="flex-1 min-w-0">
          {mode === 'edit' && isEditing ? (
            <EditMode
              value={editValue}
              onChange={setEditValue}
              onSave={handleSave}
              onCancel={() => setIsEditing(false)}
            />
          ) : (
            <>
              <p className="text-matrix-green">{criterion.criterion}</p>
              {mode === 'review' && (
                <ReviewControls
                  reviewPassed={reviewPassed}
                  reviewReason={reviewReason}
                  onReview={handleReview}
                  onReasonChange={(reason) => {
                    setReviewReason(reason);
                    if (reviewPassed !== null) onReviewChange?.(reviewPassed, reason);
                  }}
                />
              )}
              {mode === 'display' && criterion.reason && (
                <p className="mt-2 text-xs text-matrix-dark">{criterion.reason}</p>
              )}
            </>
          )}
        </div>

        {mode === 'edit' && !isEditing && (
          <div className="flex gap-1 shrink-0">
            <button
              onClick={() => setIsEditing(true)}
              className="p-2 border border-matrix-dark text-matrix-dark hover:border-matrix-green hover:text-matrix-green transition-colors text-xs"
            >
              [EDIT]
            </button>
            <button
              onClick={onRemove}
              className="p-2 border border-matrix-dark text-matrix-dark hover:border-red-500 hover:text-red-400 transition-colors text-xs"
            >
              [DEL]
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// Helper Components
// ============================================

function EditMode({ value, onChange, onSave, onCancel }: {
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-2">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className="w-full px-3 py-2 bg-black border border-matrix-dark text-matrix-green font-mono text-sm focus:border-matrix-green focus:outline-none resize-none"
        autoFocus
      />
      <div className="flex gap-2">
        <Button size="sm" onClick={onSave}>[ SAVE ]</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>[ CANCEL ]</Button>
      </div>
    </div>
  );
}

function ReviewControls({ reviewPassed, reviewReason, onReview, onReasonChange }: {
  reviewPassed: boolean | null;
  reviewReason: string;
  onReview: (passed: boolean) => void;
  onReasonChange: (reason: string) => void;
}) {
  return (
    <div className="mt-3 space-y-3">
      <div className="flex gap-2">
        <ReviewButton
          active={reviewPassed === true}
          variant="pass"
          onClick={() => onReview(true)}
        >
          [ PASS ]
        </ReviewButton>
        <ReviewButton
          active={reviewPassed === false}
          variant="fail"
          onClick={() => onReview(false)}
        >
          [ FAIL ]
        </ReviewButton>
      </div>

      {reviewPassed !== null && (
        <textarea
          value={reviewReason}
          onChange={(e) => onReasonChange(e.target.value)}
          placeholder="ENTER REASON..."
          rows={2}
          className="w-full px-3 py-2 bg-black border border-matrix-dark text-matrix-green font-mono text-sm focus:border-matrix-green focus:outline-none resize-none"
        />
      )}
    </div>
  );
}

function ReviewButton({ active, variant, onClick, children }: {
  active: boolean;
  variant: 'pass' | 'fail';
  onClick: () => void;
  children: React.ReactNode;
}) {
  const baseStyle = 'flex-1 px-3 py-2 border text-sm font-medium transition-colors';
  const activeStyle = variant === 'pass'
    ? 'border-matrix-green bg-matrix-green text-black'
    : 'border-red-500 bg-red-500 text-white';
  const inactiveStyle = variant === 'pass'
    ? 'border-matrix-dark text-matrix-green hover:border-matrix-green'
    : 'border-matrix-dark text-red-400 hover:border-red-500';

  return (
    <button onClick={onClick} className={`${baseStyle} ${active ? activeStyle : inactiveStyle}`}>
      {children}
    </button>
  );
}

export default CriteriaList;