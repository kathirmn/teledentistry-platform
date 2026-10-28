'use client';

import React from 'react';
import { NetworkHealthStats } from '@/lib/webrtc-types';
import { Activity, Wifi, ShieldAlert, CheckCircle, Sliders } from 'lucide-react';

interface LowBandwidthBannerProps {
  stats: NetworkHealthStats;
  onToggleForceMode: () => void;
}

export function LowBandwidthBanner({ stats, onToggleForceMode }: LowBandwidthBannerProps) {
  const getTierBadge = () => {
    switch (stats.activeTier) {
      case 'critical':
        return {
          label: 'Critical Rural Tier',
          bg: 'bg-rose-950/40 text-rose-300 border-rose-800/60',
          desc: 'Audio prioritized; intraoral held at sharp 720p @ 10fps; secondary feeds paused',
        };
      case 'moderate':
        return {
          label: 'Moderate Bandwidth',
          bg: 'bg-amber-950/40 text-amber-300 border-amber-800/60',
          desc: 'Intraoral 720p @ 15fps; webcam 360p; FEC audio active',
        };
      case 'optimal':
      default:
        return {
          label: 'Optimal Connection',
          bg: 'bg-emerald-950/40 text-emerald-300 border-emerald-800/60',
          desc: 'Full HD multi-feed streaming with high-fidelity audio',
        };
    }
  };

  const tier = getTierBadge();

  return (
    <div className="flex items-center justify-between px-3 py-1.5 bg-slate-950/80 border-b border-slate-800 text-[11px] select-none">
      <div className="flex items-center gap-3">
        {/* Tier badge */}
        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md border font-semibold ${tier.bg}`}>
          <Activity className="w-3.5 h-3.5 animate-pulse" />
          <span>{tier.label}</span>
        </div>

        {/* Telemetry metrics */}
        <div className="hidden sm:flex items-center gap-3 text-slate-400 font-mono">
          <span>RTT: <strong className="text-slate-200">{stats.rttMs}ms</strong></span>
          <span>Loss: <strong className="text-slate-200">{stats.packetLossPercent}%</strong></span>
          <span>Uplink: <strong className="text-slate-200">{stats.currentUplinkKbps} Kbps</strong></span>
        </div>

        <span className="hidden md:inline text-slate-500 text-[10px]">({tier.desc})</span>
      </div>

      {/* Low-Bandwidth Mode manual switch */}
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleForceMode}
          className={`flex items-center gap-1 px-2.5 py-0.5 rounded-md border transition text-[11px] font-medium ${
            stats.forcedLowBandwidth
              ? 'bg-cyan-600 text-white border-cyan-400 shadow'
              : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
          }`}
        >
          <Sliders className="w-3 h-3" />
          {stats.forcedLowBandwidth ? 'Low-BW Mode: FORCED ON' : 'Low-BW Mode: AUTO'}
        </button>
      </div>
    </div>
  );
}
