export type ParticipantRole = 'junior-dentist' | 'senior-doctor' | 'mobile-cam';

export type VideoFeedType = 'webcam' | 'intraoral' | 'mobile' | 'senior-cam';

export interface Participant {
  id: string;
  name: string;
  role: ParticipantRole;
  socketId: string;
  joinedAt: number;
}

export interface NormalizedPoint {
  x: number; // 0 to 1 relative to intrinsic video width
  y: number; // 0 to 1 relative to intrinsic video height
}

export type TelestrationTool = 'laser' | 'pen' | 'arrow' | 'circle' | 'rectangle' | 'badge' | 'text';

export interface DentalBadge {
  id: string;
  toothNumber: string; // e.g., '14' or '#19'
  system: 'FDI' | 'Universal';
  conditionTag?: string; // e.g. 'Caries', 'Prep Margin'
  position: NormalizedPoint;
  color: string;
}

export interface TelestrationStroke {
  id: string;
  tool: TelestrationTool;
  color: string;
  width: number; // normalized stroke weight or pixels
  points: NormalizedPoint[];
  text?: string;
  feedType: VideoFeedType;
  authorId: string;
  authorName: string;
  authorRole: ParticipantRole;
  timestamp: number;
  isTransient?: boolean; // If true, auto-fades (laser)
}

export interface FreezeFramePayload {
  id: string;
  feedType: VideoFeedType;
  dataUrl: string; // High-res image data
  originalWidth: number;
  originalHeight: number;
  capturedBy: {
    id: string;
    name: string;
    role: ParticipantRole;
  };
  timestamp: number;
  notes?: string;
  annotations?: {
    strokes: TelestrationStroke[];
    badges: DentalBadge[];
  };
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: ParticipantRole;
  text: string;
  timestamp: number;
  isSystem?: boolean;
}

export type LowBandwidthTier = 'optimal' | 'moderate' | 'critical';

export interface NetworkHealthStats {
  rttMs: number;
  packetLossPercent: number;
  currentUplinkKbps: number;
  activeTier: LowBandwidthTier;
  forcedLowBandwidth: boolean;
}

export interface SignalMessage {
  targetPeerId: string;
  senderPeerId: string;
  senderRole: ParticipantRole;
  signal: RTCSessionDescriptionInit | RTCIceCandidateInit | { type: string; payload?: unknown };
  streamType?: VideoFeedType;
}
