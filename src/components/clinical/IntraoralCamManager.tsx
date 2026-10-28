'use client';

import React from 'react';
import { MediaDeviceInfoSummary } from '@/hooks/useDeviceEnumeration';
import { Camera, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface IntraoralCamManagerProps {
  videoDevices: MediaDeviceInfoSummary[];
  selectedWebcamId: string;
  selectedIntraoralId: string;
  onSelectWebcam: (deviceId: string) => void;
  onSelectIntraoral: (deviceId: string) => void;
  onRefreshDevices: () => void;
  usbContentionWarning?: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function IntraoralCamManager({
  videoDevices,
  selectedWebcamId,
  selectedIntraoralId,
  onSelectWebcam,
  onSelectIntraoral,
  onRefreshDevices,
  usbContentionWarning,
  isOpen,
  onClose,
}: IntraoralCamManagerProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fadeIn">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6 text-slate-100">
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-cyan-400" />
            <h3 className="text-base font-bold text-white">USB Video Device Configuration</h3>
          </div>
          <button
            onClick={onRefreshDevices}
            title="Scan for newly connected USB wands"
            className="flex items-center gap-1 px-2.5 py-1 text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Re-scan USB
          </button>
        </div>

        {/* USB Contention Warning Alert (Critical Trap #5) */}
        {usbContentionWarning && (
          <div className="flex items-start gap-2.5 bg-amber-950/40 border border-amber-800/60 p-3 rounded-xl mb-4 text-xs text-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-amber-300">USB 2.0 Bus Constraint: </span>
              {usbContentionWarning}
            </div>
          </div>
        )}

        <div className="space-y-4 text-xs">
          {/* Primary Intraoral Camera */}
          <div>
            <label className="block font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
              <span>Primary USB Intraoral Wand:</span>
              <span className="text-[10px] text-cyan-400 font-mono">Macro Dental View</span>
            </label>
            <select
              value={selectedIntraoralId}
              onChange={(e) => onSelectIntraoral(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
            >
              <option value="">-- Select Intraoral Device --</option>
              {videoDevices.map((dev) => (
                <option key={`intra-${dev.deviceId}`} value={dev.deviceId}>
                  {dev.label}
                </option>
              ))}
            </select>
          </div>

          {/* Secondary Clinician Webcam */}
          <div>
            <label className="block font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
              <span>Clinician / Face Webcam:</span>
              <span className="text-[10px] text-slate-400 font-mono">Room & Ergonomics</span>
            </label>
            <select
              value={selectedWebcamId}
              onChange={(e) => onSelectWebcam(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
            >
              <option value="">-- Select Webcam Device --</option>
              {videoDevices.map((dev) => (
                <option key={`web-${dev.deviceId}`} value={dev.deviceId}>
                  {dev.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs transition shadow"
          >
            Apply & Close
          </button>
        </div>
      </div>
    </div>
  );
}
