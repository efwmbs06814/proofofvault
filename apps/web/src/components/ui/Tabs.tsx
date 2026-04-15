'use client';

import React, { createContext, useContext, useState } from 'react';

// ============================================
// Types
// ============================================

interface TabsContextValue {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

interface TabsProps {
  defaultValue: string;
  value?: string;
  onChange?: (value: string) => void;
  children: React.ReactNode;
  className?: string;
}

// ============================================
// Context
// ============================================

const TabsContext = createContext<TabsContextValue | undefined>(undefined);

// ============================================
// Components
// ============================================

export function Tabs({
  defaultValue,
  value,
  onChange,
  children,
  className = '',
}: TabsProps) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const activeTab = value ?? internalValue;

  const setActiveTab = (tab: string) => {
    if (value === undefined) setInternalValue(tab);
    onChange?.(tab);
  };

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex border-b border-matrix-dark font-mono ${className}`} role="tablist">
      {children}
    </div>
  );
}

export function TabsTrigger({
  value,
  children,
  className = '',
  disabled = false,
}: {
  value: string;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  const context = useContext(TabsContext);
  if (!context) throw new Error('TabsTrigger must be used within Tabs');

  const isActive = context.activeTab === value;

  return (
    <button
      role="tab"
      aria-selected={isActive}
      disabled={disabled}
      onClick={() => context.setActiveTab(value)}
      className={`
        px-4 py-3 text-sm font-mono transition-all
        border-b-2 -mb-[1px]
        disabled:opacity-50 disabled:cursor-not-allowed
        ${isActive ? 'border-matrix-green text-matrix-green' : 'border-transparent text-matrix-dark hover:text-matrix-green'}
        ${className}
      `}
      style={isActive ? { textShadow: '0 0 5px #00ff41' } : undefined}
    >
      {children}
    </button>
  );
}

export function TabsContent({
  value,
  children,
  className = '',
}: {
  value: string;
  children: React.ReactNode;
  className?: string;
}) {
  const context = useContext(TabsContext);
  if (!context) throw new Error('TabsContent must be used within Tabs');

  if (context.activeTab !== value) return null;

  return (
    <div role="tabpanel" className={`pt-4 ${className}`}>
      {children}
    </div>
  );
}

export default Tabs;