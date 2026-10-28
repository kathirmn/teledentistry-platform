'use client';

import React, { useState } from 'react';
import {
  VideoFeedType,
  ParticipantRole,
  TelestrationStroke,
  NetworkHealthStats,
} from '@/lib/webrtc-types';
import { VideoViewport } from './VideoViewport';
import { useFootPedalHotkey } from '@/hooks/useFootPedalHotkey';

interface FeedSlot {
  id: string;
  type: VideoFeedType;
  label: string;
  stream: MediaStream | null;
  resolutionText?: string;
  isPausedForBandwidth?: boolean;
  isPausedByOS?: boolean;
}

interface MultiFeedDashboardProps {
  currentUserRole: ParticipantRole;
  currentUserId: string;
  currentUserName: string;
  webcamStream: MediaStream | null;
  intraoralStream: MediaStream | null;
  mobileStream: MediaStream | null;
  seniorStream: MediaStream | null;
  onBroadcastStroke: (stroke: TelestrationStroke) => void;
  externalStrokes?: TelestrationStroke[];
  onTriggerSnapshot: (feedType: VideoFeedType) => void;
  networkStats: NetworkHealthStats;
  isMobileBackgrounded?: boolean;
}

export function MultiFeedDashboard({
  currentUserRole,
  currentUserId,
  currentUserName,
  webcamStream,
  intraoralStream,
  mobileStream,
  seniorStream,
  onBroadcastStroke,
  externalStrokes = [],
  onTriggerSnapshot,
  networkStats,
  isMobileBackgrounded = false,
}: MultiFeedDashboardProps) {
  // Focus + Carousel layout state
  // Default primary view is 'intraoral' for dental priority
  const [primaryFeedType, setPrimaryFeedType] = useState<VideoFeedType>('intraoral');

  // Activate hands-free Foot Pedal (Spacebar) to trigger snapshot of primary feed
  useFootPedalHotkey({
    onTriggerSnapshot: () => {
      console.log('[Dashboard] Foot pedal triggered snapshot of primary feed:', primaryFeedType);
      onTriggerSnapshot(primaryFeedType);
    },
    enabled: true,
  });

  // Construct available video feeds list
  const isCriticalTier = networkStats.activeTier === 'critical';

  const feeds: FeedSlot[] = [
    {
      id: 'intraoral',
      type: 'intraoral',
      label: 'USB Intraoral Camera',
      stream: intraoralStream,
      resolutionText: isCriticalTier ? '720p @ 10fps' : '1080p @ 20fps',
      isPausedForBandwidth: false, // Intraoral is NEVER paused
      isPausedByOS: false,
    },
    {
      id: 'webcam',
      type: 'webcam',
      label: 'Clinician / Face Webcam',
      stream: webcamStream,
      resolutionText: isCriticalTier ? '240p @ 5fps' : '720p @ 15fps',
      isPausedForBandwidth: false,
      isPausedByOS: false,
    },
    {
      id: 'mobile',
      type: 'mobile',
      label: 'Mobile Companion (Over-The-Shoulder)',
      stream: mobileStream,
      resolutionText: isCriticalTier ? 'Paused (BW)' : isMobileBackgrounded ? 'Backgrounded' : '720p @ 20fps',
      isPausedForBandwidth: isCriticalTier, // Paused in critical tier to protect rural uplink
      isPausedByOS: isMobileBackgrounded,
    },
    {
      id: 'senior-cam',
      type: 'senior-cam',
      label: 'Senior Specialist Feed',
      stream: seniorStream,
      resolutionText: '720p @ 20fps',
      isPausedForBandwidth: false,
      isPausedByOS: false,
    },
  ];

  // Identify primary feed and secondary carousel feeds
  const primaryFeed = feeds.find((f) => f.type === primaryFeedType) || feeds[0];
  const carouselFeeds = feeds.filter((f) => f.type !== primaryFeed.type);

  const handleSwapFocus = (type: VideoFeedType) => {
    setPrimaryFeedType(type);
  };

  return (
    <div className="flex-1 flex flex-col lg:flex-row gap-3 p-3 bg-clinical-dark overflow-hidden">
      {/* Primary High-Magnification Viewport (Center / Main) - Static DOM Slot */}
      <div className="flex-1 flex flex-col min-h-0 bg-slate-950/60 rounded-xl overflow-hidden border border-slate-800 shadow-inner">
        <VideoViewport
          key="static-primary-viewport"
          feedType={primaryFeed.type}
          label={primaryFeed.label}
          stream={primaryFeed.stream}
          isPrimary={true}
          currentUserRole={currentUserRole}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          onBroadcastStroke={onBroadcastStroke}
          externalStrokes={externalStrokes}
          resolutionText={primaryFeed.resolutionText}
          isPausedForBandwidth={primaryFeed.isPausedForBandwidth}
          isPausedByOS={primaryFeed.isPausedByOS}
        />
      </div>

      {/* Side Carousel Viewports (Webcam, Mobile, Senior Doctor) - Static DOM Slots */}
      <div className="lg:w-80 xl:w-96 flex flex-row lg:flex-col gap-2.5 overflow-x-auto lg:overflow-y-auto shrink-0 pb-1 lg:pb-0">
        <div className="hidden lg:flex items-center justify-between px-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
          <span>Secondary Feeds</span>
          <span className="text-[10px] text-cyan-400 font-normal">Click to focus</span>
        </div>

        {carouselFeeds.map((feed, index) => (
          <div key={`static-carousel-slot-${index}`} className="min-w-[200px] sm:min-w-[240px] lg:min-w-0">
            <VideoViewport
              feedType={feed.type}
              label={feed.label}
              stream={feed.stream}
              isPrimary={false}
              currentUserRole={currentUserRole}
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              onSwapFocus={() => handleSwapFocus(feed.type)}
              onBroadcastStroke={onBroadcastStroke}
              externalStrokes={externalStrokes}
              resolutionText={feed.resolutionText}
              isPausedForBandwidth={feed.isPausedForBandwidth}
              isPausedByOS={feed.isPausedByOS}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
