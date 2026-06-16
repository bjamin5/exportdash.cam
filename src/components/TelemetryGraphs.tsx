'use client';

import { useRef, useEffect, useMemo, useCallback, useState } from 'react';
import { SeiWithFrameIndex } from '@/lib/dashcam-mp4';
import {
  TelemetryDisplayConfig,
  TrimPoints,
  DEFAULT_TELEMETRY_DISPLAY_CONFIG,
} from '@/types/video';
import {
  seiMessagesToGraphPoints,
  computeGraphRanges,
  downsample,
  drawTelemetryCharts,
  getChartLayout,
  graphVisibilityFromConfig,
  setupCanvas,
  GRAPH_PADDING,
} from '@/lib/telemetry-graph-canvas';

interface TelemetryGraphsProps {
  allSeiMessages: SeiWithFrameIndex[];
  fps: number;
  duration: number;
  currentTime: number;
  isPlaying: boolean;
  playbackRate?: number;
  speedUnit: 'mph' | 'kmh';
  onSeek: (time: number) => void;
  onDraggingChange?: (isDragging: boolean) => void;
  trimPoints?: TrimPoints | null;
  isTrimming?: boolean;
  displayConfig?: TelemetryDisplayConfig;
  compact?: boolean;
}

export function TelemetryGraphs({
  allSeiMessages,
  fps,
  duration,
  currentTime,
  isPlaying,
  playbackRate = 1,
  speedUnit,
  onSeek,
  onDraggingChange,
  trimPoints,
  isTrimming = false,
  displayConfig = DEFAULT_TELEMETRY_DISPLAY_CONFIG,
  compact = false,
}: TelemetryGraphsProps) {
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [width, setWidth] = useState(0);

  const syncAnchorRef = useRef({ time: currentTime, at: performance.now() });
  const renderStateRef = useRef({
    width: 0,
    ranges: null as ReturnType<typeof computeGraphRanges> | null,
    drawPoints: [] as ReturnType<typeof seiMessagesToGraphPoints>,
    viewStart: 0,
    viewEnd: 0,
    viewDuration: 1,
    speedUnit: 'mph' as 'mph' | 'kmh',
    isPlaying: false,
    isDragging: false,
    playbackRate: 1,
    currentTime: 0,
    visibility: graphVisibilityFromConfig(displayConfig),
    compact: false,
    totalHeight: 0,
  });

  const visibility = useMemo(
    () => graphVisibilityFromConfig(displayConfig),
    [displayConfig]
  );

  const viewStart = isTrimming ? 0 : (trimPoints?.inPoint ?? 0);
  const viewEnd = isTrimming ? duration : (trimPoints?.outPoint ?? duration);
  const viewDuration = Math.max(viewEnd - viewStart, 0.001);

  const allPoints = useMemo(
    () => seiMessagesToGraphPoints(allSeiMessages, fps, speedUnit),
    [allSeiMessages, fps, speedUnit]
  );

  const visiblePoints = useMemo(
    () => allPoints.filter((p) => p.time >= viewStart && p.time <= viewEnd),
    [allPoints, viewStart, viewEnd]
  );

  const ranges = useMemo(() => computeGraphRanges(visiblePoints), [visiblePoints]);
  const { totalHeight } = useMemo(
    () => getChartLayout(compact, visibility),
    [compact, visibility]
  );

  useEffect(() => {
    syncAnchorRef.current = { time: currentTime, at: performance.now() };
  }, [currentTime]);

  const getTimeFromClientX = useCallback(
    (clientX: number): number => {
      if (!containerRef.current) return viewStart;
      const rect = containerRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const chartWidth = rect.width - GRAPH_PADDING.left - GRAPH_PADDING.right;
      const ratio = chartWidth > 0 ? (x - GRAPH_PADDING.left) / chartWidth : 0;
      return viewStart + Math.max(0, Math.min(1, ratio)) * viewDuration;
    },
    [viewStart, viewDuration]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(true);
      onDraggingChange?.(true);
      onSeek(getTimeFromClientX(e.clientX));
    },
    [getTimeFromClientX, onSeek, onDraggingChange]
  );

  useEffect(() => {
    if (!isDragging) return;
    const handleMove = (e: PointerEvent) => onSeek(getTimeFromClientX(e.clientX));
    const handleUp = () => {
      setIsDragging(false);
      onDraggingChange?.(false);
    };
    document.addEventListener('pointermove', handleMove);
    document.addEventListener('pointerup', handleUp);
    return () => {
      document.removeEventListener('pointermove', handleMove);
      document.removeEventListener('pointerup', handleUp);
    };
  }, [isDragging, getTimeFromClientX, onSeek, onDraggingChange]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) setWidth(entries[0].contentRect.width);
    });
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    renderStateRef.current = {
      width,
      ranges,
      drawPoints: downsample(visiblePoints, Math.max((width - GRAPH_PADDING.left - GRAPH_PADDING.right) * 2, 200)),
      viewStart,
      viewEnd,
      viewDuration,
      speedUnit,
      isPlaying,
      isDragging,
      playbackRate,
      currentTime,
      visibility,
      compact,
      totalHeight,
    };
  }, [
    width, ranges, visiblePoints, viewStart, viewEnd, viewDuration, speedUnit,
    isPlaying, isDragging, playbackRate, currentTime, visibility, compact, totalHeight,
  ]);

  useEffect(() => {
    const canvas = bgCanvasRef.current;
    if (!canvas || width <= 0 || totalHeight <= 0) return;
    const ctx = setupCanvas(canvas, width, totalHeight);
    if (!ctx) return;
    const chartWidth = width - GRAPH_PADDING.left - GRAPH_PADDING.right;
    const drawPoints = downsample(visiblePoints, Math.max(chartWidth * 2, 200));
    drawTelemetryCharts(ctx, width, drawPoints, ranges, viewDuration, speedUnit, {
      visibility,
      compact,
      showPlayhead: false,
      viewStart,
      viewEnd,
    });
  }, [width, visiblePoints, ranges, viewStart, viewEnd, viewDuration, speedUnit, visibility, compact, totalHeight]);

  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas || width <= 0 || totalHeight <= 0) return;
    setupCanvas(canvas, width, totalHeight);

    let frameId = 0;
    const renderOverlay = () => {
      const state = renderStateRef.current;
      const overlay = overlayCanvasRef.current;
      if (!overlay || state.width <= 0 || !state.ranges || state.totalHeight <= 0) {
        frameId = requestAnimationFrame(renderOverlay);
        return;
      }
      const ctx = overlay.getContext('2d');
      if (!ctx) {
        frameId = requestAnimationFrame(renderOverlay);
        return;
      }
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      let displayTime = state.currentTime;
      if (state.isPlaying && !state.isDragging) {
        const elapsed = (performance.now() - syncAnchorRef.current.at) / 1000;
        displayTime = Math.min(
          state.viewEnd,
          syncAnchorRef.current.time + elapsed * state.playbackRate
        );
      }

      drawTelemetryCharts(ctx, state.width, state.drawPoints, state.ranges, state.viewDuration, state.speedUnit, {
        visibility: state.visibility,
        compact: state.compact,
        showPlayhead: true,
        displayTime,
        viewStart: state.viewStart,
        viewEnd: state.viewEnd,
      });

      frameId = requestAnimationFrame(renderOverlay);
    };

    frameId = requestAnimationFrame(renderOverlay);
    return () => cancelAnimationFrame(frameId);
  }, [width, totalHeight]);

  if (duration <= 0 || allPoints.length === 0 || totalHeight <= 0) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className={`relative bg-black overflow-hidden select-none h-full ${
        isDragging ? 'cursor-grabbing' : 'cursor-pointer'
      }`}
      onPointerDown={handlePointerDown}
      role="slider"
      aria-label="Telemetry graphs"
      aria-valuemin={viewStart}
      aria-valuemax={viewEnd}
      aria-valuenow={currentTime}
    >
      <canvas ref={bgCanvasRef} className="block w-full" style={{ height: totalHeight }} />
      <canvas
        ref={overlayCanvasRef}
        className="absolute inset-0 block w-full pointer-events-none"
        style={{ height: totalHeight }}
      />
    </div>
  );
}