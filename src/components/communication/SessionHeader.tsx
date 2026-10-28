'use client';

import React, { useState, useEffect } from 'react';
import { ParticipantRole, Participant } from '@/lib/webrtc-types';
import {
  Mic,
  MicOff,
  Camera,
  Smartphone,
  FolderOpen,
  MessageSquare,
  Users,
  Copy,
  Check,
  Settings,
  PhoneOff,
  Sparkles,
} from 'lucide-react';

interface SessionHeaderProps {
  roomId: string;
  role: ParticipantRole;
  participantName: string;
  participants: Participant[];
  isAudioMuted: boolean;
  onToggleAudio: () => void;
  onTriggerSnapshot: () => void;
  onOpenMobileModal: () => void;
  onOpenDeviceModal: () => void;
  onOpenGallery: () => void;
  onOpenChat: () => void;
  snapshotCount: number;
  unreadChatCount: number;
  onLeaveCall: () => void;
  iceConnectionState?: RTCIceConnectionState;
}

export function SessionHeader({
  roomId,
  role,
  participantName,
  participants,
  isAudioMuted,
  onToggleAudio,
  onTriggerSnapshot,
  onOpenMobileModal,
  onOpenDeviceModal,
  onOpenGallery,
  onOpenChat,
  snapshotCount,
  unreadChatCount,
  onLeaveCall,
  iceConnectionState,
}: SessionHeaderProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTimer = (totalSec: number) => {
    const m = Math.floor(totalSec / 60)
      .toString()
      .padStart(2, '0');
    const s = (totalSec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <header className="flex items-center justify-between px-4 py-2.5 bg-slate-950 border-b border-slate-800 text-slate-100 select-none">
      {/* Left: Branding & Room Info */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-600 to-teal-400 flex items-center justify-center shadow-md">
            <Sparkles className="w-4 h-4 text-slate-950" />
          </div>
          <div>
            <h1 className="text-xs sm:text-sm font-extrabold tracking-tight text-white flex items-center gap-1.5">
              TELEDENTISTRY
              <span className="hidden sm:inline text-[9px] px-1.5 py-0.5 rounded font-mono font-bold bg-cyan-950 text-cyan-400 border border-cyan-800">
                CLINICAL MENTORSHIP
              </span>
            </h1>
            <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
              <span className="flex items-center gap-1">
                Room: <strong className="text-slate-200">{roomId}</strong>
                <button
                  onClick={copyRoomCode}
                  title="Copy Room ID"
                  className="hover:text-cyan-400 transition ml-0.5"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                </button>
              </span>
              <span>•</span>
              <span className="text-emerald-400 font-semibold">{formatTimer(elapsedSeconds)}</span>
            </div>
          </div>
        </div>

        {/* Participant Role Badge */}
        <div className="hidden lg:flex items-center gap-1.5 pl-3 border-l border-slate-800 text-xs">
          <span className="text-slate-400">Logged in as:</span>
          <span
            className={`font-semibold px-2 py-0.5 rounded border text-[11px] ${
              role === 'senior-doctor'
                ? 'bg-cyan-950 text-cyan-300 border-cyan-800'
                : 'bg-amber-950 text-amber-300 border-amber-800'
            }`}
          >
            {participantName} ({role === 'senior-doctor' ? 'Senior Specialist' : 'Junior Clinician'})
          </span>
          <span className="flex items-center gap-1 text-[11px] text-slate-400 font-mono ml-2">
            <Users className="w-3.5 h-3.5 text-slate-500" /> {participants.length + 1} present
          </span>
          {iceConnectionState && (
            <span
              className={`hidden xl:inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded border ml-2 ${
                iceConnectionState === 'connected' || iceConnectionState === 'completed'
                  ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800'
                  : iceConnectionState === 'checking'
                  ? 'bg-amber-950/80 text-amber-300 border-amber-800 animate-pulse'
                  : iceConnectionState === 'failed'
                  ? 'bg-rose-950/80 text-rose-300 border-rose-800'
                  : 'bg-slate-900 text-slate-400 border-slate-700'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  iceConnectionState === 'connected' || iceConnectionState === 'completed'
                    ? 'bg-emerald-400'
                    : iceConnectionState === 'checking'
                    ? 'bg-amber-400'
                    : 'bg-rose-500'
                }`}
              />
              {iceConnectionState === 'connected' || iceConnectionState === 'completed'
                ? 'WebRTC Live'
                : iceConnectionState === 'checking'
                ? 'Negotiating...'
                : iceConnectionState === 'failed'
                ? 'Relay Reconnecting'
                : iceConnectionState}
            </span>
          )}
        </div>
      </div>

      {/* Right: Core Telehealth Action Buttons */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Full-Duplex Audio Button */}
        <button
          onClick={onToggleAudio}
          title={isAudioMuted ? 'Unmute Microphone' : 'Mute Microphone'}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition ${
            isAudioMuted
              ? 'bg-rose-950/60 text-rose-300 border-rose-800 hover:bg-rose-900/60'
              : 'bg-slate-900 text-slate-200 border-slate-700 hover:bg-slate-800'
          }`}
        >
          {isAudioMuted ? <MicOff className="w-3.5 h-3.5 text-rose-400" /> : <Mic className="w-3.5 h-3.5 text-emerald-400" />}
          <span className="hidden sm:inline">{isAudioMuted ? 'Muted' : 'Mic Active'}</span>
        </button>

        {/* Junior PC Only: USB Device & Mobile Pairing buttons */}
        {role === 'junior-dentist' && (
          <>
            <button
              onClick={onOpenDeviceModal}
              title="USB Camera Device Ladder & Settings"
              className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-medium flex items-center gap-1 transition"
            >
              <Settings className="w-3.5 h-3.5" />
              <span className="hidden md:inline">USB Cams</span>
            </button>

            <button
              onClick={onOpenMobileModal}
              title="Connect Mobile Companion Camera via QR"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-purple-950/40 border border-purple-800 hover:bg-purple-900/50 text-purple-300 text-xs font-medium transition"
            >
              <Smartphone className="w-3.5 h-3.5 text-purple-400" />
              <span className="hidden sm:inline">Mobile QR</span>
            </button>
          </>
        )}

        {/* MAIN ACTION: Snapshot / Freeze Button with Foot Pedal spacebar badge */}
        <button
          onClick={onTriggerSnapshot}
          title="Capture Diagnostic Snapshot (Or press Spacebar foot pedal)"
          className="relative flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-lg transition active:scale-95"
        >
          <Camera className="w-4 h-4" />
          <span>Freeze / Snapshot</span>
          <span className="hidden xl:inline text-[9px] bg-cyan-900/90 text-cyan-200 px-1.5 py-0.5 rounded font-mono font-normal">
            Space
          </span>
        </button>

        {/* Case Documentation Gallery */}
        <button
          onClick={onOpenGallery}
          title="Open Case Snapshots & PDF Export"
          className="relative flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-medium transition"
        >
          <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
          <span className="hidden md:inline">Case Files</span>
          {snapshotCount > 0 && (
            <span className="flex items-center justify-center px-1.5 py-0.2 bg-cyan-500 text-slate-950 text-[10px] font-bold rounded-full font-mono">
              {snapshotCount}
            </span>
          )}
        </button>

        {/* In-Call Chat */}
        <button
          onClick={onOpenChat}
          title="Open Clinical Chat"
          className="relative p-2 rounded-lg bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-300 transition"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          {unreadChatCount > 0 && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-cyan-400 rounded-full animate-ping" />
          )}
        </button>

        {/* Leave Room Button */}
        <button
          onClick={onLeaveCall}
          title="Leave Consultation Session"
          className="p-2 rounded-lg bg-rose-950/40 border border-rose-900/60 hover:bg-rose-900/80 text-rose-300 transition"
        >
          <PhoneOff className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
}
