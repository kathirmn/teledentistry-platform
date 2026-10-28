'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  Participant,
  ParticipantRole,
  VideoFeedType,
  FreezeFramePayload,
  ChatMessage,
  TelestrationStroke,
  LowBandwidthTier,
} from '@/lib/webrtc-types';

interface UseWebRTCOptions {
  roomId: string;
  role: ParticipantRole;
  participantName: string;
  onSnapshotReceived?: (payload: FreezeFramePayload) => void;
  onStrokeReceived?: (stroke: TelestrationStroke) => void;
  onClearStrokes?: () => void;
  onChatMessageReceived?: (msg: ChatMessage) => void;
  onTierChanged?: (tier: LowBandwidthTier) => void;
}

export function useWebRTC({
  roomId,
  role,
  participantName,
  onSnapshotReceived,
  onStrokeReceived,
  onClearStrokes,
  onChatMessageReceived,
  onTierChanged,
}: UseWebRTCOptions) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [remoteFeeds, setRemoteFeeds] = useState<Map<string, { stream: MediaStream; feedType: VideoFeedType; peerId: string }>>(
    new Map()
  );
  const [isMobileBackgrounded, setIsMobileBackgrounded] = useState(false);
  const [connectionWarning, setConnectionWarning] = useState<string | null>(null);
  const [serverConfig, setServerConfig] = useState<{
    localIp: string;
    httpPort: number;
    httpsPort: number;
  }>({
    localIp: 'localhost',
    httpPort: 3000,
    httpsPort: 3443,
  });

  // Local media tracks
  const [webcamStream, setWebcamStream] = useState<MediaStream | null>(null);
  const [intraoralStream, setIntraoralStream] = useState<MediaStream | null>(null);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const [isAudioMuted, setIsAudioMuted] = useState(false);

  // References to peer connections: peerSocketId -> RTCPeerConnection
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const dataChannels = useRef<Map<string, RTCDataChannel>>(new Map());
  const peerRolesRef = useRef<Map<string, ParticipantRole>>(new Map());
  const iceCandidatesQueue = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  // W3C Perfect Negotiation & Track Identification state
  interface PeerSenders {
    audio?: RTCRtpSender | null;
    intraoral?: RTCRtpSender | null;
    webcam?: RTCRtpSender | null;
  }
  const peerSendersRef = useRef<Map<string, PeerSenders>>(new Map());
  const trackMetadataRef = useRef<Map<string, VideoFeedType>>(new Map());
  const streamMetadataRef = useRef<Map<string, VideoFeedType>>(new Map());
  const makingOfferRef = useRef<Map<string, boolean>>(new Map());
  const [iceConnectionState, setIceConnectionState] = useState<RTCIceConnectionState>('new');

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
          console.log(`[WebRTC] Loaded ${data.iceServers.length} ICE server(s) from Xirsys`);
          rtcConfigRef.current = { iceServers: data.iceServers };
        }
      })
      .catch((err) => console.warn('[WebRTC] Failed to prefetch ice-servers:', err));
  }, []);

  // 1. Initialize Socket.io connection
  useEffect(() => {
    const s = io({
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    s.on('connect', () => {
      setIsConnected(true);
      s.emit('join-room', {
        roomId,
        role,
        participantId: `p-${Math.random().toString(36).substr(2, 7)}`,
        name: participantName,
      });
    });

    s.on('disconnect', () => {
      setIsConnected(false);
    });

    s.on('room-state', (data) => {
      setParticipants(data.participants);
      if (Array.isArray(data.participants)) {
        data.participants.forEach((p: Participant) => peerRolesRef.current.set(p.socketId, p.role));
      }
      if (Array.isArray(data.iceServers) && data.iceServers.length > 0) {
        console.log(`[WebRTC] Received ${data.iceServers.length} Xirsys STUN/TURN servers via signaling`);
        rtcConfigRef.current = { iceServers: data.iceServers };
      }
      if (data.localIp) {
        setServerConfig({
          localIp: data.localIp,
          httpPort: data.httpPort || 3000,
          httpsPort: data.httpsPort || 3443,
        });
      }
    });

    s.on('room-warning', (data) => {
      setConnectionWarning(data.message);
    });

    s.on('peer-joined', (peer: Participant) => {
      peerRolesRef.current.set(peer.socketId, peer.role);
      setParticipants((prev) => [...prev.filter((p) => p.socketId !== peer.socketId), peer]);
    });

    s.on('peer-left', ({ socketId }) => {
      setParticipants((prev) => prev.filter((p) => p.socketId !== socketId));
      if (peerConnections.current.has(socketId)) {
        peerConnections.current.get(socketId)?.close();
        peerConnections.current.delete(socketId);
      }
      iceCandidatesQueue.current.delete(socketId);
      peerRolesRef.current.delete(socketId);
      peerSendersRef.current.delete(socketId);
      makingOfferRef.current.delete(socketId);
      const existingAudioEl = document.getElementById(`audio-peer-${socketId}`);
      if (existingAudioEl) existingAudioEl.remove();
      setRemoteFeeds((prev) => {
        const next = new Map(prev);
        for (const [key, val] of next.entries()) {
          if (val.peerId === socketId) next.delete(key);
        }
        return next;
      });
    });

    // Deterministic WebRTC track-to-feed mapping
    s.on('track-metadata', ({ senderPeerId, tracks }: { senderPeerId: string; tracks: Array<{ trackId: string; streamId?: string; feedType: VideoFeedType }> }) => {
      if (Array.isArray(tracks)) {
        tracks.forEach(({ trackId, streamId, feedType }) => {
          if (trackId) trackMetadataRef.current.set(trackId, feedType);
          if (streamId) streamMetadataRef.current.set(streamId, feedType);
          console.log(`[WebRTC TrackMeta] Mapped track ${trackId} (stream: ${streamId}) -> ${feedType} from ${senderPeerId}`);

          // Update any already-attached remote feeds
          setRemoteFeeds((prev) => {
            const next = new Map(prev);
            let updated = false;
            for (const [key, val] of next.entries()) {
              if (val.peerId === senderPeerId) {
                const matchesTrack = trackId && val.stream.getVideoTracks().some((t) => t.id === trackId);
                const matchesStream = streamId && val.stream.id === streamId;
                if ((matchesTrack || matchesStream) && val.feedType !== feedType) {
                  next.delete(key);
                  next.set(`${senderPeerId}-${feedType}`, { stream: val.stream, feedType, peerId: senderPeerId });
                  updated = true;
                }
              }
            }
            return updated ? next : prev;
          });
        });
      }
    });

    s.on('telestration-stroke', (data) => onStrokeReceived?.(data));
    s.on('telestration-clear', () => onClearStrokes?.());
    s.on('snapshot-captured', (payload) => onSnapshotReceived?.(payload));
    s.on('chat-message', (msg) => onChatMessageReceived?.(msg));
    s.on('low-bandwidth-state', (data) => onTierChanged?.(data.tier));
    s.on('mobile-visibility-change', (data: { isBackgrounded: boolean }) => {
      setIsMobileBackgrounded(Boolean(data?.isBackgrounded));
    });

    setSocket(s);

    return () => {
      s.disconnect();
    };
  }, [roomId, role, participantName]);

  // Critical Trap #4 Fix: Junior PC listens for remote snapshot requests and grabs local hardware frame
  useEffect(() => {
    if (!socket || role !== 'junior-dentist') return;

    const handleHardwareSnapshotRequest = async (data: { feedType: VideoFeedType }) => {
      console.log('[Snapshot] Received remote hardware snapshot request for:', data.feedType);
      const targetStream = data.feedType === 'webcam' ? webcamStream : intraoralStream;

      if (!targetStream) {
        console.warn('Target stream not active for hardware snapshot');
        return;
      }

      try {
        const videoTrack = targetStream.getVideoTracks()[0];
        if (!videoTrack) return;

        // Extract native hardware frame locked to sensor resolution (Item 4)
        const settings = videoTrack.getSettings();
        const targetWidth = settings.width || 1920;
        const targetHeight = settings.height || 1080;

        let rawDataUrl: string | null = null;
        let finalWidth = targetWidth;
        let finalHeight = targetHeight;

        if (typeof window !== 'undefined' && 'ImageCapture' in window) {
          try {
            const imageCapture = new (window as any).ImageCapture(videoTrack);
            const bitmap = await imageCapture.grabFrame();
            const canvas = document.createElement('canvas');
            canvas.width = bitmap.width || targetWidth;
            canvas.height = bitmap.height || targetHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
              rawDataUrl = canvas.toDataURL('image/jpeg', 0.98);
              finalWidth = canvas.width;
              finalHeight = canvas.height;
            }
          } catch (e) {
            console.warn('ImageCapture fallback', e);
          }
        }

        if (!rawDataUrl) {
          const offscreenVideo = document.createElement('video');
          offscreenVideo.muted = true;
          offscreenVideo.playsInline = true;
          offscreenVideo.srcObject = new MediaStream([videoTrack]);
          await offscreenVideo.play();

          const canvas = document.createElement('canvas');
          canvas.width = offscreenVideo.videoWidth || targetWidth;
          canvas.height = offscreenVideo.videoHeight || targetHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(offscreenVideo, 0, 0, canvas.width, canvas.height);
            rawDataUrl = canvas.toDataURL('image/jpeg', 0.98);
            finalWidth = canvas.width;
            finalHeight = canvas.height;
          }
        }

        if (rawDataUrl) {
          const payload: FreezeFramePayload = {
            id: `snap-${Date.now()}`,
            feedType: data.feedType,
            dataUrl: rawDataUrl,
            originalWidth: finalWidth,
            originalHeight: finalHeight,
            capturedBy: {
              id: socket.id || 'clinic-pc',
              name: participantName,
              role: 'junior-dentist',
            },
            timestamp: Date.now(),
          };

          socket.emit('snapshot-captured', payload);
        }
      } catch (err) {
        console.error('Failed to capture local hardware snapshot:', err);
      }
    };

    socket.on('request-hardware-snapshot', handleHardwareSnapshotRequest);
    return () => {
      socket.off('request-hardware-snapshot', handleHardwareSnapshotRequest);
    };
  }, [socket, role, webcamStream, intraoralStream, participantName]);

  // Determine if this client acts as the polite peer during offer collisions (W3C Perfect Negotiation)
  const isPolite = useCallback(
    (targetPeerId: string) => {
      const peerRole = peerRolesRef.current.get(targetPeerId);
      // Senior specialist is polite mentor; junior dentist is authoritative clinic host
      if (role === 'senior-doctor') return true;
      if (peerRole === 'senior-doctor') return false;
      return socket?.id ? socket.id < targetPeerId : true;
    },
    [role, socket]
  );

  // Helper to extract deterministic metadata for all active local video tracks
  const getLocalTrackMeta = useCallback(() => {
    const meta: Array<{ trackId: string; streamId?: string; feedType: VideoFeedType }> = [];
    if (role === 'junior-dentist') {
      if (intraoralStream) {
        const intraTrack = intraoralStream.getVideoTracks()[0];
        if (intraTrack) {
          meta.push({
            trackId: intraTrack.id,
            streamId: intraoralStream.id,
            feedType: 'intraoral',
          });
        }
      }
      if (webcamStream) {
        const webTrack = webcamStream.getVideoTracks()[0];
        if (webTrack) {
          meta.push({
            trackId: webTrack.id,
            streamId: webcamStream.id,
            feedType: 'webcam',
          });
        }
      }
    } else if (role === 'senior-doctor') {
      if (webcamStream) {
        const webTrack = webcamStream.getVideoTracks()[0];
        if (webTrack) {
          meta.push({
            trackId: webTrack.id,
            streamId: webcamStream.id,
            feedType: 'senior-cam',
          });
        }
      }
    }
    return meta;
  }, [role, intraoralStream, webcamStream]);

  // Synchronize local audio and video tracks onto a peer connection
  const syncLocalTracksToPc = useCallback(
    (targetPeerId: string, pc: RTCPeerConnection) => {
      const targetRole = peerRolesRef.current.get(targetPeerId);
      if (targetRole === 'mobile-cam') return; // Mobile is receive-only

      if (!peerSendersRef.current.has(targetPeerId)) {
        peerSendersRef.current.set(targetPeerId, {});
      }
      const senders = peerSendersRef.current.get(targetPeerId)!;
      const pcSenders = pc.getSenders();

      // 1. Audio track synchronization
      if (audioStream) {
        const audioTrack = audioStream.getAudioTracks()[0];
        if (audioTrack) {
          if (senders.audio && pcSenders.includes(senders.audio)) {
            senders.audio.replaceTrack(audioTrack).catch(console.warn);
          } else {
            try {
              senders.audio = pc.addTrack(audioTrack, audioStream);
            } catch (e) {
              console.warn('[WebRTC] Error adding audio track:', e);
            }
          }
        }
      }

      // 2. Intraoral camera track synchronization (Junior Dentist only)
      if (role === 'junior-dentist') {
        if (intraoralStream) {
          const intraTrack = intraoralStream.getVideoTracks()[0];
          if (intraTrack) {
            if (senders.intraoral && pcSenders.includes(senders.intraoral)) {
              senders.intraoral.replaceTrack(intraTrack).catch(console.warn);
            } else {
              try {
                senders.intraoral = pc.addTrack(intraTrack, intraoralStream);
              } catch (e) {
                console.warn('[WebRTC] Error adding intraoral track:', e);
              }
            }
          }
        } else if (senders.intraoral && pcSenders.includes(senders.intraoral)) {
          // Camera disconnected/ended - replace with null to deactivate on remote peer
          senders.intraoral.replaceTrack(null).catch(console.warn);
        }
      }

      // 3. Webcam track synchronization (Junior Dentist face webcam or Senior Doctor camera)
      if (webcamStream) {
        const webTrack = webcamStream.getVideoTracks()[0];
        if (webTrack) {
          if (senders.webcam && pcSenders.includes(senders.webcam)) {
            senders.webcam.replaceTrack(webTrack).catch(console.warn);
          } else {
            try {
              senders.webcam = pc.addTrack(webTrack, webcamStream);
            } catch (e) {
              console.warn('[WebRTC] Error adding webcam track:', e);
            }
          }
        }
      } else if (senders.webcam && pcSenders.includes(senders.webcam)) {
        senders.webcam.replaceTrack(null).catch(console.warn);
      }

      // 4. Broadcast track metadata to target peer so receiver maps tracks deterministically
      const trackMeta = getLocalTrackMeta();
      if (trackMeta.length > 0 && socket) {
        socket.emit('track-metadata', { targetPeerId, tracks: trackMeta });
      }
    },
    [role, audioStream, intraoralStream, webcamStream, socket, getLocalTrackMeta]
  );

  // Whenever local media streams become available or change, sync to all existing peer connections!
  useEffect(() => {
    peerConnections.current.forEach((pc, targetPeerId) => {
      syncLocalTracksToPc(targetPeerId, pc);
    });
  }, [audioStream, intraoralStream, webcamStream, syncLocalTracksToPc]);

  // Create WebRTC Peer Connection
  const createPeerConnection = useCallback(
    (targetPeerId: string, isInitiator: boolean) => {
      if (peerConnections.current.has(targetPeerId)) {
        return peerConnections.current.get(targetPeerId)!;
      }

      const pc = new RTCPeerConnection(rtcConfigRef.current);
      peerConnections.current.set(targetPeerId, pc);

      const targetRole = peerRolesRef.current.get(targetPeerId);
      const isMobile = targetRole === 'mobile-cam';

      if (!isMobile) {
        // Sync any currently available local tracks immediately
        syncLocalTracksToPc(targetPeerId, pc);

        // Setup DataChannel for ultra low latency strokes ONLY between doctors/clinicians (never mobile camera)
        if (isInitiator) {
          try {
            const dc = pc.createDataChannel('telestration', { ordered: false });
            setupDataChannel(dc);
            dataChannels.current.set(targetPeerId, dc);
          } catch (dcErr) {
            console.warn('[WebRTC DataChannel] Failed to create data channel:', dcErr);
          }
        } else {
          pc.ondatachannel = (e) => {
            setupDataChannel(e.channel);
            dataChannels.current.set(targetPeerId, e.channel);
          };
        }

      } else {
        // For mobile companion camera: receive-only, zero unnecessary PC uplink encoding, zero SCTP data channel!
        try {
          pc.addTransceiver('video', { direction: 'recvonly' });
          pc.addTransceiver('audio', { direction: 'recvonly' });
        } catch (tErr) {
          console.warn('[WebRTC] addTransceiver fallback:', tErr);
        }
      }

      // Setup W3C onnegotiationneeded handler
      pc.onnegotiationneeded = async () => {
        try {
          makingOfferRef.current.set(targetPeerId, true);
          if (!isMobile) syncLocalTracksToPc(targetPeerId, pc);
          const offer = await pc.createOffer();
          if (pc.signalingState !== 'stable') return;
          await pc.setLocalDescription(offer);
          const trackMeta = isMobile ? [] : getLocalTrackMeta();
          socket?.emit('signal', {
            targetPeerId,
            signal: offer,
            trackMeta,
          });
          console.log(`[WebRTC] Sent renegotiation offer with ${trackMeta.length} track metadata to ${targetPeerId} (isMobile: ${isMobile})`);
        } catch (err) {
          console.warn(`[WebRTC] Negotiation error with ${targetPeerId}:`, err);
        } finally {
          makingOfferRef.current.set(targetPeerId, false);
        }
      };

      // Connection health & ICE state listeners
      pc.oniceconnectionstatechange = () => {
        console.log(`[WebRTC] ICE state with ${targetPeerId}: ${pc.iceConnectionState}`);
        setIceConnectionState(pc.iceConnectionState);
        if (pc.iceConnectionState === 'failed') {
          console.warn(`[WebRTC] ICE failed with ${targetPeerId}. Attempting ICE restart...`);
          try {
            pc.restartIce();
          } catch (iceErr) {
            console.warn('[WebRTC] Error restarting ICE:', iceErr);
          }
        }
      };

      pc.onconnectionstatechange = () => {
        console.log(`[WebRTC] Connection state with ${targetPeerId}: ${pc.connectionState}`);
      };

      // Send ICE candidates to peer via socket
      pc.onicecandidate = (e) => {
        if (e.candidate && socket) {
          socket.emit('signal', {
            targetPeerId,
            signal: e.candidate,
          });
        }
      };

      // Handle incoming remote media tracks
      pc.ontrack = (e) => {
        const [incomingStream] = e.streams;
        const track = e.track;

        if (track.kind === 'audio') {
          console.log(`[WebRTC ontrack] Incoming audio track from peer: ${targetPeerId}`);
          let audioEl = document.getElementById(`audio-peer-${targetPeerId}`) as HTMLAudioElement;
          if (!audioEl) {
            audioEl = document.createElement('audio');
            audioEl.id = `audio-peer-${targetPeerId}`;
            audioEl.autoplay = true;
            (audioEl as any).playsInline = true;
            document.body.appendChild(audioEl);
          }
          audioEl.srcObject = incomingStream || new MediaStream([track]);
          audioEl.play().catch((err) => {
            console.warn('[WebRTC Audio] Remote audio autoplay blocked by browser policy:', err);
          });
          return;
        }

        if (track.kind === 'video') {
          // Identify feedType deterministically via trackMetadataRef, streamMetadataRef, or isMobile
          let feedType: VideoFeedType | undefined =
            isMobile
              ? 'mobile'
              : trackMetadataRef.current.get(track.id) ||
                (incomingStream && streamMetadataRef.current.get(incomingStream.id));

          if (!feedType) {
            const peerRole = peerRolesRef.current.get(targetPeerId);
            if (peerRole === 'senior-doctor') {
              feedType = 'senior-cam';
            } else if (peerRole === 'mobile-cam') {
              feedType = 'mobile';
            } else {
              // Junior dentist sends up to 2 video feeds: intraoral & webcam.
              // Check what feeds we already have from this peer so we never overwrite!
              const existing = Array.from(remoteFeeds.values()).filter((f) => f.peerId === targetPeerId);
              const hasIntra = existing.some((f) => f.feedType === 'intraoral');
              const hasWeb = existing.some((f) => f.feedType === 'webcam');

              if (!hasIntra && !hasWeb) {
                // First video track from junior dentist:
                // If junior dentist only has 1 camera, it's typically their face webcam
                feedType = 'webcam';
              } else if (hasIntra && !hasWeb) {
                feedType = 'webcam';
              } else {
                feedType = 'intraoral';
              }
            }
          }

          console.log(`[WebRTC ontrack] Incoming video track ${track.id} from ${targetPeerId} mapped to feedType: ${feedType}`);
          const feedKey = `${targetPeerId}-${feedType}`;
          const finalStream = incomingStream || new MediaStream([track]);

          setRemoteFeeds((prev) => {
            const next = new Map(prev);
            next.set(feedKey, { stream: finalStream, feedType: feedType!, peerId: targetPeerId });
            return next;
          });

          // Handle track ending / deactivation cleanly
          track.onended = () => {
            console.log(`[WebRTC ontrack] Remote track ${track.id} (${feedType}) ended`);
            setRemoteFeeds((prev) => {
              const next = new Map(prev);
              next.delete(feedKey);
              return next;
            });
          };
        }
      };

      return pc;
    },
    [socket, syncLocalTracksToPc, getLocalTrackMeta, remoteFeeds]
  );

  const setupDataChannel = (dc: RTCDataChannel) => {
    dc.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'stroke') onStrokeReceived?.(msg.stroke);
        else if (msg.type === 'clear') onClearStrokes?.();
      } catch (err) {
        console.error('DataChannel parse error:', err);
      }
    };
  };

  // Handle incoming WebRTC signals with W3C Perfect Negotiation & in-band track metadata
  useEffect(() => {
    if (!socket) return;

    socket.on('signal', async ({ senderPeerId, senderRole, signal, trackMeta }) => {
      if (senderRole) {
        peerRolesRef.current.set(senderPeerId, senderRole);
      }

      // 1. Immediately store track & stream metadata BEFORE setting remote description!
      if (Array.isArray(trackMeta)) {
        trackMeta.forEach(({ trackId, streamId, feedType }: { trackId: string; streamId?: string; feedType: VideoFeedType }) => {
          if (trackId) trackMetadataRef.current.set(trackId, feedType);
          if (streamId) streamMetadataRef.current.set(streamId, feedType);
          console.log(`[WebRTC Signal Meta] In-band mapped track ${trackId} (stream: ${streamId}) -> ${feedType} from ${senderPeerId}`);
        });
      }

      let pc = peerConnections.current.get(senderPeerId);

      if (!pc) {
        pc = createPeerConnection(senderPeerId, false);
      }

      try {
        if ('sdp' in signal) {
          const desc = new RTCSessionDescription(signal as RTCSessionDescriptionInit);

          if (desc.type === 'offer') {
            const isMakingOffer = Boolean(makingOfferRef.current.get(senderPeerId));
            const offerCollision = isMakingOffer || pc.signalingState !== 'stable';
            const polite = isPolite(senderPeerId);

            if (offerCollision) {
              if (!polite) {
                console.warn(`[WebRTC] Ignoring colliding offer from ${senderPeerId} (impolite host)`);
                return;
              }
              console.log(`[WebRTC] Rolling back local offer for ${senderPeerId} (polite mentor)`);
              try {
                await pc.setLocalDescription({ type: 'rollback' });
              } catch (rbErr) {
                console.warn('[WebRTC] Rollback error:', rbErr);
              }
            }

            await pc.setRemoteDescription(desc);

            // Drain queued ICE candidates
            const queued = iceCandidatesQueue.current.get(senderPeerId) || [];
            for (const cand of queued) {
              await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(console.warn);
            }
            iceCandidatesQueue.current.delete(senderPeerId);

            // Make sure our local tracks are attached before answering
            syncLocalTracksToPc(senderPeerId, pc);

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            const myTrackMeta = getLocalTrackMeta();
            socket.emit('signal', {
              targetPeerId: senderPeerId,
              signal: answer,
              trackMeta: myTrackMeta,
            });
            console.log(`[WebRTC] Answered offer from ${senderPeerId} with ${myTrackMeta.length} track metadata`);
          } else if (desc.type === 'answer') {
            if (pc.signalingState === 'have-local-offer') {
              await pc.setRemoteDescription(desc);

              // Drain queued ICE candidates
              const queued = iceCandidatesQueue.current.get(senderPeerId) || [];
              for (const cand of queued) {
                await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(console.warn);
              }
              iceCandidatesQueue.current.delete(senderPeerId);
              console.log(`[WebRTC] Remote answer accepted from ${senderPeerId}`);
            }
          }
        } else if ('candidate' in signal && signal.candidate) {
          if (pc.remoteDescription && pc.remoteDescription.type) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(signal as RTCIceCandidateInit));
            } catch (iceErr) {
              console.warn('[WebRTC] ICE candidate error:', iceErr);
            }
          } else {
            const queue = iceCandidatesQueue.current.get(senderPeerId) || [];
            queue.push(signal as RTCIceCandidateInit);
            iceCandidatesQueue.current.set(senderPeerId, queue);
          }
        }
      } catch (err) {
        console.error('[WebRTC] Signal handling error:', err);
      }
    });

    return () => {
      socket.off('signal');
    };
  }, [socket, createPeerConnection, isPolite, syncLocalTracksToPc, getLocalTrackMeta]);

  // Connect to newly joined peers
  useEffect(() => {
    if (!socket || !isConnected) return;

    participants.forEach(async (peer) => {
      // Record peer role immediately before creating connection!
      peerRolesRef.current.set(peer.socketId, peer.role);

      if (!peerConnections.current.has(peer.socketId)) {
        // Designate initial offer initiator: junior clinic is primary host; senior doctor answers
        const shouldInitiate = role === 'junior-dentist' || peer.role === 'mobile-cam' || ((socket.id || '') < peer.socketId);
        const pc = createPeerConnection(peer.socketId, shouldInitiate);

        if (shouldInitiate) {
          try {
            makingOfferRef.current.set(peer.socketId, true);
            syncLocalTracksToPc(peer.socketId, pc);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            const myTrackMeta = getLocalTrackMeta();
            socket.emit('signal', {
              targetPeerId: peer.socketId,
              signal: offer,
              trackMeta: myTrackMeta,
            });
            console.log(`[WebRTC] Sent initial offer with ${myTrackMeta.length} track metadata to peer ${peer.socketId} (${peer.role})`);
          } catch (offerErr) {
            console.error('[WebRTC] Error creating/setting initial offer:', offerErr);
          } finally {
            makingOfferRef.current.set(peer.socketId, false);
          }
        }
      }
    });
  }, [participants, socket, isConnected, role, createPeerConnection, syncLocalTracksToPc, getLocalTrackMeta]);

  // Audio mute/unmute
  const toggleAudio = useCallback(() => {
    if (audioStream) {
      const audioTrack = audioStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioMuted(!audioTrack.enabled);
      }
    }
  }, [audioStream]);

  // Trigger high-res snapshot (Senior Doctor requesting from Junior PC or local fallback)
  const triggerSnapshot = useCallback(
    (feedType: VideoFeedType = 'intraoral') => {
      if (!socket) return;

      if (role === 'senior-doctor') {
        // Dispatch hardware request to Junior PC to extract from pristine local buffer
        socket.emit('request-hardware-snapshot', { feedType });
      } else {
        // Junior clinic taking snapshot locally
        const targetStream = feedType === 'webcam' ? webcamStream : intraoralStream;
        if (!targetStream) return;
        const videoTrack = targetStream.getVideoTracks()[0];
        if (!videoTrack) return;

        // Native hardware resolution capture (Item 4)
        const settings = videoTrack.getSettings();
        const targetWidth = settings.width || 1920;
        const targetHeight = settings.height || 1080;

        const offscreenVideo = document.createElement('video');
        offscreenVideo.muted = true;
        offscreenVideo.playsInline = true;
        offscreenVideo.srcObject = new MediaStream([videoTrack]);
        offscreenVideo.play().then(() => {
          const canvas = document.createElement('canvas');
          const nativeW = offscreenVideo.videoWidth || targetWidth;
          const nativeH = offscreenVideo.videoHeight || targetHeight;
          canvas.width = nativeW;
          canvas.height = nativeH;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(offscreenVideo, 0, 0, nativeW, nativeH);
            const rawDataUrl = canvas.toDataURL('image/jpeg', 0.98);
            const payload: FreezeFramePayload = {
              id: `snap-${Date.now()}`,
              feedType,
              dataUrl: rawDataUrl,
              originalWidth: nativeW,
              originalHeight: nativeH,
              capturedBy: {
                id: socket.id || 'clinic-pc',
                name: participantName,
                role,
              },
              timestamp: Date.now(),
            };
            socket.emit('snapshot-captured', payload);
          }
        });
      }
    },
    [socket, role, participantName, webcamStream, intraoralStream]
  );

  // Send stroke to peers (DataChannel + Socket.io fallback)
  const broadcastStroke = useCallback(
    (stroke: TelestrationStroke) => {
      if (socket) socket.emit('telestration-stroke', stroke);
      dataChannels.current.forEach((dc) => {
        if (dc.readyState === 'open') {
          dc.send(JSON.stringify({ type: 'stroke', stroke }));
        }
      });
    },
    [socket]
  );

  const broadcastClear = useCallback(() => {
    if (socket) socket.emit('telestration-clear', {});
    dataChannels.current.forEach((dc) => {
      if (dc.readyState === 'open') {
        dc.send(JSON.stringify({ type: 'clear' }));
      }
    });
  }, [socket]);

  // Send chat message
  const sendChatMessage = useCallback(
    (text: string) => {
      if (socket && text.trim()) {
        socket.emit('chat-message', { text: text.trim() });
      }
    },
    [socket]
  );

  // Send low-bandwidth tier change
  const broadcastTier = useCallback(
    (tier: LowBandwidthTier) => {
      if (socket) socket.emit('low-bandwidth-state', { tier });
    },
    [socket]
  );

  return {
    socket,
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
    isMobileBackgrounded,
    iceConnectionState,
  };
}
