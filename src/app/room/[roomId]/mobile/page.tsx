'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import {
  Camera,
  Flashlight,
  FlashlightOff,
  FlipHorizontal,
  Mic,
  MicOff,
  Wifi,
  ShieldCheck,
  CheckCircle2,
  VideoOff,
} from 'lucide-react';

export default function MobileCompanionPage() {
  const params = useParams();
  const roomId = (params.roomId as string) || 'CASE-DEMO';

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());

  const [isConnected, setIsConnected] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [isTorchOn, setIsTorchOn] = useState(false);
  const [hasTorchSupport, setHasTorchSupport] = useState(false);
  const [isAssistantAudioEnabled, setIsAssistantAudioEnabled] = useState(false);
  const [videoStatus, setVideoStatus] = useState<string>('Requesting camera permissions...');

  const iceCandidatesQueue = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  // ICE Servers (Xirsys STUN/TURN servers for robust NAT/firewall traversal)
  const rtcConfigRef = useRef<RTCConfiguration>({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
    ],
  });

  // Pre-fetch Xirsys STUN/TURN credentials from server API
  useEffect(() => {
    fetch('/api/ice-servers')
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.iceServers) && data.iceServers.length > 0) {
          console.log(`[Mobile WebRTC] Loaded ${data.iceServers.length} ICE server(s) from Xirsys`);
          rtcConfigRef.current = { iceServers: data.iceServers };
        }
      })
      .catch(() => {});
  }, []);

  const hasJoinedRoomRef = useRef(false);

  // Helper to bind local camera tracks to remote offered transceivers
  const bindTracksToOffer = useCallback(async (pc: RTCPeerConnection) => {
    if (!streamRef.current) return;
    const videoTrack = streamRef.current.getVideoTracks()[0];
    const audioTrack = streamRef.current.getAudioTracks()[0];

    const transceivers = pc.getTransceivers();
    const videoTransceiver = transceivers.find(
      (t) => t.receiver.track?.kind === 'video' || t.sender.track?.kind === 'video'
    );
    const audioTransceiver = transceivers.find(
      (t) => t.receiver.track?.kind === 'audio' || t.sender.track?.kind === 'audio'
    );

    if (videoTransceiver && videoTrack) {
      videoTransceiver.direction = 'sendonly';
      await videoTransceiver.sender.replaceTrack(videoTrack);
    } else if (videoTrack) {
      pc.addTrack(videoTrack, streamRef.current);
    }

    if (audioTransceiver && audioTrack) {
      audioTransceiver.direction = 'sendonly';
      await audioTransceiver.sender.replaceTrack(audioTrack);
    } else if (audioTrack) {
      pc.addTrack(audioTrack, streamRef.current);
    }
  }, []);

  // Create or get peer connection for a target peer (Mobile acts as responder)
  const getOrCreatePeerConnection = useCallback(
    (targetPeerId: string) => {
      if (peerConnections.current.has(targetPeerId)) {
        return peerConnections.current.get(targetPeerId)!;
      }

      const pc = new RTCPeerConnection(rtcConfigRef.current);
      peerConnections.current.set(targetPeerId, pc);

      pc.onicecandidate = (e) => {
        if (e.candidate && socketRef.current) {
          socketRef.current.emit('signal', {
            targetPeerId,
            signal: e.candidate,
            streamType: 'mobile',
          });
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log(`[Mobile WebRTC] ICE state with ${targetPeerId}: ${pc.iceConnectionState}`);
      };

      return pc;
    },
    []
  );

  // Start mobile camera stream
  const startCamera = async (mode: 'environment' | 'user') => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }

    try {
      setVideoStatus('Requesting camera permissions...');
      let stream: MediaStream;
      const audioConstraint = isAssistantAudioEnabled
        ? { echoCancellation: true, noiseSuppression: true }
        : false;

      if (mode === 'environment') {
        // Forcing iPhone rear camera: try exact first, then fallback to ideal (Hardening Item 5)
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { exact: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: audioConstraint,
          });
        } catch (exactErr) {
          console.warn('[Camera] Exact environment constraint unavailable, falling back to ideal', exactErr);
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: audioConstraint,
          });
        }
      } else {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'user' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: audioConstraint,
        });
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      // Check if torch/flashlight is supported
      const track = stream.getVideoTracks()[0];
      const capabilities = track.getCapabilities ? (track.getCapabilities() as any) : {};
      setHasTorchSupport(Boolean(capabilities?.torch));

      setVideoStatus('Streaming Live to Clinic PC');

      // Update tracks on all active peer connections seamlessly via bindTracksToOffer
      peerConnections.current.forEach(async (pc) => {
        await bindTracksToOffer(pc);
      });

      // Join room now that camera hardware is verified active
      joinRoomIfReady();
    } catch (err: any) {
      console.error('Mobile camera start error:', err);
      setVideoStatus(`Camera Error: ${err?.message || 'Access Denied'}`);
    }
  };

  const joinRoomIfReady = useCallback(() => {
    if (hasJoinedRoomRef.current) return;
    if (socketRef.current?.connected && streamRef.current) {
      hasJoinedRoomRef.current = true;
      console.log(`[Mobile Companion] Camera ready and socket connected. Joining room: ${roomId}`);
      socketRef.current.emit('join-room', {
        roomId,
        role: 'mobile-cam',
        participantId: `mobile-${Date.now()}`,
        name: 'Mobile Companion Cam',
      });
    }
  }, [roomId]);

  useEffect(() => {
    startCamera(facingMode);
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [facingMode, isAssistantAudioEnabled]);

  // Page Visibility API: Detect iOS/Android backgrounding & notify clinic PC (Hardening Item 2)
  useEffect(() => {
    const handleVisibilityChange = () => {
      const isHidden = document.visibilityState === 'hidden';
      if (socketRef.current) {
        socketRef.current.emit('mobile-visibility-change', {
          roomId,
          isBackgrounded: isHidden,
        });
      }
      setVideoStatus(isHidden ? 'Paused by OS (Backgrounded)' : 'Streaming Live to Clinic PC');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [roomId]);

  // Connect to Socket.io signaling
  useEffect(() => {
    const s = io({
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
    });

    s.on('connect', () => {
      setIsConnected(true);
      joinRoomIfReady();
    });

    s.on('disconnect', () => setIsConnected(false));

    // Update ICE servers when room state provides Xirsys credentials
    s.on('room-state', (data: { participants?: any[]; iceServers?: RTCIceServer[] }) => {
      if (Array.isArray(data.iceServers) && data.iceServers.length > 0) {
        console.log(`[Mobile WebRTC] Received ${data.iceServers.length} Xirsys STUN/TURN servers via signaling`);
        rtcConfigRef.current = { iceServers: data.iceServers };
      }
    });

    // Handle peer WebRTC signals (Offers, Answers, ICE candidates)
    s.on('signal', async ({ senderPeerId, signal }) => {
      const pc = getOrCreatePeerConnection(senderPeerId);

      try {
        if ('sdp' in signal) {
          if (signal.type === 'offer') {
            // If we have an unexpected local offer in-flight, rollback safely
            if (pc.signalingState !== 'stable') {
              try {
                await pc.setLocalDescription({ type: 'rollback' });
              } catch (rbErr) {
                console.warn('[Mobile WebRTC] Rollback error:', rbErr);
              }
            }

            // 1. Establish offered transceivers from remote description
            await pc.setRemoteDescription(new RTCSessionDescription(signal));

            // 2. Bind active camera tracks to the offered transceivers (direction: sendonly)
            await bindTracksToOffer(pc);

            // 3. Drain queued ICE candidates
            const queued = iceCandidatesQueue.current.get(senderPeerId) || [];
            for (const cand of queued) {
              await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(console.warn);
            }
            iceCandidatesQueue.current.delete(senderPeerId);

            // 4. Create answer
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            const videoTrack = streamRef.current?.getVideoTracks()[0];
            const trackMeta = videoTrack
              ? [
                  {
                    trackId: videoTrack.id,
                    streamId: streamRef.current?.id,
                    feedType: 'mobile',
                  },
                ]
              : [];

            s.emit('signal', {
              targetPeerId: senderPeerId,
              signal: answer,
              streamType: 'mobile',
              trackMeta,
            });
            console.log(`[Mobile WebRTC] Answered offer from peer ${senderPeerId} with ${trackMeta.length} tracks`);
          } else if (signal.type === 'answer') {
            if (pc.signalingState === 'have-local-offer') {
              await pc.setRemoteDescription(new RTCSessionDescription(signal));
              const queued = iceCandidatesQueue.current.get(senderPeerId) || [];
              for (const cand of queued) {
                await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(console.warn);
              }
              iceCandidatesQueue.current.delete(senderPeerId);
            }
          }
        } else if ('candidate' in signal && signal.candidate) {
          if (pc.remoteDescription && pc.remoteDescription.type) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(signal));
            } catch (candErr) {
              console.warn('[Mobile WebRTC] Error adding ICE candidate:', candErr);
            }
          } else {
            const queue = iceCandidatesQueue.current.get(senderPeerId) || [];
            queue.push(signal);
            iceCandidatesQueue.current.set(senderPeerId, queue);
          }
        }
      } catch (err) {
        console.error('[Mobile WebRTC] Signal error:', err);
      }
    });

    s.on('peer-left', ({ socketId }) => {
      if (peerConnections.current.has(socketId)) {
        peerConnections.current.get(socketId)?.close();
        peerConnections.current.delete(socketId);
      }
      iceCandidatesQueue.current.delete(socketId);
    });

    socketRef.current = s;

    return () => {
      s.disconnect();
    };
  }, [roomId, getOrCreatePeerConnection, bindTracksToOffer, joinRoomIfReady]);

  // Toggle Torch/Flashlight
  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;

    try {
      const nextTorch = !isTorchOn;
      await (track as any).applyConstraints({
        advanced: [{ torch: nextTorch }],
      });
      setIsTorchOn(nextTorch);
    } catch (err) {
      console.warn('Torch constraint error:', err);
    }
  };

  // Flip Front/Back camera
  const toggleCameraFacing = () => {
    setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'));
  };

  return (
    <div className="relative w-full h-full min-h-screen bg-black flex flex-col justify-between overflow-hidden text-white select-none">
      {/* Top Header Status Bar */}
      <div className="relative z-20 flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center gap-2">
          <span className={`w-3 h-3 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
          <div>
            <h1 className="text-xs font-black tracking-wider uppercase text-cyan-400">
              Mobile Companion Camera
            </h1>
            <p className="text-[10px] text-slate-300 font-mono">Room: {roomId}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 bg-slate-900/80 px-2.5 py-1 rounded-full border border-slate-700 text-[11px] font-mono">
          <Wifi className="w-3.5 h-3.5 text-cyan-400" />
          <span>{isConnected ? 'ONLINE' : 'CONNECTING'}</span>
        </div>
      </div>

      {/* Fullscreen Video Viewfinder */}
      <div className="absolute inset-0 z-10 flex items-center justify-center bg-black">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted // Strictly muted on mobile to eliminate acoustic loop with PC
          className="w-full h-full object-cover"
        />

        {/* Live indicator overlay */}
        <div className="absolute top-20 left-4 z-20 bg-black/60 backdrop-blur-md px-3 py-1 rounded-lg border border-slate-700/60 text-xs">
          <span className="text-slate-300 font-medium">{videoStatus}</span>
        </div>
      </div>

      {/* Bottom Controls Bar */}
      <div className="relative z-20 p-6 bg-gradient-to-t from-black/95 via-black/80 to-transparent flex flex-col gap-4">
        {/* Assistant Audio Switch info */}
        <div className="flex items-center justify-between bg-slate-900/90 border border-slate-800 p-2.5 rounded-xl text-xs">
          <div className="flex items-center gap-2">
            {isAssistantAudioEnabled ? (
              <Mic className="w-4 h-4 text-emerald-400" />
            ) : (
              <MicOff className="w-4 h-4 text-slate-400" />
            )}
            <div>
              <p className="font-semibold text-slate-200">
                {isAssistantAudioEnabled ? 'Assistant Mic Active' : 'Audio Muted (Anti-Feedback)'}
              </p>
              <p className="text-[10px] text-slate-400">
                Muted by default to prevent speaker echo with the clinic PC
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsAssistantAudioEnabled(!isAssistantAudioEnabled)}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
              isAssistantAudioEnabled
                ? 'bg-rose-900/60 text-rose-300 border border-rose-700'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {isAssistantAudioEnabled ? 'Mute' : 'Enable Mic'}
          </button>
        </div>

        {/* Big Touch Controls */}
        <div className="flex items-center justify-around">
          {/* Torch Toggle */}
          <button
            onClick={toggleTorch}
            disabled={!hasTorchSupport}
            className={`p-4 rounded-2xl border transition flex flex-col items-center gap-1 ${
              isTorchOn
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/60 shadow-lg'
                : 'bg-slate-900/80 text-slate-400 border-slate-800 disabled:opacity-40'
            }`}
          >
            {isTorchOn ? <Flashlight className="w-6 h-6 text-amber-400" /> : <FlashlightOff className="w-6 h-6" />}
            <span className="text-[10px] font-bold">Torch</span>
          </button>

          {/* Flip Camera */}
          <button
            onClick={toggleCameraFacing}
            className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 text-slate-300 hover:text-white transition flex flex-col items-center gap-1 active:scale-95"
          >
            <FlipHorizontal className="w-6 h-6 text-cyan-400" />
            <span className="text-[10px] font-bold">Flip Lens</span>
          </button>
        </div>
      </div>
    </div>
  );
}
