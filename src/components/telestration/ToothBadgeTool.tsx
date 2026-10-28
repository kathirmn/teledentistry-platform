'use client';

import React, { useState } from 'react';
import { DENTAL_TEETH, CLINICAL_CONDITION_TAGS, ToothInfo } from '@/lib/dental-constants';

interface ToothBadgeToolProps {
  system: 'FDI' | 'Universal';
  selectedTooth: ToothInfo | null;
  selectedTag: string;
  onSelectTooth: (tooth: ToothInfo) => void;
  onSelectTag: (tag: string) => void;
  onToggleSystem: () => void;
}

export function ToothBadgeTool({
  system,
  selectedTooth,
  selectedTag,
  onSelectTooth,
  onSelectTag,
  onToggleSystem,
}: ToothBadgeToolProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredTeeth = DENTAL_TEETH.filter(
    (t) =>
      t.fdi.includes(searchTerm) ||
      t.universal.includes(searchTerm) ||
      t.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="bg-slate-900 border border-slate-700 p-3 rounded-xl w-72 shadow-2xl text-xs select-none">
      <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-800">
        <span className="font-semibold text-slate-200 uppercase tracking-wider">Tooth Badge Tool</span>
        <button
          onClick={onToggleSystem}
          className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 text-[10px] font-mono hover:bg-cyan-900"
        >
          {system} System
        </button>
      </div>

      {/* Quick Search */}
      <input
        type="text"
        placeholder="Search tooth # or name..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 mb-2 focus:outline-none focus:border-cyan-500 text-[11px]"
      />

      {/* Tooth Number Badges Grid */}
      <div className="max-h-32 overflow-y-auto mb-2 pr-1 grid grid-cols-4 gap-1">
        {filteredTeeth.map((tooth) => {
          const badgeLabel = system === 'FDI' ? tooth.fdi : `#${tooth.universal}`;
          const isSelected = selectedTooth?.fdi === tooth.fdi;
          return (
            <button
              key={tooth.fdi}
              title={tooth.name}
              onClick={() => onSelectTooth(tooth)}
              className={`py-1 px-1.5 rounded font-mono font-bold text-center transition ${
                isSelected
                  ? 'bg-cyan-500 text-slate-950 shadow-md scale-105'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {badgeLabel}
            </button>
          );
        })}
      </div>

      {/* Clinical Condition Tags */}
      <div className="mt-2 pt-2 border-t border-slate-800">
        <p className="text-[10px] font-medium text-slate-400 mb-1">Clinical Condition Tag:</p>
        <div className="flex flex-wrap gap-1">
          {CLINICAL_CONDITION_TAGS.map((tag) => {
            const isSelected = selectedTag === tag.label;
            return (
              <button
                key={tag.label}
                onClick={() => onSelectTag(tag.label)}
                style={{
                  borderColor: isSelected ? tag.color : 'transparent',
                  backgroundColor: isSelected ? `${tag.color}25` : '#1e293b',
                  color: isSelected ? tag.color : '#94a3b8',
                }}
                className="px-2 py-0.5 rounded text-[10px] border transition font-medium"
              >
                {tag.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
