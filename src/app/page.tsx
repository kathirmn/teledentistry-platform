'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ParticipantRole } from '@/lib/webrtc-types';
import {
  Video,
  Sparkles,
  ShieldCheck,
  Stethoscope,
  GraduationCap,
  ArrowRight,
  Mic,
  Camera,
  Activity,
  Wifi,
} from 'lucide-react';

export default function LobbyPage() {
  const router = useRouter();
  const [role, setRole] = useState<ParticipantRole>('junior-dentist');
  const [userName, setUserName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [hasCameraPermission, setHasCameraPermission] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);

  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Generate a friendly initial room ID
  useEffect(() => {
    const randomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    setRoomId(`CASE-${randomCode}`);
    setUserName(role === 'junior-dentist' ? 'Dr. Sarah (Rural Clinic)' : 'Dr. Alan (Specialist)');
  }, [role]);

  // Request quick preview stream to test hardware
  useEffect(() => {
    let audioContext: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let animId: number;

    async function initPreview() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 360 },
          audio: true,
        });
        streamRef.current = stream;
        setHasCameraPermission(true);

        if (videoPreviewRef.current) {
          videoPreviewRef.current.srcObject = stream;
        }

        // Audio level visualizer
        audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const checkAudio = () => {
          if (!analyser) return;
          analyser.getByteFrequencyData(dataArray);
          const avg = dataArray.reduce((acc, v) => acc + v, 0) / dataArray.length;
          setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)));
          animId = requestAnimationFrame(checkAudio);
        };
        checkAudio();
      } catch (err) {
        console.warn('Hardware preview not granted or cameras busy:', err);
      }
    }

    initPreview();

    return () => {
      cancelAnimationFrame(animId);
      audioContext?.close().catch(() => {});
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomId.trim()) return;

    // Clean up local preview tracks before routing
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }

    const encodedName = encodeURIComponent(userName || 'Doctor');
    router.push(`/room/${roomId.trim().toUpperCase()}?role=${role}&name=${encodedName}`);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 bg-slate-950 overflow-y-auto">
      {/* Background radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-cyan-950/20 via-transparent to-transparent pointer-events-none" />

      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden p-6 sm:p-8">
        {/* Header Branding */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 mb-6 border-b border-slate-800 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-500 to-teal-400 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Sparkles className="w-6 h-6 text-slate-950" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                TELEDENTISTRY PLATFORM
              </h1>
              <p className="text-xs text-slate-400">
                Real-Time Remote Clinical Mentorship & Multi-Feed Teleconsultation
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto bg-slate-950/80 px-3 py-1.5 rounded-xl border border-slate-800 text-xs text-slate-300">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Ephemeral WebRTC Session</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Form & Role Selection */}
          <form onSubmit={handleJoin} className="lg:col-span-7 space-y-5">
            {/* Role Tabs */}
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                Select Your Clinical Role:
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setRole('junior-dentist')}
                  className={`flex flex-col items-start p-3.5 rounded-2xl border text-left transition ${
                    role === 'junior-dentist'
                      ? 'bg-cyan-950/40 border-cyan-500/80 text-white shadow-lg shadow-cyan-950/50'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Stethoscope className="w-4 h-4 text-cyan-400" />
                    <span className="font-bold text-sm">Junior Clinician</span>
                  </div>
                  <span className="text-[11px] text-slate-400 leading-tight">
                    Rural clinic host with PC webcam + USB intraoral camera
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setRole('senior-doctor')}
                  className={`flex flex-col items-start p-3.5 rounded-2xl border text-left transition ${
                    role === 'senior-doctor'
                      ? 'bg-cyan-950/40 border-cyan-500/80 text-white shadow-lg shadow-cyan-950/50'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <GraduationCap className="w-4 h-4 text-cyan-400" />
                    <span className="font-bold text-sm">Senior Specialist</span>
                  </div>
                  <span className="text-[11px] text-slate-400 leading-tight">
                    Metro consultant with interactive telestration & freeze tools
                  </span>
                </button>
              </div>
            </div>

            {/* Clinician Name */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Clinician Name & Clinic Label:
              </label>
              <input
                type="text"
                required
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="e.g. Dr. Sarah Jenkins"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-cyan-500 transition"
              />
            </div>

            {/* Room ID */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Consultation Room ID:
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  required
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                  placeholder="CASE-XXXX"
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-cyan-300 font-mono font-bold focus:outline-none focus:border-cyan-500 uppercase transition tracking-wider"
                />
                <button
                  type="button"
                  onClick={() => setRoomId(`CASE-${Math.random().toString(36).substring(2, 8).toUpperCase()}`)}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition"
                >
                  Generate New
                </button>
              </div>
            </div>

            {/* Submit Join Button */}
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 py-3.5 px-6 rounded-2xl bg-cyan-600 hover:bg-cyan-500 text-white font-extrabold text-sm shadow-xl shadow-cyan-600/30 transition transform hover:-translate-y-0.5 active:translate-y-0"
            >
              <span>Launch Clinical Mentorship Session</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Right Column: Hardware & Connection Diagnostic Check */}
          <div className="lg:col-span-5 flex flex-col bg-slate-950 rounded-2xl border border-slate-800 p-4 justify-between">
            <div>
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800 text-xs">
                <span className="font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Camera className="w-4 h-4 text-cyan-400" /> Pre-Call Hardware Check
                </span>
                <span
                  className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${
                    hasCameraPermission ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-amber-950 text-amber-300'
                  }`}
                >
                  {hasCameraPermission ? 'Sensors Ready' : 'Awaiting Access'}
                </span>
              </div>

              {/* Video Preview Box */}
              <div className="relative aspect-video bg-black rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center mb-3">
                <video
                  ref={videoPreviewRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                {!hasCameraPermission && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center text-slate-500 text-xs">
                    <Video className="w-8 h-8 mb-1 opacity-40 text-slate-400" />
                    <span>Camera stream will appear once permission is granted</span>
                  </div>
                )}
              </div>

              {/* Microphone Volume Level */}
              <div className="space-y-1 text-xs">
                <div className="flex items-center justify-between text-slate-400">
                  <span className="flex items-center gap-1">
                    <Mic className="w-3.5 h-3.5 text-cyan-400" /> Microphone Input:
                  </span>
                  <span className="font-mono text-[10px]">{audioLevel}%</span>
                </div>
                <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 via-cyan-400 to-amber-400 transition-all duration-75"
                    style={{ width: `${audioLevel}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Feature Highlights */}
            <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-1.5 text-[11px] text-slate-400">
              <div className="flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span>Multi-feed aggregation (Webcam + Intraoral + Mobile)</span>
              </div>
              <div className="flex items-center gap-2">
                <Wifi className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Low-bandwidth adaptive rural uplink fallback</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
