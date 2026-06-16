import { SeiWithFrameIndex } from '@/lib/dashcam-mp4';
import { TelemetryDisplayConfig } from '@/types/video';

export interface GraphPoint {
  time: number;
  longG: number;
  latG: number;
  speed: number;
}

export interface GraphRanges {
  long: { min: number; max: number };
  lat: { min: number; max: number };
  speed: { min: number; max: number };
}

export interface GraphVisibility {
  showLong: boolean;
  showLat: boolean;
  showSpeed: boolean;
}

const GRAVITY = 9.81;
const MPS_TO_MPH = 2.23694;
const MPS_TO_KMH = 3.6;

export const GRAPH_PADDING = { left: 52, right: 36, top: 6, bottom: 4 };

export function seiMessagesToGraphPoints(
  messages: SeiWithFrameIndex[],
  fps: number,
  speedUnit: 'mph' | 'kmh'
): GraphPoint[] {
  if (messages.length === 0 || fps <= 0) return [];
  const speedScale = speedUnit === 'mph' ? MPS_TO_MPH : MPS_TO_KMH;
  return messages.map((msg) => ({
    time: msg.frameIndex / fps,
    longG: (msg.sei.linear_acceleration_mps2_y ?? 0) / GRAVITY,
    latG: (msg.sei.linear_acceleration_mps2_x ?? 0) / GRAVITY,
    speed: (msg.sei.vehicle_speed_mps ?? 0) * speedScale,
  }));
}

export function computeGraphRanges(points: GraphPoint[]): GraphRanges {
  const longValues = points.map((p) => p.longG);
  const latValues = points.map((p) => p.latG);
  const speedValues = points.map((p) => p.speed);
  const longMax = Math.max(0.5, ...longValues.map(Math.abs), 0.3);
  const latMax = Math.max(0.5, ...latValues.map(Math.abs), 0.2);
  const speedMax = Math.max(10, ...speedValues, 40);
  return {
    long: { min: -longMax, max: longMax },
    lat: { min: -latMax, max: latMax },
    speed: { min: 0, max: Math.ceil(speedMax / 10) * 10 },
  };
}

export function downsample(points: GraphPoint[], maxPoints: number): GraphPoint[] {
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

export function findPointAtTime(points: GraphPoint[], time: number): GraphPoint | null {
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

export function graphVisibilityFromConfig(config: TelemetryDisplayConfig): GraphVisibility {
  return {
    showLong: config.showGraphLong,
    showLat: config.showGraphLat,
    showSpeed: config.showGraphSpeed,
  };
}

export function getChartLayout(compact: boolean, visibility: GraphVisibility) {
  const scale = compact ? 0.6 : 1;
  const charts: Array<{ key: keyof GraphVisibility; height: number; color: string; top: string; bottom: string }> = [];
  if (visibility.showLong) {
    charts.push({ key: 'showLong', height: Math.round(56 * scale), color: '#ef4444', top: 'ACCEL', bottom: 'BRAKE' });
  }
  if (visibility.showLat) {
    charts.push({ key: 'showLat', height: Math.round(48 * scale), color: '#22d3ee', top: 'RIGHT', bottom: 'LEFT' });
  }
  if (visibility.showSpeed) {
    charts.push({ key: 'showSpeed', height: Math.round(56 * scale), color: '#a855f7', top: 'SPEED', bottom: '' });
  }
  const chartsHeight = charts.reduce((sum, c) => sum + c.height, 0);
  const totalHeight = chartsHeight + GRAPH_PADDING.top + GRAPH_PADDING.bottom;
  return { charts, totalHeight, chartsHeight };
}

function valueToY(value: number, min: number, max: number, top: number, height: number): number {
  const range = max - min || 1;
  const ratio = (value - min) / range;
  return top + height - ratio * height;
}

export function setupCanvas(
  canvas: HTMLCanvasElement,
  width: number,
  height: number
): CanvasRenderingContext2D | null {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

interface DrawChartsOptions {
  visibility: GraphVisibility;
  compact?: boolean;
  showPlayhead?: boolean;
  displayTime?: number;
  viewStart: number;
  viewEnd: number;
}

export function drawTelemetryCharts(
  ctx: CanvasRenderingContext2D,
  width: number,
  drawPoints: GraphPoint[],
  ranges: GraphRanges,
  viewDuration: number,
  speedUnit: 'mph' | 'kmh',
  options: DrawChartsOptions
) {
  const { visibility, compact = false, showPlayhead = false, displayTime = 0, viewStart, viewEnd } = options;
  const { charts, totalHeight } = getChartLayout(compact, visibility);
  if (charts.length === 0) return;

  ctx.clearRect(0, 0, width, totalHeight);

  const chartWidth = width - GRAPH_PADDING.left - GRAPH_PADDING.right;
  const timeToX = (time: number) =>
    GRAPH_PADDING.left + ((time - viewStart) / viewDuration) * chartWidth;

  let yOffset = GRAPH_PADDING.top;
  const chartTops: Array<{ top: number; height: number; key: keyof GraphVisibility }> = [];

  const drawChartBackground = (top: number, height: number) => {
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(GRAPH_PADDING.left, top, chartWidth, height);
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 1;
    ctx.strokeRect(GRAPH_PADDING.left, top, chartWidth, height);
  };

  const drawZeroLine = (top: number, height: number, min: number, max: number) => {
    if (min >= 0 || max <= 0) return;
    const y = valueToY(0, min, max, top, height);
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(GRAPH_PADDING.left, y);
    ctx.lineTo(GRAPH_PADDING.left + chartWidth, y);
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
    fillColor: string,
    strokeColor: string
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
    ctx.fillStyle = fillColor;
    ctx.fill();
    drawLine(points, getValue, min, max, top, height, strokeColor);
  };

  charts.forEach((chart) => {
    chartTops.push({ top: yOffset, height: chart.height, key: chart.key });

    drawChartBackground(yOffset, chart.height);
    ctx.font = '600 9px system-ui, sans-serif';
    ctx.fillStyle = chart.color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(chart.top, 6, yOffset + 4);
    if (chart.bottom) {
      ctx.textBaseline = 'bottom';
      ctx.fillText(chart.bottom, 6, yOffset + chart.height - 4);
    }

    if (chart.key === 'showLong') {
      drawZeroLine(yOffset, chart.height, ranges.long.min, ranges.long.max);
      drawLine(drawPoints, (p) => p.longG, ranges.long.min, ranges.long.max, yOffset, chart.height, chart.color);
    } else if (chart.key === 'showLat') {
      drawZeroLine(yOffset, chart.height, ranges.lat.min, ranges.lat.max);
      drawLine(drawPoints, (p) => p.latG, ranges.lat.min, ranges.lat.max, yOffset, chart.height, chart.color);
    } else {
      drawFilledArea(
        drawPoints,
        (p) => p.speed,
        ranges.speed.min,
        ranges.speed.max,
        yOffset,
        chart.height,
        'rgba(168, 85, 247, 0.35)',
        chart.color
      );
    }

    yOffset += chart.height;
  });

  if (!showPlayhead) return;

  const values = findPointAtTime(drawPoints, displayTime);
  const clampedTime = Math.max(viewStart, Math.min(viewEnd, displayTime));
  const playheadX = timeToX(clampedTime);

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(playheadX, GRAPH_PADDING.top);
  ctx.lineTo(playheadX, GRAPH_PADDING.top + charts.reduce((s, c) => s + c.height, 0));
  ctx.stroke();

  if (!values) return;

  const formatG = (g: number) => `${g >= 0 ? '+' : ''}${g.toFixed(2)}G`;
  const formatSpeed = (s: number) => `${Math.round(s)} ${speedUnit.toUpperCase()}`;

  chartTops.forEach(({ top, height, key }) => {
    let text = '';
    let color = '#fff';
    let value = 0;
    let range = ranges.long;

    if (key === 'showLong') {
      text = formatG(values.longG);
      color = '#ef4444';
      value = values.longG;
      range = ranges.long;
    } else if (key === 'showLat') {
      text = formatG(values.latG);
      color = '#22d3ee';
      value = values.latG;
      range = ranges.lat;
    } else {
      text = formatSpeed(values.speed);
      color = '#a855f7';
      value = values.speed;
      range = ranges.speed;
    }

    const dotY = valueToY(value, range.min, range.max, top, height);
    const badgeY = top + height / 2;

    ctx.beginPath();
    ctx.arc(playheadX, dotY, 3, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = '600 9px system-ui, sans-serif';
    const textWidth = ctx.measureText(text).width;
    const padX = 5;
    const boxW = textWidth + padX * 2;
    const boxH = 14;
    let boxX = playheadX + 6;
    if (boxX + boxW > width - 4) boxX = playheadX - boxW - 6;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(boxX, badgeY - boxH / 2, boxW, boxH);
    ctx.strokeStyle = color;
    ctx.strokeRect(boxX, badgeY - boxH / 2, boxW, boxH);
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, boxX + padX, badgeY);
  });

  void speedUnit;
}

/** Draw charts scaled into an export cell or PiP corner */
export function drawTelemetryChartsInBounds(
  ctx: CanvasRenderingContext2D,
  bounds: { x: number; y: number; w: number; h: number },
  allPoints: GraphPoint[],
  displayTime: number,
  viewStart: number,
  viewEnd: number,
  speedUnit: 'mph' | 'kmh',
  visibility: GraphVisibility,
  compact = true
) {
  const visible = allPoints.filter((p) => p.time >= viewStart && p.time <= viewEnd);
  if (visible.length === 0) return;

  const ranges = computeGraphRanges(visible);
  const viewDuration = Math.max(viewEnd - viewStart, 0.001);
  const { totalHeight } = getChartLayout(compact, visibility);
  if (totalHeight <= 0) return;

  const scale = Math.min(bounds.w / 400, bounds.h / totalHeight);
  const drawW = Math.floor(400 * scale);
  const drawH = Math.floor(totalHeight * scale);

  const offscreen = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  if (!offscreen) return;

  offscreen.width = 400;
  offscreen.height = totalHeight;
  const offCtx = offscreen.getContext('2d');
  if (!offCtx) return;

  const drawPoints = downsample(visible, 400);
  drawTelemetryCharts(offCtx, 400, drawPoints, ranges, viewDuration, speedUnit, {
    visibility,
    compact,
    showPlayhead: true,
    displayTime,
    viewStart,
    viewEnd,
  });

  ctx.fillStyle = '#000';
  ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
  const offsetX = bounds.x + Math.floor((bounds.w - drawW) / 2);
  const offsetY = bounds.y + Math.floor((bounds.h - drawH) / 2);
  ctx.drawImage(offscreen, 0, 0, 400, totalHeight, offsetX, offsetY, drawW, drawH);
}