'use client';

import React, { useRef, useState, useEffect } from 'react';
import { VideoFeedType, ParticipantRole, TelestrationStroke } from '@/lib/webrtc-types';
import { LiveTelestrator } from '../telestration/LiveTelestrator';
import { Maximize2, Minimize2, FlipHorizontal, Eye, VideoOff, Crosshair, AlertCircle } from 'lucide-react';

interface VideoViewportProps {
  stream: MediaStream | null;
  feedType: VideoFeedType;
  label: string;
  isPrimary?: boolean;
  currentUserRole: ParticipantRole;
  currentUserId: string;
  currentUserName: string;
  onSwapFocus?: () => void;
  onBroadcastStroke: (stroke: TelestrationStroke) => void;
  externalStrokes?: TelestrationStroke[];
  resolutionText?: string;
  isPausedForBandwidth?: boolean;
  isPausedByOS?: boolean;
}

export function VideoViewport({
  stream,
  feedType,
  label,
  isPrimary = false,
  currentUserRole,
  currentUserId,
  currentUserName,
  onSwapFocus,
  onBroadcastStroke,
  externalStrokes = [],
  resolutionText,
  isPausedForBandwidth = false,
  isPausedByOS = false,
}: VideoViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isMirrored, setIsMirrored] = useState(false);
  const [isTelestrateActive, setIsTelestrateActive] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isCssFullscreen, setIsCssFullscreen] = useState(false);

  // Dynamic track metrics directly from live WebRTC MediaStreamTrack settings (Item 6)
  const [trackMetrics, setTrackMetrics] = useState<{ width: number; height: number; fps: number }>({
    width: 0,
    height: 0,
    fps: 0,
  });

  // Attach MediaStream to static <video> DOM element (Item 1: Persistent DOM element)
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      if (stream && !isPausedForBandwidth) {
        if (video.srcObject !== stream) {
          video.srcObject = stream;
        }
        video.play().catch((e) => console.warn('Autoplay prevented or interrupted', e));
      } else {
        video.srcObject = null;
      }
    }
  }, [stream, isPausedForBandwidth]);

  // Read dynamic track resolution and framerate every 2 seconds (Item 6)
  useEffect(() => {
    if (!stream || isPausedForBandwidth) {
      setTrackMetrics({ width: 0, height: 0, fps: 0 });
      return;
    }

    const checkTrackSettings = () => {
      const track = stream.getVideoTracks()[0];
      if (track && track.readyState === 'live') {
        const settings = track.getSettings();
        const video = videoRef.current;
        const w = settings.width || video?.videoWidth || 0;
        const h = settings.height || video?.videoHeight || 0;
        const fps = settings.frameRate ? Math.round(settings.frameRate) : 20;

        setTrackMetrics((prev) => {
          if (prev.width !== w || prev.height !== h || prev.fps !== fps) {
            return { width: w, height: h, fps };
          }
          return prev;
        });
      }
    };

    checkTrackSettings();
    const interval = setInterval(checkTrackSettings, 2000);
    return () => clearInterval(interval);
  }, [stream, isPausedForBandwidth]);

  const handleLoadedMetadata = () => {
    if (videoRef.current && stream) {
      const track = stream.getVideoTracks()[0];
      const settings = track?.getSettings() || {};
      setTrackMetrics({
        width: settings.width || videoRef.current.videoWidth || 0,
        height: settings.height || videoRef.current.videoHeight || 0,
        fps: settings.frameRate ? Math.round(settings.frameRate) : 20,
      });
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (typeof containerRef.current.requestFullscreen === 'function') {
      if (!document.fullscreenElement) {
        containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {
          setIsCssFullscreen(true);
          setIsFullscreen(true);
        });
      } else {
        document.exitFullscreen().then(() => {
          setIsFullscreen(false);
          setIsCssFullscreen(false);
        }).catch(console.warn);
      }
    } else {
      // iPhone Safari does not support Element.requestFullscreen() on arbitrary divs
      const nextCss = !isCssFullscreen;
      setIsCssFullscreen(nextCss);
      setIsFullscreen(nextCss);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setIsFullscreen(false);
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const hasActiveStream = Boolean(stream && !isPausedForBandwidth && stream.getVideoTracks().length > 0);

  return (
    <div
      ref={containerRef}
      className={`relative group bg-clinical-dark border rounded-xl overflow-hidden flex items-center justify-center transition-all duration-200 select-none ${
        isCssFullscreen
          ? 'fixed inset-0 z-[9999] w-screen h-screen bg-black rounded-none border-none'
          : isPrimary
          ? 'w-full h-full border-clinical-accent/40 shadow-2xl'
          : 'w-full h-44 sm:h-52 border-slate-700/60 hover:border-clinical-accent/70 cursor-pointer'
      }`}
      onClick={!isPrimary && onSwapFocus ? onSwapFocus : undefined}
    >
      {/* 
        STATIC <video> ELEMENT (Item 1):
        Kept continuously mounted in the DOM. 
        Visibility is toggled via CSS classes rather than unmounting, avoiding black flash!
      */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        onLoadedMetadata={handleLoadedMetadata}
        className={`w-full h-full object-contain transition-transform duration-150 ${
          isMirrored ? 'scale-x-[-1]' : ''
        } ${hasActiveStream ? 'block' : 'hidden'}`}
      />

      {/* Clean INACTIVE Fallback State (Item 3 & Safari Background Detection) */}
      {!hasActiveStream && (
        <div className="flex flex-col items-center justify-center p-6 text-slate-400 text-center animate-fadeIn">
          {isPausedByOS ? (
            <>
              <AlertCircle className="w-10 h-10 mb-2 text-amber-400 animate-pulse" />
              <p className="text-xs font-bold uppercase tracking-wider text-amber-300">Paused by iOS (Backgrounded)</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Mobile clinician switched apps or locked phone. Stream will resume upon return.</p>
            </>
          ) : isPausedForBandwidth ? (
            <>
              <AlertCircle className="w-10 h-10 mb-2 opacity-50 text-amber-400 animate-pulse" />
              <p className="text-xs font-bold uppercase tracking-wider text-amber-300">Paused for Bandwidth</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Stream temporarily throttled to guarantee clinical audio</p>
            </>
          ) : (
            <>
              <VideoOff className="w-10 h-10 mb-2 opacity-40 text-slate-500" />
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label} Inactive</p>
              <p className="text-[10px] text-slate-500 mt-0.5">Camera disconnected or awaiting device stream</p>
            </>
          )}
        </div>
      )}

      {/* Live Telestrator Overlay (Active only when stream is active) */}
      {hasActiveStream && (
        <LiveTelestrator
          feedType={feedType}
          videoRef={videoRef}
          containerRef={containerRef}
          isMirrored={isMirrored}
          canDraw={isTelestrateActive}
          currentUserRole={currentUserRole}
          currentUserId={currentUserId}
          currentUserName={currentUserName}
          onBroadcastStroke={onBroadcastStroke}
          externalStrokes={externalStrokes}
        />
      )}

      {/* Top Overlay Badge with Dynamic Track Metrics (Item 6) */}
      <div className="absolute top-2 left-2 z-30 flex items-center gap-1.5 bg-slate-900/80 backdrop-blur-md px-2.5 py-1 rounded-md border border-slate-700/60 text-xs text-slate-200">
        <span className={`w-2 h-2 rounded-full ${hasActiveStream ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
        <span className="font-semibold tracking-wide">{label}</span>
        {trackMetrics.width > 0 ? (
          <span className="text-[10px] text-cyan-400 font-mono ml-1 font-bold">
            {trackMetrics.width}x{trackMetrics.height} @ {trackMetrics.fps}fps
          </span>
        ) : resolutionText ? (
          <span className="text-[10px] text-slate-400 font-mono ml-1">{resolutionText}</span>
        ) : null}
      </div>

      {/* Quick Controls overlay on hover or primary */}
      {hasActiveStream && (
        <div className="absolute top-2 right-2 z-30 flex items-center gap-1 bg-slate-900/80 backdrop-blur-md p-1 rounded-md border border-slate-700/60 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Mirror Flip Button (Minor Polish #1) */}
          <button
            title="Toggle Horizontal Mirror"
            onClick={(e) => {
              e.stopPropagation();
              setIsMirrored(!isMirrored);
            }}
            className={`p-1.5 rounded transition ${
              isMirrored ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-white'
            }`}
          >
            <FlipHorizontal className="w-3.5 h-3.5" />
          </button>

          {/* Telestrator Laser Toggle */}
          <button
            title={isTelestrateActive ? 'Telestration Laser: Active' : 'Telestration Laser: Off'}
            onClick={(e) => {
              e.stopPropagation();
              setIsTelestrateActive(!isTelestrateActive);
            }}
            className={`p-1.5 rounded transition ${
              isTelestrateActive ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Crosshair className="w-3.5 h-3.5" />
          </button>

          {/* Swap Focus button if thumbnail */}
          {!isPrimary && onSwapFocus && (
            <button
              title="Focus this camera"
              onClick={(e) => {
                e.stopPropagation();
                onSwapFocus();
              }}
              className="p-1.5 rounded text-slate-400 hover:text-white transition"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Fullscreen Button */}
          <button
            title="Toggle Fullscreen"
            onClick={(e) => {
              e.stopPropagation();
              toggleFullscreen();
            }}
            className="p-1.5 rounded text-slate-400 hover:text-white transition"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}

      {/* Bottom Swap Prompt for Thumbnails */}
      {!isPrimary && onSwapFocus && (
        <div className="absolute bottom-2 inset-x-2 z-30 text-center opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-[10px] bg-slate-900/90 text-cyan-400 px-2 py-0.5 rounded border border-cyan-500/30">
            Click to Make Primary View
          </span>
        </div>
      )}
    </div>
  );
}
