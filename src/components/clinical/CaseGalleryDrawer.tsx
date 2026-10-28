'use client';

import React, { useState } from 'react';
import { FreezeFramePayload, ChatMessage, Participant } from '@/lib/webrtc-types';
import { generateCaseReportPdf } from '@/lib/pdf-export';
import {
  FileText,
  Download,
  Trash2,
  X,
  Tag,
  Clock,
  ChevronRight,
  Maximize2,
  FileCheck,
} from 'lucide-react';

interface CaseGalleryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  snapshots: FreezeFramePayload[];
  onDeleteSnapshot: (id: string) => void;
  onSelectSnapshotToAnnotate: (snapshot: FreezeFramePayload) => void;
  roomId: string;
  dentistName: string;
  consultants: Participant[];
  chatMessages: ChatMessage[];
}

export function CaseGalleryDrawer({
  isOpen,
  onClose,
  snapshots,
  onDeleteSnapshot,
  onSelectSnapshotToAnnotate,
  roomId,
  dentistName,
  consultants,
  chatMessages,
}: CaseGalleryDrawerProps) {
  const [patientAlias, setPatientAlias] = useState('PT-1042');
  const [clinicalNotes, setClinicalNotes] = useState(
    'Reviewed margin preparation on posterior quadrant. Advised minor subgingival clearance on distal aspect before final impression.'
  );
  const [isExporting, setIsExporting] = useState(false);
  const [previewSnapshot, setPreviewSnapshot] = useState<FreezeFramePayload | null>(null);

  if (!isOpen) return null;

  const handleExportPdf = async () => {
    setIsExporting(true);
    try {
      await generateCaseReportPdf({
        roomId,
        clinicName: 'Rural Community Dental Health Center',
        patientAlias,
        dentistName,
        consultants,
        startTime: Date.now() - 25 * 60000,
        endTime: Date.now(),
        snapshots,
        chatMessages,
        clinicalNotes,
      });
    } catch (err) {
      console.error('Failed to generate PDF report:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadPng = (snap: FreezeFramePayload) => {
    const link = document.createElement('a');
    link.href = snap.dataUrl;
    link.download = `Dental_${snap.feedType}_${snap.id}.jpg`;
    link.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-md h-full bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col text-slate-100">
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-slate-950 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-cyan-400" />
            <h3 className="text-sm font-bold text-white tracking-wide uppercase">
              Case Documentation Gallery ({snapshots.length})
            </h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Case Metadata Inputs */}
        <div className="p-4 bg-slate-950/40 border-b border-slate-800 space-y-2 text-xs">
          <div>
            <label className="text-[11px] font-semibold text-slate-400">Patient Case Alias / ID:</label>
            <input
              type="text"
              value={patientAlias}
              onChange={(e) => setPatientAlias(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-slate-200 mt-0.5 focus:outline-none focus:border-cyan-500 font-mono"
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-400">Clinical Consultation Notes:</label>
            <textarea
              rows={2}
              value={clinicalNotes}
              onChange={(e) => setClinicalNotes(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-slate-200 mt-0.5 focus:outline-none focus:border-cyan-500 text-[11px]"
            />
          </div>

          <button
            onClick={handleExportPdf}
            disabled={isExporting || snapshots.length === 0}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold text-xs shadow-md transition"
          >
            <FileCheck className="w-4 h-4" />
            {isExporting ? 'Compiling PDF...' : 'Export Case Summary PDF'}
          </button>
        </div>

        {/* Snapshots Grid */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {snapshots.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center p-6">
              <FileText className="w-12 h-12 mb-2 opacity-30" />
              <p className="text-xs font-semibold uppercase tracking-wider">No Snapshots Yet</p>
              <p className="text-[11px] text-slate-400 mt-1">
                Click &ldquo;Snapshot / Freeze&rdquo; on any video feed or hit Spacebar to capture diagnostic stills.
              </p>
            </div>
          ) : (
            snapshots.map((snap) => (
              <div
                key={snap.id}
                className="group relative bg-slate-950 border border-slate-800 rounded-xl overflow-hidden hover:border-cyan-500/50 transition shadow-md"
              >
                {/* Snapshot Thumbnail */}
                <div
                  className="relative aspect-video bg-black cursor-pointer"
                  onClick={() => onSelectSnapshotToAnnotate(snap)}
                >
                  <img
                    src={snap.dataUrl}
                    alt={snap.feedType}
                    className="w-full h-full object-cover group-hover:scale-105 transition duration-200"
                  />
                  <div className="absolute top-2 left-2 bg-slate-900/80 backdrop-blur-md px-2 py-0.5 rounded text-[10px] font-bold text-cyan-300 border border-slate-700 uppercase">
                    {snap.feedType}
                  </div>
                  <div className="absolute inset-0 bg-cyan-500/10 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                    <span className="bg-slate-900/90 text-white text-[11px] px-2.5 py-1 rounded-md font-semibold flex items-center gap-1 shadow">
                      <Maximize2 className="w-3.5 h-3.5 text-cyan-400" /> Annotate / Inspect
                    </span>
                  </div>
                </div>

                {/* Metadata & Actions */}
                <div className="p-3 flex items-center justify-between text-xs">
                  <div>
                    <div className="flex items-center gap-1 text-[11px] text-slate-400">
                      <Clock className="w-3 h-3" />
                      <span>{new Date(snap.timestamp).toLocaleTimeString()}</span>
                    </div>

                    {/* Tooth Badges preview */}
                    {snap.annotations?.badges && snap.annotations.badges.length > 0 && (
                      <div className="flex items-center gap-1 mt-1">
                        <Tag className="w-3 h-3 text-cyan-400" />
                        <span className="text-[10px] text-slate-300 font-mono">
                          {snap.annotations.badges.map((b) => `#${b.toothNumber}`).join(', ')}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleDownloadPng(snap)}
                      title="Download clean JPEG"
                      className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 transition border border-slate-800"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onDeleteSnapshot(snap.id)}
                      title="Delete snapshot"
                      className="p-1.5 rounded-lg bg-rose-950/30 hover:bg-rose-900/60 text-rose-300 transition border border-rose-900/40"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
