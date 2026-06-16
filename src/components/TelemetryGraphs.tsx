'use client';

import { useRef, useEffect, useMemo, useCallback, useState } from 'react';
import { SeiWithFrameIndex } from '@/lib/dashcam-mp4';
import { TrimPoints } from '@/types/video';

interface TelemetryGraphsProps {
  allSeiMessages: SeiWithFrameIndex[];
  fps: number;
  duration: number;
  currentTime: number;
  speedUnit: 'mph' | 'kmh';
  onSeek: (time: number) => void;
  onDraggingChange?: (isDragging: boolean) => void;
  trimPoints?: TrimPoints | null;
  isTrimming?: boolean;
}

interface GraphPoint {
  time: number;
  longG: number;
  latG: number;
  speed: number;
}

const GRAVITY = 9.81;
const MPS_TO_MPH = 2.23694;
const MPS_TO_KMH = 3.6;

const CHART = {
  long: { height: 56, color: '#ef4444', label: 'long' },
  lat: { height: 48, color: '#22d3ee', label: 'lat' },
  speed: { height: 56, color: '#a855f7', label: 'speed' },
} as const;

const PADDING = { left: 52, right: 36, top: 6, bottom: 4 };

function downsample(points: GraphPoint[], maxPoints: number): GraphPoint[] {
  if (points.length <= maxPoints) return points;
  const step = points.length / maxPoints;
  const result: GraphPoint[] = [];
  for (let i = 0; i < maxPoints; i++) {
    result.push(points[Math.floor(i * step)]);
  }
  if (result[result.length - 1] !== points[points.length - 1]) {
    result.push(points[points.length - 1]);
  }
  return result;
}

function findPointAtTime(points: GraphPoint[], time: number): GraphPoint | null {
  if (points.length === 0) return null;
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (points[mid].time < time) lo = mid + 1;
    else hi = mid;
  }
  const idx = Math.max(0, lo - 1);
  const next = Math.min(points.length - 1, idx + 1);
  const a = points[idx];
  const b = points[next];
  if (a.time === b.time) return a;
  const t = (time - a.time) / (b.time - a.time);
  return {
    time,
    longG: a.longG + (b.longG - a.longG) * t,
    latG: a.latG + (b.latG - a.latG) * t,
    speed: a.speed + (b.speed - a.speed) * t,
  };
}

export function TelemetryGraphs({
  allSeiMessages,
  fps,
  duration,
  currentTime,
  speedUnit,
  onSeek,
  onDraggingChange,
  trimPoints,
  isTrimming = false,
}: TelemetryGraphsProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [width, setWidth] = useState(0);

  const viewStart = isTrimming ? 0 : (trimPoints?.inPoint ?? 0);
  const viewEnd = isTrimming ? duration : (trimPoints?.outPoint ?? duration);
  const viewDuration = Math.max(viewEnd - viewStart, 0.001);

  const allPoints = useMemo((): GraphPoint[] => {
    if (allSeiMessages.length === 0 || fps <= 0) return [];

    const speedScale = speedUnit === 'mph' ? MPS_TO_MPH : MPS_TO_KMH;

    return allSeiMessages.map((msg) => ({
      time: msg.frameIndex / fps,
      longG: (msg.sei.linear_acceleration_mps2_y ?? 0) / GRAVITY,
      latG: (msg.sei.linear_acceleration_mps2_x ?? 0) / GRAVITY,
      speed: (msg.sei.vehicle_speed_mps ?? 0) * speedScale,
    }));
  }, [allSeiMessages, fps, speedUnit]);

  const visiblePoints = useMemo(() => {
    return allPoints.filter((p) => p.time >= viewStart && p.time <= viewEnd);
  }, [allPoints, viewStart, viewEnd]);

  const ranges = useMemo(() => {
    const longValues = visiblePoints.map((p) => p.longG);
    const latValues = visiblePoints.map((p) => p.latG);
    const speedValues = visiblePoints.map((p) => p.speed);

    const longMax = Math.max(0.5, ...longValues.map(Math.abs), 0.3);
    const latMax = Math.max(0.5, ...latValues.map(Math.abs), 0.2);
    const speedMax = Math.max(10, ...speedValues, 40);

    return {
      long: { min: -longMax, max: longMax },
      lat: { min: -latMax, max: latMax },
      speed: { min: 0, max: Math.ceil(speedMax / 10) * 10 },
    };
  }, [visiblePoints]);

  const currentValues = useMemo(
    () => findPointAtTime(allPoints, currentTime),
    [allPoints, currentTime]
  );

  const totalHeight =
    CHART.long.height + CHART.lat.height + CHART.speed.height + PADDING.top + PADDING.bottom;

  const getTimeFromClientX = useCallback(
    (clientX: number): number => {
      if (!containerRef.current) return viewStart;
      const rect = containerRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const chartWidth = rect.width - PADDING.left - PADDING.right;
      const ratio = chartWidth > 0 ? (x - PADDING.left) / chartWidth : 0;
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

    const handleMove = (e: PointerEvent) => {
      onSeek(getTimeFromClientX(e.clientX));
    };

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
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = totalHeight * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${totalHeight}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, totalHeight);

    const chartWidth = width - PADDING.left - PADDING.right;
    const drawPoints = downsample(visiblePoints, Math.max(chartWidth * 2, 200));

    const timeToX = (time: number) =>
      PADDING.left + ((time - viewStart) / viewDuration) * chartWidth;

    const valueToY = (
      value: number,
      min: number,
      max: number,
      top: number,
      height: number
    ) => {
      const range = max - min || 1;
      const ratio = (value - min) / range;
      return top + height - ratio * height;
    };

    let yOffset = PADDING.top;

    const drawChartBackground = (top: number, height: number) => {
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(PADDING.left, top, chartWidth, height);
      ctx.strokeStyle = '#1f2937';
      ctx.lineWidth = 1;
      ctx.strokeRect(PADDING.left, top, chartWidth, height);
    };

    const drawZeroLine = (top: number, height: number, min: number, max: number) => {
      if (min >= 0 || max <= 0) return;
      const y = valueToY(0, min, max, top, height);
      ctx.strokeStyle = '#374151';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(PADDING.left, y);
      ctx.lineTo(PADDING.left + chartWidth, y);
      ctx.stroke();
      ctx.setLineDash([]);
    };

    const drawLine = (
      points: GraphPoint[],
      getValue: (p: GraphPoint) => number,
      min: number,
      max: number,
      top: number,
      height: number,
      color: string
    ) => {
      if (points.length < 2) return;

      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();

      points.forEach((p, i) => {
        const x = timeToX(p.time);
        const y = valueToY(getValue(p), min, max, top, height);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    };

    const drawFilledArea = (
      points: GraphPoint[],
      getValue: (p: GraphPoint) => number,
      min: number,
      max: number,
      top: number,
      height: number,
      color: string
    ) => {
      if (points.length < 2) return;

      const baseline = valueToY(min, min, max, top, height);

      ctx.beginPath();
      points.forEach((p, i) => {
        const x = timeToX(p.time);
        const y = valueToY(getValue(p), min, max, top, height);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.lineTo(timeToX(points[points.length - 1].time), baseline);
      ctx.lineTo(timeToX(points[0].time), baseline);
      ctx.closePath();

      ctx.fillStyle = color;
      ctx.fill();

      drawLine(points, getValue, min, max, top, height, CHART.speed.color);
    };

    const drawYLabels = (
      top: number,
      height: number,
      topLabel: string,
      bottomLabel: string,
      color: string
    ) => {
      ctx.font = '600 9px system-ui, sans-serif';
      ctx.fillStyle = color;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(topLabel, 6, top + 4);
      ctx.textBaseline = 'bottom';
      ctx.fillText(bottomLabel, 6, top + height - 4);
    };

    const drawRightScale = (
      top: number,
      height: number,
      min: number,
      max: number,
      format: (v: number) => string
    ) => {
      ctx.font = '500 8px system-ui, sans-serif';
      ctx.fillStyle = '#6b7280';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const mid = (min + max) / 2;
      [max, mid, min].forEach((v) => {
        const y = valueToY(v, min, max, top, height);
        ctx.fillText(format(v), width - 6, y);
      });
    };

    // Longitudinal G chart
    drawChartBackground(yOffset, CHART.long.height);
    drawYLabels(yOffset, CHART.long.height, 'ACCEL', 'BRAKE', CHART.long.color);
    drawZeroLine(yOffset, CHART.long.height, ranges.long.min, ranges.long.max);
    drawLine(
      drawPoints,
      (p) => p.longG,
      ranges.long.min,
      ranges.long.max,
      yOffset,
      CHART.long.height,
      CHART.long.color
    );
    drawRightScale(yOffset, CHART.long.height, ranges.long.min, ranges.long.max, (v) =>
      `${v >= 0 ? '+' : ''}${v.toFixed(1)}`
    );
    yOffset += CHART.long.height;

    // Lateral G chart
    drawChartBackground(yOffset, CHART.lat.height);
    drawYLabels(yOffset, CHART.lat.height, 'RIGHT', 'LEFT', CHART.lat.color);
    drawZeroLine(yOffset, CHART.lat.height, ranges.lat.min, ranges.lat.max);
    drawLine(
      drawPoints,
      (p) => p.latG,
      ranges.lat.min,
      ranges.lat.max,
      yOffset,
      CHART.lat.height,
      CHART.lat.color
    );
    drawRightScale(yOffset, CHART.lat.height, ranges.lat.min, ranges.lat.max, (v) =>
      `${v >= 0 ? '+' : ''}${v.toFixed(1)}`
    );
    yOffset += CHART.lat.height;

    // Speed chart
    drawChartBackground(yOffset, CHART.speed.height);
    drawYLabels(yOffset, CHART.speed.height, 'SPEED', '', CHART.speed.color);
    drawFilledArea(
      drawPoints,
      (p) => p.speed,
      ranges.speed.min,
      ranges.speed.max,
      yOffset,
      CHART.speed.height,
      'rgba(168, 85, 247, 0.35)'
    );
    drawRightScale(yOffset, CHART.speed.height, ranges.speed.min, ranges.speed.max, (v) =>
      String(Math.round(v))
    );

    // Playhead
    const clampedTime = Math.max(viewStart, Math.min(viewEnd, currentTime));
    const playheadX = timeToX(clampedTime);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(playheadX, PADDING.top);
    ctx.lineTo(playheadX, PADDING.top + CHART.long.height + CHART.lat.height + CHART.speed.height);
    ctx.stroke();

    // Playhead value badges
    if (currentValues) {
      const formatG = (g: number) => `${g >= 0 ? '+' : ''}${g.toFixed(2)}G`;
      const formatSpeed = (s: number) => `${Math.round(s)} ${speedUnit.toUpperCase()}`;

      const badges = [
        {
          y: PADDING.top + 10,
          text: formatG(currentValues.longG),
          color: CHART.long.color,
        },
        {
          y: PADDING.top + CHART.long.height + CHART.lat.height / 2,
          text: formatG(currentValues.latG),
          color: CHART.lat.color,
        },
        {
          y: PADDING.top + CHART.long.height + CHART.lat.height + CHART.speed.height / 2,
          text: formatSpeed(currentValues.speed),
          color: CHART.speed.color,
        },
      ];

      badges.forEach(({ y, text, color }) => {
        ctx.font = '600 9px system-ui, sans-serif';
        const textWidth = ctx.measureText(text).width;
        const padX = 5;
        const padY = 3;
        const boxW = textWidth + padX * 2;
        const boxH = 14;
        let boxX = playheadX + 6;
        if (boxX + boxW > width - 4) boxX = playheadX - boxW - 6;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.fillRect(boxX, y - boxH / 2, boxW, boxH);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.strokeRect(boxX, y - boxH / 2, boxW, boxH);
        ctx.fillStyle = color;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, boxX + padX, y);
      });

      // Playhead dots on each chart
      [
        { y: valueToY(currentValues.longG, ranges.long.min, ranges.long.max, PADDING.top, CHART.long.height), color: CHART.long.color },
        { y: valueToY(currentValues.latG, ranges.lat.min, ranges.lat.max, PADDING.top + CHART.long.height, CHART.lat.height), color: CHART.lat.color },
        { y: valueToY(currentValues.speed, ranges.speed.min, ranges.speed.max, PADDING.top + CHART.long.height + CHART.lat.height, CHART.speed.height), color: CHART.speed.color },
      ].forEach(({ y, color }) => {
        ctx.beginPath();
        ctx.arc(playheadX, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
      });
    }
  }, [
    width,
    totalHeight,
    visiblePoints,
    viewStart,
    viewDuration,
    currentTime,
    currentValues,
    ranges,
    speedUnit,
  ]);

  if (duration <= 0 || allPoints.length === 0) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className={`relative bg-black rounded-xl overflow-hidden select-none ${
        isDragging ? 'cursor-grabbing' : 'cursor-pointer'
      }`}
      onPointerDown={handlePointerDown}
      role="slider"
      aria-label="Telemetry graphs"
      aria-valuemin={viewStart}
      aria-valuemax={viewEnd}
      aria-valuenow={currentTime}
    >
      <canvas ref={canvasRef} className="block w-full" />
    </div>
  );
}