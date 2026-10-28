'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  NormalizedPoint,
  TelestrationStroke,
  VideoFeedType,
  ParticipantRole,
} from '@/lib/webrtc-types';
import {
  normalizeCoordinates,
  denormalizeCoordinates,
  calculateRenderedVideoBox,
} from '@/lib/coordinate-utils';

interface LiveTelestratorProps {
  feedType: VideoFeedType;
  videoRef: React.RefObject<HTMLVideoElement>;
  containerRef: React.RefObject<HTMLDivElement>;
  isMirrored?: boolean;
  canDraw?: boolean;
  currentUserRole: ParticipantRole;
  currentUserId: string;
  currentUserName: string;
  onBroadcastStroke: (stroke: TelestrationStroke) => void;
  externalStrokes?: TelestrationStroke[];
}

interface ActiveStroke {
  points: NormalizedPoint[];
  color: string;
  width: number;
  createdAt: number;
}

export function LiveTelestrator({
  feedType,
  videoRef,
  containerRef,
  isMirrored = false,
  canDraw = true,
  currentUserRole,
  currentUserId,
  currentUserName,
  onBroadcastStroke,
  externalStrokes = [],
}: LiveTelestratorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const currentPointsRef = useRef<NormalizedPoint[]>([]);
  const [fadingStrokes, setFadingStrokes] = useState<ActiveStroke[]>([]);

  // Update canvas size to match container
  const resizeCanvas = useCallback(() => {
    if (!canvasRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    canvasRef.current.width = rect.width;
    canvasRef.current.height = rect.height;
  }, [containerRef]);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [resizeCanvas]);

  // Merge incoming external strokes into fading strokes
  useEffect(() => {
    if (externalStrokes.length > 0) {
      const latest = externalStrokes[externalStrokes.length - 1];
      if (latest && latest.feedType === feedType) {
        setFadingStrokes((prev) => [
          ...prev,
          {
            points: latest.points,
            color: latest.color,
            width: latest.width,
            createdAt: Date.now(),
          },
        ]);
      }
    }
  }, [externalStrokes, feedType]);

  // Animation frame loop to render and fade out transient laser strokes
  useEffect(() => {
    let animId: number;

    const render = () => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video) {
        animId = requestAnimationFrame(render);
        return;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const now = Date.now();
      const FADE_DURATION = 2500; // 2.5 seconds persistence for telestration laser
      const videoWidth = video.videoWidth || canvas.width;
      const videoHeight = video.videoHeight || canvas.height;

      // Draw all active fading strokes
      setFadingStrokes((prev) => {
        const remaining = prev.filter((s) => now - s.createdAt < FADE_DURATION);

        remaining.forEach((stroke) => {
          if (stroke.points.length < 2) return;

          const age = now - stroke.createdAt;
          const opacity = Math.max(0, 1 - age / FADE_DURATION);

          ctx.save();
          ctx.beginPath();
          ctx.strokeStyle = stroke.color;
          ctx.lineWidth = stroke.width || 3.5;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.globalAlpha = opacity;
          ctx.shadowColor = stroke.color;
          ctx.shadowBlur = 8; // Glowing surgical laser effect

          const firstPoint = denormalizeCoordinates(
            stroke.points[0],
            canvas.width,
            canvas.height,
            videoWidth,
            videoHeight,
            isMirrored
          );
          ctx.moveTo(firstPoint.x, firstPoint.y);

          for (let i = 1; i < stroke.points.length; i++) {
            const p = denormalizeCoordinates(
              stroke.points[i],
              canvas.width,
              canvas.height,
              videoWidth,
              videoHeight,
              isMirrored
            );
            ctx.lineTo(p.x, p.y);
          }
          ctx.stroke();
          ctx.restore();
        });

        return remaining;
      });

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [videoRef, isMirrored]);

  // Pointer event handlers for drawing
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!canDraw || !containerRef.current || !videoRef.current) return;
    isDrawingRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    const rect = containerRef.current.getBoundingClientRect();
    const video = videoRef.current;
    const pt = normalizeCoordinates(
      e.clientX,
      e.clientY,
      rect,
      video.videoWidth,
      video.videoHeight,
      isMirrored
    );

    currentPointsRef.current = [pt];
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDrawingRef.current || !containerRef.current || !videoRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const video = videoRef.current;
    const pt = normalizeCoordinates(
      e.clientX,
      e.clientY,
      rect,
      video.videoWidth,
      video.videoHeight,
      isMirrored
    );

    currentPointsRef.current.push(pt);

    // Keep adding live stroke to fading list locally
    setFadingStrokes((prev) => [
      ...prev.slice(0, -1),
      {
        points: [...currentPointsRef.current],
        color: currentUserRole === 'senior-doctor' ? '#06b6d4' : '#f59e0b', // Cyan for senior, Amber for junior
        width: 4,
        createdAt: Date.now(),
      },
    ]);
  };

  const handlePointerUp = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;

    if (currentPointsRef.current.length > 1) {
      const stroke: TelestrationStroke = {
        id: `stroke-${Date.now()}`,
        tool: 'laser',
        color: currentUserRole === 'senior-doctor' ? '#06b6d4' : '#f59e0b',
        width: 4,
        points: [...currentPointsRef.current],
        feedType,
        authorId: currentUserId,
        authorName: currentUserName,
        authorRole: currentUserRole,
        timestamp: Date.now(),
        isTransient: true,
      };

      onBroadcastStroke(stroke);
    }
    currentPointsRef.current = [];
  };

  return (
    <canvas
      ref={canvasRef}
      style={{ touchAction: 'none' }}
      className={`absolute inset-0 z-20 touch-none pointer-events-${canDraw ? 'auto' : 'none'} ${
        canDraw ? 'cursor-crosshair' : ''
      }`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    />
  );
}
