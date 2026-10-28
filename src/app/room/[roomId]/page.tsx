'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import {
  ParticipantRole,
  VideoFeedType,
  FreezeFramePayload,
  ChatMessage,
  TelestrationStroke,
  DentalBadge,
} from '@/lib/webrtc-types';
import { useWebRTC } from '@/hooks/useWebRTC';
import { useDeviceEnumeration } from '@/hooks/useDeviceEnumeration';
import { useBandwidthMonitor } from '@/hooks/useBandwidthMonitor';
import { SessionHeader } from '@/components/communication/SessionHeader';
import { LowBandwidthBanner } from '@/components/clinical/LowBandwidthBanner';
import { MultiFeedDashboard } from '@/components/clinical/MultiFeedDashboard';
import { FreezeAnnotateStudio } from '@/components/telestration/FreezeAnnotateStudio';
import { MobilePairingModal } from '@/components/clinical/MobilePairingModal';
import { IntraoralCamManager } from '@/components/clinical/IntraoralCamManager';
import { CaseGalleryDrawer } from '@/components/clinical/CaseGalleryDrawer';
import { InCallChat } from '@/components/communication/InCallChat';
import { Volume2, VolumeX } from 'lucide-react';

export default function ClinicalRoomPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const roomId = (params.roomId as string) || 'CASE-DEMO';
  const role: ParticipantRole = (searchParams.get('role') as ParticipantRole) || 'junior-dentist';
  const participantName = searchParams.get('name') || (role === 'junior-dentist' ? 'Junior Clinician' : 'Senior Specialist');

  // Safari Audio Autoplay unlock gesture state
  const [isAudioUnlocked, setIsAudioUnlocked] = useState(false);
  const audioContextRef = React.useRef<AudioContext | null>(null);

  useEffect(() => {
    // Detect if Web Audio / Autoplay is permitted or suspended
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        const ctx = new AudioContextClass();
        audioContextRef.current = ctx;
        if (ctx.state === 'running') {
          setIsAudioUnlocked(true);
        } else {
          setIsAudioUnlocked(false);
        }
      } else {
        setIsAudioUnlocked(true);
      }
    } catch {
      setIsAudioUnlocked(false);
    }
  }, []);

  const unlockAudioContext = () => {
    try {
      // Resume existing or new audio context on user gesture
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().then(() => setIsAudioUnlocked(true)).catch(() => setIsAudioUnlocked(true));
      } else {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          const ctx = new AudioContextClass();
          audioContextRef.current = ctx;
          ctx.resume().then(() => setIsAudioUnlocked(true)).catch(() => setIsAudioUnlocked(true));
        } else {
          setIsAudioUnlocked(true);
        }
      }
      // Un-pause any attached DOM audio elements
      document.querySelectorAll('audio').forEach((el) => {
        el.play().catch(console.warn);
      });
    } catch {
      setIsAudioUnlocked(true);
    }
  };

  // Modals and Drawers
  const [isMobileModalOpen, setIsMobileModalOpen] = useState(false);
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [activeFreezeSnapshot, setActiveFreezeSnapshot] = useState<FreezeFramePayload | null>(null);

  // Case gallery state
  const [caseSnapshots, setCaseSnapshots] = useState<FreezeFramePayload[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [unreadChatCount, setUnreadChatCount] = useState(0);

  // Incoming external telestration strokes
  const [externalStrokes, setExternalStrokes] = useState<TelestrationStroke[]>([]);
  const [freezeAnnotationUpdate, setFreezeAnnotationUpdate] = useState<{
    snapshotId: string;
    strokes: TelestrationStroke[];
    badges: DentalBadge[];
  } | null>(null);

  // Hardware device manager
  const {
    videoDevices,
    selectedWebcamId,
    selectedIntraoralId,
    setSelectedWebcamId,
    setSelectedIntraoralId,
    refreshDevices,
    acquireCameraWithFallback,
    usbContentionWarning,
  } = useDeviceEnumeration();

  // WebRTC Client hook
  const {
    isConnected,
    participants,
    remoteFeeds,
    webcamStream,
    setWebcamStream,
    intraoralStream,
    setIntraoralStream,
    audioStream,
    setAudioStream,
    isAudioMuted,
    toggleAudio,
    triggerSnapshot,
    broadcastStroke,
    broadcastClear,
    sendChatMessage,
    broadcastTier,
    connectionWarning,
    serverConfig,
    socket,
    isMobileBackgrounded,
  } = useWebRTC({
    roomId,
    role,
    participantName,
    onSnapshotReceived: (payload) => {
      console.log('[Room] Received high-res snapshot payload:', payload.id);
      setActiveFreezeSnapshot(payload);
      setCaseSnapshots((prev) => [payload, ...prev.filter((s) => s.id !== payload.id)]);
    },
    onStrokeReceived: (stroke) => {
      setExternalStrokes((prev) => [...prev.slice(-30), stroke]);
    },
    onClearStrokes: () => {
      setExternalStrokes([]);
    },
    onChatMessageReceived: (msg) => {
      setChatMessages((prev) => [...prev, msg]);
      if (!isChatOpen) {
        setUnreadChatCount((c) => c + 1);
      }
    },
    onTierChanged: (tier) => {
      console.log('[Room] Bandwidth tier adjusted across peers to:', tier);
    },
  });

  // Listen to collaborative annotation updates during freeze mode
  useEffect(() => {
    if (!socket) return;
    const handleFreezeUpdate = (data: any) => setFreezeAnnotationUpdate(data);
    socket.on('freeze-annotation-update', handleFreezeUpdate);
    return () => {
      socket.off('freeze-annotation-update', handleFreezeUpdate);
    };
  }, [socket]);

  // Bandwidth monitor
  const { stats: networkStats, toggleForcedLowBandwidth } = useBandwidthMonitor({
    onTierChange: (tier) => broadcastTier(tier),
    webcamStream,
    intraoralStream,
  });

  // Acquire local media streams on component mount
  useEffect(() => {
    let isMounted = true;

    async function initHardware() {
      try {
        // 1. Audio stream with acoustic echo cancellation
        const audio = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
        if (isMounted) setAudioStream(audio);

        if (role === 'junior-dentist') {
          // 2. Junior PC: Ingest USB Intraoral camera and webcam
          if (selectedIntraoralId) {
            try {
              const intraResult = await acquireCameraWithFallback(selectedIntraoralId, true);
              const track = intraResult.stream.getVideoTracks()[0];
              if (track) {
                track.onended = () => {
                  console.warn('[Hardware] USB Intraoral camera unplugged/ended');
                  setIntraoralStream(null);
                };
              }
              if (isMounted) setIntraoralStream(intraResult.stream);
            } catch (err) {
              console.warn('Could not acquire selected intraoral camera:', err);
              setIntraoralStream(null);
            }
          }

          if (selectedWebcamId) {
            try {
              const webResult = await acquireCameraWithFallback(selectedWebcamId, false);
              const track = webResult.stream.getVideoTracks()[0];
              if (track) {
                track.onended = () => {
                  console.warn('[Hardware] Clinician webcam unplugged/ended');
                  setWebcamStream(null);
                };
              }
              if (isMounted) setWebcamStream(webResult.stream);
            } catch (err) {
              console.warn('Could not acquire selected webcam:', err);
              setWebcamStream(null);
            }
          }
        } else {
          // 3. Senior Doctor: Standard webcam stream
          try {
            const docCam = await navigator.mediaDevices.getUserMedia({
              video: { width: 1280, height: 720 },
              audio: false,
            });
            const track = docCam.getVideoTracks()[0];
            if (track) {
              track.onended = () => {
                console.warn('[Hardware] Senior doctor camera unplugged/ended');
                setWebcamStream(null);
              };
            }
            if (isMounted) setWebcamStream(docCam);
          } catch (err) {
            console.warn('Senior doctor camera unavailable:', err);
            setWebcamStream(null);
          }
        }
      } catch (err) {
        console.error('Initial hardware acquisition error:', err);
      }
    }

    initHardware();

    return () => {
      isMounted = false;
    };
  }, [role, selectedIntraoralId, selectedWebcamId, videoDevices, acquireCameraWithFallback, setAudioStream, setIntraoralStream, setWebcamStream]);

  // Route incoming remote feeds to proper video slots
  let remoteIntraoral: MediaStream | null = null;
  let remoteWebcam: MediaStream | null = null;
  let remoteMobile: MediaStream | null = null;
  let remoteSenior: MediaStream | null = null;

  remoteFeeds.forEach((val) => {
    if (val.feedType === 'intraoral') remoteIntraoral = val.stream;
    else if (val.feedType === 'webcam') remoteWebcam = val.stream;
    else if (val.feedType === 'mobile') remoteMobile = val.stream;
    else if (val.feedType === 'senior-cam') remoteSenior = val.stream;
  });

  const activeIntraoral = role === 'junior-dentist' ? intraoralStream : remoteIntraoral;
  const activeWebcam = role === 'junior-dentist' ? webcamStream : remoteWebcam;
  const activeMobile = remoteMobile;
  const activeSenior = role === 'senior-doctor' ? webcamStream : remoteSenior;

  const handleLeaveCall = () => {
    // Stop local tracks
    webcamStream?.getTracks().forEach((t) => t.stop());
    intraoralStream?.getTracks().forEach((t) => t.stop());
    audioStream?.getTracks().forEach((t) => t.stop());
    router.push('/');
  };

  const handleSaveAnnotatedSnapshot = (annotated: FreezeFramePayload) => {
    setCaseSnapshots((prev) => [annotated, ...prev.filter((s) => s.id !== annotated.id)]);
  };

  const handleDeleteSnapshot = (id: string) => {
    setCaseSnapshots((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-clinical-dark overflow-hidden select-none">
      {/* Session Top Header */}
      <SessionHeader
        roomId={roomId}
        role={role}
        participantName={participantName}
        participants={participants}
        isAudioMuted={isAudioMuted}
        onToggleAudio={toggleAudio}
        onTriggerSnapshot={() => triggerSnapshot('intraoral')}
        onOpenMobileModal={() => setIsMobileModalOpen(true)}
        onOpenDeviceModal={() => setIsDeviceModalOpen(true)}
        onOpenGallery={() => setIsGalleryOpen(true)}
        onOpenChat={() => {
          setIsChatOpen(true);
          setUnreadChatCount(0);
        }}
        snapshotCount={caseSnapshots.length}
        unreadChatCount={unreadChatCount}
        onLeaveCall={handleLeaveCall}
      />

      {/* Safari Audio Autoplay Unlock Banner */}
      {!isAudioUnlocked && (
        <div className="bg-gradient-to-r from-amber-900/90 to-amber-950/90 border-b border-amber-600/70 text-amber-100 px-4 py-2 flex items-center justify-between shadow-lg z-40 animate-pulse">
          <div className="flex items-center gap-2.5">
            <VolumeX className="w-4 h-4 text-amber-300 shrink-0" />
            <span className="text-xs font-semibold">
              Safari Audio Protection Active: Incoming voice from clinical mentors is muted until enabled.
            </span>
          </div>
          <button
            onClick={unlockAudioContext}
            className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded transition shadow-sm flex items-center gap-1.5 shrink-0"
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>Enable Clinical Audio</span>
          </button>
        </div>
      )}

      {/* Network Bandwidth Banner */}
      <LowBandwidthBanner stats={networkStats} onToggleForceMode={toggleForcedLowBandwidth} />

      {/* Warning Toast if P2P Limit reached or USB saturated */}
      {connectionWarning && (
        <div className="bg-amber-950/80 border-b border-amber-800 text-amber-200 px-4 py-1.5 text-xs font-medium flex items-center justify-between">
          <span>{connectionWarning}</span>
        </div>
      )}

      {/* Main Focus + Carousel Multi-Feed Video Dashboard */}
      <MultiFeedDashboard
        currentUserRole={role}
        currentUserId={socket?.id || 'me'}
        currentUserName={participantName}
        webcamStream={activeWebcam}
        intraoralStream={activeIntraoral}
        mobileStream={activeMobile}
        seniorStream={activeSenior}
        onBroadcastStroke={broadcastStroke}
        externalStrokes={externalStrokes}
        onTriggerSnapshot={(feedType) => triggerSnapshot(feedType)}
        networkStats={networkStats}
        isMobileBackgrounded={isMobileBackgrounded}
      />

      {/* Freeze & Annotate Studio Modal (Active when snapshot captured) */}
      {activeFreezeSnapshot && (
        <FreezeAnnotateStudio
          snapshot={activeFreezeSnapshot}
          currentUserRole={role}
          currentUserId={socket?.id || 'me'}
          currentUserName={participantName}
          onClose={() => setActiveFreezeSnapshot(null)}
          onSaveToGallery={handleSaveAnnotatedSnapshot}
          onBroadcastAnnotationUpdate={(update) => socket?.emit('freeze-annotation-update', update)}
          externalUpdate={freezeAnnotationUpdate}
        />
      )}

      {/* Mobile Pairing QR Modal */}
      <MobilePairingModal
        roomId={roomId}
        localIp={serverConfig.localIp}
        httpPort={serverConfig.httpPort}
        httpsPort={serverConfig.httpsPort}
        isOpen={isMobileModalOpen}
        onClose={() => setIsMobileModalOpen(false)}
      />

      {/* USB Hardware Device Settings Modal */}
      <IntraoralCamManager
        videoDevices={videoDevices}
        selectedWebcamId={selectedWebcamId}
        selectedIntraoralId={selectedIntraoralId}
        onSelectWebcam={setSelectedWebcamId}
        onSelectIntraoral={setSelectedIntraoralId}
        onRefreshDevices={refreshDevices}
        usbContentionWarning={usbContentionWarning}
        isOpen={isDeviceModalOpen}
        onClose={() => setIsDeviceModalOpen(false)}
      />

      {/* Case Gallery & PDF Summary Export Drawer */}
      <CaseGalleryDrawer
        isOpen={isGalleryOpen}
        onClose={() => setIsGalleryOpen(false)}
        snapshots={caseSnapshots}
        onDeleteSnapshot={handleDeleteSnapshot}
        onSelectSnapshotToAnnotate={(snap) => {
          setActiveFreezeSnapshot(snap);
          setIsGalleryOpen(false);
        }}
        roomId={roomId}
        dentistName={participantName}
        consultants={participants.filter((p) => p.role === 'senior-doctor')}
        chatMessages={chatMessages}
      />

      {/* Ephemeral Clinical In-Call Chat */}
      <InCallChat
        messages={chatMessages}
        onSendMessage={sendChatMessage}
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        currentUserRole={role}
      />
    </div>
  );
}
