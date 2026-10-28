'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  FreezeFramePayload,
  TelestrationStroke,
  DentalBadge,
  NormalizedPoint,
  ParticipantRole,
} from '@/lib/webrtc-types';
import { ToothBadgeTool } from './ToothBadgeTool';
import { ToothInfo, DENTAL_TEETH } from '@/lib/dental-constants';
import {
  Pen,
  MoveRight,
  Circle,
  Square,
  Tag,
  Type,
  RotateCcw,
  Trash2,
  Save,
  X,
  Sparkles,
} from 'lucide-react';

interface FreezeAnnotateStudioProps {
  snapshot: FreezeFramePayload;
  currentUserRole: ParticipantRole;
  currentUserId: string;
  currentUserName: string;
  onClose: () => void;
  onSaveToGallery: (annotatedSnapshot: FreezeFramePayload) => void;
  onBroadcastAnnotationUpdate?: (update: {
    snapshotId: string;
    strokes: TelestrationStroke[];
    badges: DentalBadge[];
  }) => void;
  externalUpdate?: {
    snapshotId: string;
    strokes: TelestrationStroke[];
    badges: DentalBadge[];
  } | null;
}

export function FreezeAnnotateStudio({
  snapshot,
  currentUserRole,
  currentUserId,
  currentUserName,
  onClose,
  onSaveToGallery,
  onBroadcastAnnotationUpdate,
  externalUpdate,
}: FreezeAnnotateStudioProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  const [activeTool, setActiveTool] = useState<
    'pen' | 'arrow' | 'circle' | 'rectangle' | 'badge' | 'text'
  >('arrow');
  const [activeColor, setActiveColor] = useState<string>('#06b6d4'); // Medical cyan
  const [strokeWidth, setStrokeWidth] = useState<number>(3);
  const [strokes, setStrokes] = useState<TelestrationStroke[]>(snapshot.annotations?.strokes || []);
  const [badges, setBadges] = useState<DentalBadge[]>(snapshot.annotations?.badges || []);

  // Tooth badge tool state
  const [isBadgePickerOpen, setIsBadgePickerOpen] = useState(false);
  const [badgeSystem, setBadgeSystem] = useState<'FDI' | 'Universal'>('FDI');
  const [selectedTooth, setSelectedTooth] = useState<ToothInfo | null>(DENTAL_TEETH[4]); // default #14
  const [selectedTag, setSelectedTag] = useState<string>('Caries / Decay');

  // Drawing state
  const isDrawingRef = useRef(false);
  const startPointRef = useRef<NormalizedPoint | null>(null);
  const currentPointsRef = useRef<NormalizedPoint[]>([]);

  // Text input prompt state
  const [textPromptPos, setTextPromptPos] = useState<NormalizedPoint | null>(null);
  const [textValue, setTextValue] = useState('');

  // Handle external incoming updates from peer
  useEffect(() => {
    if (externalUpdate && externalUpdate.snapshotId === snapshot.id) {
      setStrokes(externalUpdate.strokes);
      setBadges(externalUpdate.badges);
    }
  }, [externalUpdate, snapshot.id]);

  // Synchronize canvas dimensions with image container
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;

    const rect = img.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Render strokes
    strokes.forEach((stroke) => {
      if (stroke.points.length < 1) return;
      ctx.save();
      ctx.strokeStyle = stroke.color;
      ctx.fillStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (stroke.tool === 'pen') {
        ctx.beginPath();
        const p0 = stroke.points[0];
        ctx.moveTo(p0.x * canvas.width, p0.y * canvas.height);
        for (let i = 1; i < stroke.points.length; i++) {
          const p = stroke.points[i];
          ctx.lineTo(p.x * canvas.width, p.y * canvas.height);
        }
        ctx.stroke();
      } else if (stroke.tool === 'arrow') {
        const from = stroke.points[0];
        const to = stroke.points[stroke.points.length - 1];
        const fromX = from.x * canvas.width;
        const fromY = from.y * canvas.height;
        const toX = to.x * canvas.width;
        const toY = to.y * canvas.height;

        // Draw line
        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        ctx.lineTo(toX, toY);
        ctx.stroke();

        // Draw arrowhead
        const angle = Math.atan2(toY - fromY, toX - fromX);
        const headLen = 14;
        ctx.beginPath();
        ctx.moveTo(toX, toY);
        ctx.lineTo(
          toX - headLen * Math.cos(angle - Math.PI / 6),
          toY - headLen * Math.sin(angle - Math.PI / 6)
        );
        ctx.lineTo(
          toX - headLen * Math.cos(angle + Math.PI / 6),
          toY - headLen * Math.sin(angle + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fill();
      } else if (stroke.tool === 'circle') {
        const p1 = stroke.points[0];
        const p2 = stroke.points[stroke.points.length - 1];
        const x1 = p1.x * canvas.width;
        const y1 = p1.y * canvas.height;
        const x2 = p2.x * canvas.width;
        const y2 = p2.y * canvas.height;
        const rx = Math.abs(x2 - x1) / 2;
        const ry = Math.abs(y2 - y1) / 2;
        const cx = Math.min(x1, x2) + rx;
        const cy = Math.min(y1, y2) + ry;

        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (stroke.tool === 'rectangle') {
        const p1 = stroke.points[0];
        const p2 = stroke.points[stroke.points.length - 1];
        const x = Math.min(p1.x, p2.x) * canvas.width;
        const y = Math.min(p1.y, p2.y) * canvas.height;
        const w = Math.abs(p2.x - p1.x) * canvas.width;
        const h = Math.abs(p2.y - p1.y) * canvas.height;
        ctx.strokeRect(x, y, w, h);
      } else if (stroke.tool === 'text' && stroke.text) {
        const p = stroke.points[0];
        ctx.font = 'bold 14px sans-serif';
        ctx.shadowColor = 'black';
        ctx.shadowBlur = 4;
        ctx.fillText(stroke.text, p.x * canvas.width, p.y * canvas.height);
      }

      ctx.restore();
    });

    // Render Dental Badges
    badges.forEach((b) => {
      const bx = b.position.x * canvas.width;
      const by = b.position.y * canvas.height;

      ctx.save();
      // Badge Pin Circle
      ctx.beginPath();
      ctx.arc(bx, by, 12, 0, Math.PI * 2);
      ctx.fillStyle = b.color;
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 6;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();

      // Number text
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.toothNumber, bx, by);

      // Condition Tag label below
      if (b.conditionTag) {
        ctx.font = 'bold 9px sans-serif';
        const tagWidth = ctx.measureText(b.conditionTag).width + 8;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fillRect(bx - tagWidth / 2, by + 16, tagWidth, 14);
        ctx.fillStyle = b.color;
        ctx.fillText(b.conditionTag, bx, by + 23);
      }
      ctx.restore();
    });
  }, [strokes, badges]);

  useEffect(() => {
    redrawCanvas();
    window.addEventListener('resize', redrawCanvas);
    return () => window.removeEventListener('resize', redrawCanvas);
  }, [redrawCanvas]);

  const emitUpdate = (newStrokes: TelestrationStroke[], newBadges: DentalBadge[]) => {
    onBroadcastAnnotationUpdate?.({
      snapshotId: snapshot.id,
      strokes: newStrokes,
      badges: newBadges,
    });
  };

  // Pointer interactions
  const handlePointerDown = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    if (activeTool === 'badge') {
      const newBadge: DentalBadge = {
        id: `badge-${Date.now()}`,
        toothNumber: badgeSystem === 'FDI' ? selectedTooth?.fdi || '14' : `#${selectedTooth?.universal || '5'}`,
        system: badgeSystem,
        conditionTag: selectedTag,
        position: { x: nx, y: ny },
        color: activeColor,
      };
      const updated = [...badges, newBadge];
      setBadges(updated);
      emitUpdate(strokes, updated);
      return;
    }

    if (activeTool === 'text') {
      setTextPromptPos({ x: nx, y: ny });
      return;
    }

    isDrawingRef.current = true;
    startPointRef.current = { x: nx, y: ny };
    currentPointsRef.current = [{ x: nx, y: ny }];
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDrawingRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    if (activeTool === 'pen') {
      currentPointsRef.current.push({ x: nx, y: ny });
    } else {
      // Shape tools: update endpoint
      currentPointsRef.current = [startPointRef.current!, { x: nx, y: ny }];
    }

    // Temporary live redraw
    redrawCanvas();
    const ctx = canvas.getContext('2d');
    if (ctx && currentPointsRef.current.length > 1) {
      ctx.save();
      ctx.strokeStyle = activeColor;
      ctx.lineWidth = strokeWidth;
      ctx.beginPath();
      ctx.moveTo(
        currentPointsRef.current[0].x * canvas.width,
        currentPointsRef.current[0].y * canvas.height
      );
      ctx.lineTo(
        currentPointsRef.current[currentPointsRef.current.length - 1].x * canvas.width,
        currentPointsRef.current[currentPointsRef.current.length - 1].y * canvas.height
      );
      ctx.stroke();
      ctx.restore();
    }
  };

  const handlePointerUp = () => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;

    if (currentPointsRef.current.length > 0) {
      const newStroke: TelestrationStroke = {
        id: `stroke-${Date.now()}`,
        tool: activeTool,
        color: activeColor,
        width: strokeWidth,
        points: [...currentPointsRef.current],
        feedType: snapshot.feedType,
        authorId: currentUserId,
        authorName: currentUserName,
        authorRole: currentUserRole,
        timestamp: Date.now(),
      };
      const updated = [...strokes, newStroke];
      setStrokes(updated);
      emitUpdate(updated, badges);
    }
    currentPointsRef.current = [];
  };

  const handleAddText = () => {
    if (textPromptPos && textValue.trim()) {
      const newStroke: TelestrationStroke = {
        id: `text-${Date.now()}`,
        tool: 'text',
        color: activeColor,
        width: strokeWidth,
        points: [textPromptPos],
        text: textValue.trim(),
        feedType: snapshot.feedType,
        authorId: currentUserId,
        authorName: currentUserName,
        authorRole: currentUserRole,
        timestamp: Date.now(),
      };
      const updated = [...strokes, newStroke];
      setStrokes(updated);
      emitUpdate(updated, badges);
      setTextPromptPos(null);
      setTextValue('');
    }
  };

  const handleUndo = () => {
    if (strokes.length > 0) {
      const updated = strokes.slice(0, -1);
      setStrokes(updated);
      emitUpdate(updated, badges);
    } else if (badges.length > 0) {
      const updated = badges.slice(0, -1);
      setBadges(updated);
      emitUpdate(strokes, updated);
    }
  };

  const handleClearAll = () => {
    setStrokes([]);
    setBadges([]);
    emitUpdate([], []);
  };

  // Save annotated frame to gallery
  const handleSave = () => {
    // Generate combined composite image from snapshot + annotations
    const canvas = document.createElement('canvas');
    canvas.width = snapshot.originalWidth || 1920;
    canvas.height = snapshot.originalHeight || 1080;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const baseImg = new Image();
    baseImg.src = snapshot.dataUrl;
    baseImg.onload = () => {
      ctx.drawImage(baseImg, 0, 0, canvas.width, canvas.height);

      // Draw strokes onto composite canvas
      strokes.forEach((stroke) => {
        ctx.save();
        ctx.strokeStyle = stroke.color;
        ctx.fillStyle = stroke.color;
        ctx.lineWidth = stroke.width * (canvas.width / 800);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (stroke.tool === 'arrow') {
          const from = stroke.points[0];
          const to = stroke.points[stroke.points.length - 1];
          const fx = from.x * canvas.width;
          const fy = from.y * canvas.height;
          const tx = to.x * canvas.width;
          const ty = to.y * canvas.height;
          ctx.beginPath();
          ctx.moveTo(fx, fy);
          ctx.lineTo(tx, ty);
          ctx.stroke();

          const angle = Math.atan2(ty - fy, tx - fx);
          const headLen = 22;
          ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.lineTo(tx - headLen * Math.cos(angle - Math.PI / 6), ty - headLen * Math.sin(angle - Math.PI / 6));
          ctx.lineTo(tx - headLen * Math.cos(angle + Math.PI / 6), ty - headLen * Math.sin(angle + Math.PI / 6));
          ctx.closePath();
          ctx.fill();
        } else if (stroke.tool === 'pen') {
          ctx.beginPath();
          ctx.moveTo(stroke.points[0].x * canvas.width, stroke.points[0].y * canvas.height);
          for (let i = 1; i < stroke.points.length; i++) {
            ctx.lineTo(stroke.points[i].x * canvas.width, stroke.points[i].y * canvas.height);
          }
          ctx.stroke();
        }
        ctx.restore();
      });

      // Draw badges
      badges.forEach((b) => {
        const bx = b.position.x * canvas.width;
        const by = b.position.y * canvas.height;
        ctx.save();
        ctx.beginPath();
        ctx.arc(bx, by, 20, 0, Math.PI * 2);
        ctx.fillStyle = b.color;
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(b.toothNumber, bx, by);
        ctx.restore();
      });

      const annotatedDataUrl = canvas.toDataURL('image/jpeg', 0.95);
      const updatedSnapshot: FreezeFramePayload = {
        ...snapshot,
        dataUrl: annotatedDataUrl,
        annotations: {
          strokes,
          badges,
        },
      };

      onSaveToGallery(updatedSnapshot);
      onClose();
    };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-xl p-4 sm:p-6 animate-fadeIn">
      <div
        ref={containerRef}
        className="relative flex flex-col w-full max-w-6xl h-full max-h-[92vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Top Header & Toolbar */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-950 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-cyan-400 animate-pulse" />
            <h2 className="text-sm font-bold text-white tracking-wide uppercase">
              Freeze & Annotate Studio — {snapshot.feedType}
            </h2>
            <span className="text-xs text-slate-400 font-mono">
              ({snapshot.originalWidth}x{snapshot.originalHeight})
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs transition shadow-md"
            >
              <Save className="w-4 h-4" /> Save to Case Gallery
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Studio Center Area with strict touch-action: none for Apple Pencil & iPadOS */}
        <div className="relative flex-1 flex items-center justify-center overflow-hidden bg-black p-2 touch-none" style={{ touchAction: 'none' }}>
          {/* Base snapshot image */}
          <img
            ref={imageRef}
            src={snapshot.dataUrl}
            alt="Intraoral Freeze Snapshot"
            onLoad={redrawCanvas}
            className="max-h-full max-w-full object-contain rounded-lg select-none pointer-events-none"
          />

          {/* Interactive Annotation Canvas */}
          <canvas
            ref={canvasRef}
            style={{ touchAction: 'none' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className="absolute inset-0 m-auto cursor-crosshair z-10 touch-none"
          />

          {/* Tooth Badge Picker Popup */}
          {isBadgePickerOpen && (
            <div className="absolute top-4 left-4 z-30">
              <ToothBadgeTool
                system={badgeSystem}
                selectedTooth={selectedTooth}
                selectedTag={selectedTag}
                onSelectTooth={(t) => setSelectedTooth(t)}
                onSelectTag={(tag) => setSelectedTag(tag)}
                onToggleSystem={() => setBadgeSystem((s) => (s === 'FDI' ? 'Universal' : 'FDI'))}
              />
            </div>
          )}

          {/* Text Input Prompt */}
          {textPromptPos && (
            <div
              className="absolute z-30 bg-slate-900 border border-slate-700 p-2 rounded-lg shadow-xl flex gap-1.5"
              style={{
                left: `${textPromptPos.x * 100}%`,
                top: `${textPromptPos.y * 100}%`,
              }}
            >
              <input
                type="text"
                autoFocus
                placeholder="Enter clinical note..."
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddText()}
                className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-cyan-500"
              />
              <button
                onClick={handleAddText}
                className="px-2 py-1 bg-cyan-600 text-white rounded text-xs font-semibold"
              >
                Add
              </button>
            </div>
          )}
        </div>

        {/* Bottom Annotation Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-slate-950 border-t border-slate-800 text-xs">
          {/* Tools Selector */}
          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
            <button
              onClick={() => {
                setActiveTool('arrow');
                setIsBadgePickerOpen(false);
              }}
              title="Pointer Arrow"
              className={`p-1.5 rounded transition ${
                activeTool === 'arrow' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <MoveRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                setActiveTool('pen');
                setIsBadgePickerOpen(false);
              }}
              title="Freehand Pen"
              className={`p-1.5 rounded transition ${
                activeTool === 'pen' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Pen className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                setActiveTool('circle');
                setIsBadgePickerOpen(false);
              }}
              title="Circle"
              className={`p-1.5 rounded transition ${
                activeTool === 'circle' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Circle className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                setActiveTool('rectangle');
                setIsBadgePickerOpen(false);
              }}
              title="Rectangle"
              className={`p-1.5 rounded transition ${
                activeTool === 'rectangle' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Square className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                setActiveTool('badge');
                setIsBadgePickerOpen(!isBadgePickerOpen);
              }}
              title="Dental Tooth Badge"
              className={`flex items-center gap-1 px-2 py-1.5 rounded transition ${
                activeTool === 'badge' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Tag className="w-4 h-4" />
              <span className="font-mono font-bold text-[11px]">
                {badgeSystem === 'FDI' ? selectedTooth?.fdi || '14' : `#${selectedTooth?.universal || '5'}`}
              </span>
            </button>
            <button
              onClick={() => {
                setActiveTool('text');
                setIsBadgePickerOpen(false);
              }}
              title="Text Callout"
              className={`p-1.5 rounded transition ${
                activeTool === 'text' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Type className="w-4 h-4" />
            </button>
          </div>

          {/* Color Palette */}
          <div className="flex items-center gap-1.5">
            {['#06b6d4', '#ef4444', '#f59e0b', '#10b981', '#ffffff'].map((c) => (
              <button
                key={c}
                onClick={() => setActiveColor(c)}
                style={{ backgroundColor: c }}
                className={`w-5 h-5 rounded-full transition ${
                  activeColor === c ? 'ring-2 ring-white scale-110' : 'opacity-80 hover:opacity-100'
                }`}
              />
            ))}
          </div>

          {/* Stroke Width Slider */}
          <div className="flex items-center gap-2 text-slate-400">
            <span className="text-[11px]">Thickness:</span>
            <input
              type="range"
              min="1"
              max="8"
              value={strokeWidth}
              onChange={(e) => setStrokeWidth(parseInt(e.target.value, 10))}
              className="w-16 accent-cyan-500 cursor-pointer"
            />
          </div>

          {/* Actions: Undo & Clear */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleUndo}
              title="Undo last stroke"
              className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg transition border border-slate-800"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Undo
            </button>
            <button
              onClick={handleClearAll}
              title="Clear all annotations"
              className="flex items-center gap-1 px-2.5 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 rounded-lg transition border border-rose-900/40"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
