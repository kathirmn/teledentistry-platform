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
        // Add local audio track
        if (audioStream) {
          audioStream.getTracks().forEach((track) => pc.addTrack(track, audioStream));
        }

        // Add local video tracks
        if (webcamStream) {
          webcamStream.getTracks().forEach((track) => pc.addTrack(track, webcamStream));
        }
        if (intraoralStream) {
          intraoralStream.getTracks().forEach((track) => pc.addTrack(track, intraoralStream));
        }

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
          // Identify peer role directly from synchronized lookup map
          const peerRole = peerRolesRef.current.get(targetPeerId);
          let feedType: VideoFeedType = 'mobile';

          if (peerRole === 'mobile-cam') {
            feedType = 'mobile';
          } else if (peerRole === 'senior-doctor') {
            feedType = 'senior-cam';
          } else if (peerRole === 'junior-dentist') {
            // Junior dentist PC sends intraoral first, webcam second
            const existingFromPeer = Array.from(remoteFeeds.values()).filter((f) => f.peerId === targetPeerId);
            feedType = existingFromPeer.length === 0 ? 'intraoral' : 'webcam';
          } else {
            // Fallback: if user is junior-dentist, any unknown incoming video is mobile or senior
            feedType = role === 'junior-dentist' ? 'mobile' : 'senior-cam';
          }

          console.log(`[WebRTC ontrack] Incoming track from ${targetPeerId} (role: ${peerRole}) mapped to feedType: ${feedType}`);
          const feedKey = `${targetPeerId}-${track.id}`;
          const finalStream = incomingStream || new MediaStream([track]);

          setRemoteFeeds((prev) => {
            const next = new Map(prev);
            next.set(feedKey, { stream: finalStream, feedType, peerId: targetPeerId });
            return next;
          });
        }
      };

      return pc;
    },
    [socket, audioStream, webcamStream, intraoralStream, role, remoteFeeds.size]
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

  // Handle incoming WebRTC signals
  useEffect(() => {
    if (!socket) return;

    socket.on('signal', async ({ senderPeerId, senderRole, signal }) => {
      if (senderRole) {
        peerRolesRef.current.set(senderPeerId, senderRole);
      }
      let pc = peerConnections.current.get(senderPeerId);

      if (!pc) {
        pc = createPeerConnection(senderPeerId, false);
      }

      try {
        if ('sdp' in signal) {
          const desc = new RTCSessionDescription(signal as RTCSessionDescriptionInit);

          if (desc.type === 'offer') {
            if (pc.signalingState !== 'stable') {
              console.warn('[WebRTC PC] Offer collision in state:', pc.signalingState);
              if (senderRole === 'mobile-cam') {
                return; // PC is the offerer for mobile; ignore rogue offers
              }
              try {
                await pc.setLocalDescription({ type: 'rollback' });
              } catch (rbErr) {
                console.warn('[WebRTC PC] Rollback error:', rbErr);
              }
            }

            await pc.setRemoteDescription(desc);

            // Drain queued ICE candidates
            const queued = iceCandidatesQueue.current.get(senderPeerId) || [];
            for (const cand of queued) {
              await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(console.warn);
            }
            iceCandidatesQueue.current.delete(senderPeerId);

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('signal', {
              targetPeerId: senderPeerId,
              signal: answer,
            });
            console.log(`[WebRTC PC] Answered offer from ${senderPeerId}`);
          } else if (desc.type === 'answer') {
            if (pc.signalingState === 'have-local-offer') {
              await pc.setRemoteDescription(desc);

              // Drain queued ICE candidates
              const queued = iceCandidatesQueue.current.get(senderPeerId) || [];
              for (const cand of queued) {
                await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(console.warn);
              }
              iceCandidatesQueue.current.delete(senderPeerId);
              console.log(`[WebRTC PC] Remote answer accepted from ${senderPeerId}`);
            }
          }
        } else if ('candidate' in signal && signal.candidate) {
          if (pc.remoteDescription && pc.remoteDescription.type) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(signal as RTCIceCandidateInit));
            } catch (iceErr) {
              console.warn('[WebRTC PC] ICE candidate error:', iceErr);
            }
          } else {
            const queue = iceCandidatesQueue.current.get(senderPeerId) || [];
            queue.push(signal as RTCIceCandidateInit);
            iceCandidatesQueue.current.set(senderPeerId, queue);
          }
        }
      } catch (err) {
        console.error('[WebRTC PC] Signal handling error:', err);
      }
    });

    return () => {
      socket.off('signal');
    };
  }, [socket, createPeerConnection]);

  // Connect to newly joined peers
  useEffect(() => {
    if (!socket || !isConnected) return;

    participants.forEach(async (peer) => {
      // Record peer role immediately before creating connection!
      peerRolesRef.current.set(peer.socketId, peer.role);

      if (!peerConnections.current.has(peer.socketId)) {
        const pc = createPeerConnection(peer.socketId, true);
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('signal', {
            targetPeerId: peer.socketId,
            signal: offer,
          });
          console.log(`[WebRTC PC] Sent offer to peer ${peer.socketId} (${peer.role})`);
        } catch (offerErr) {
          console.error('[WebRTC PC] Error creating/setting offer:', offerErr);
        }
      }
    });
  }, [participants, socket, isConnected, createPeerConnection]);

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
  };
}
