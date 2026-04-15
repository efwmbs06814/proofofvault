'use client';

import React, { useState, useRef, useEffect } from 'react';

// ============================================
// Types
// ============================================

export interface FAQItem {
  question: string;
  answer: string;
  category?: string;
}

export interface FAQAccordionProps {
  items: FAQItem[];
  categories?: string[];
  defaultCategory?: string;
  allowMultiple?: boolean;
}

// ============================================
// Component
// ============================================

export function FAQAccordion({
  items,
  categories,
  defaultCategory,
  allowMultiple = false,
}: FAQAccordionProps) {
  const [openItems, setOpenItems] = useState<Set<number>>(new Set());
  const [activeCategory, setActiveCategory] = useState<string | null>(defaultCategory || null);
  const contentRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const filteredItems = activeCategory
    ? items.filter((item) => item.category === activeCategory)
    : items;

  const toggleItem = (index: number) => {
    setOpenItems((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        if (!allowMultiple) {
          newSet.clear();
        }
        newSet.add(index);
      }
      return newSet;
    });
  };

  const handleCategoryChange = (category: string | null) => {
    setActiveCategory(category);
    setOpenItems(new Set());
  };

  return (
    <div className="w-full font-mono">
      {/* Category Filter */}
      {categories && categories.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={() => handleCategoryChange(null)}
            className={`
              px-4 py-2 text-sm border transition-all duration-200
              ${!activeCategory
                ? 'bg-white text-black border-white'
                : 'bg-transparent text-matrix-dark border-matrix-dark hover:border-white hover:text-white'
              }
            `}
          >
            ALL
          </button>
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => handleCategoryChange(category)}
              className={`
                px-4 py-2 text-sm border transition-all duration-200
                ${activeCategory === category
                  ? 'bg-white text-black border-white'
                  : 'bg-transparent text-matrix-dark border-matrix-dark hover:border-white hover:text-white'
                }
              `}
            >
              {category.toUpperCase()}
            </button>
          ))}
        </div>
      )}

      {/* FAQ Items */}
      <div className="space-y-3">
        {filteredItems.map((item, index) => (
          <FAQAccordionItem
            key={index}
            item={item}
            isOpen={openItems.has(index)}
            onToggle={() => toggleItem(index)}
            contentRef={(el) => {
              if (el) contentRefs.current.set(index, el);
              else contentRefs.current.delete(index);
            }}
          />
        ))}
      </div>

      {filteredItems.length === 0 && (
        <div className="text-center py-12 text-matrix-dark">
          <p className="text-lg">{'// NO ITEMS FOUND'}</p>
          <p className="text-sm mt-2">No FAQ items match the selected category.</p>
        </div>
      )}
    </div>
  );
}

// ============================================
// Individual FAQ Item
// ============================================

interface FAQAccordionItemProps {
  item: FAQItem;
  isOpen: boolean;
  onToggle: () => void;
  contentRef: (el: HTMLDivElement | null) => void;
}

function FAQAccordionItem({ item, isOpen, onToggle, contentRef }: FAQAccordionItemProps) {
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (innerRef.current) {
      contentRef(innerRef.current);
    }
    return () => contentRef(null);
  }, [contentRef]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggle();
    }
  };

  return (
    <div
      className={`
        border transition-all duration-300
        ${isOpen ? 'border-matrix-green shadow-[0_0_15px_rgba(255,255,255,0.2)]' : 'border-matrix-dark hover:border-matrix-green/50'}
      `}
    >
      {/* Header / Question */}
      <button
        onClick={onToggle}
        onKeyDown={handleKeyDown}
        className="w-full px-6 py-4 flex items-center justify-between text-left bg-black transition-colors duration-200"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-3 flex-1">
          {item.category && (
            <span className="text-xs px-2 py-0.5 border border-matrix-dark text-matrix-dark hidden sm:inline-block">
              {item.category.toUpperCase()}
            </span>
          )}
          <span className={`font-medium ${isOpen ? 'text-white' : 'text-matrix-dim'} transition-colors`}>
            {item.question}
          </span>
        </div>
        <span
          className={`
            w-6 h-6 flex items-center justify-center text-sm font-bold ml-4 shrink-0
            transition-all duration-300
            ${isOpen ? 'rotate-45 text-white' : 'text-matrix-dark'}
          `}
        >
          +
        </span>
      </button>

      {/* Content / Answer */}
      <div
        ref={innerRef}
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{
          maxHeight: isOpen ? '500px' : '0px',
          opacity: isOpen ? 1 : 0,
        }}
      >
        <div className="px-6 py-4 bg-black border-t border-matrix-dark">
          <div className="text-sm text-matrix-dim leading-relaxed">
            {item.answer}
          </div>
        </div>
      </div>
    </div>
  );
}

export default FAQAccordion;
