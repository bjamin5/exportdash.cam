'use client';

import { SeiData, SeiWithFrameIndex } from '@/lib/dashcam-mp4';
import { TelemetryDisplayConfig, TrimPoints } from '@/types/video';
import { TelemetryCard } from './TelemetryCard';
import { TelemetryGraphs } from './TelemetryGraphs';

interface TelemetryDashboardProps {
  seiData: SeiData | null;
  isLoading: boolean;
  error: string | null;
  allSeiMessages: SeiWithFrameIndex[];
  fps: number;
  duration: number;
  currentTime: number;
  isPlaying: boolean;
  playbackRate?: number;
  speedUnit: 'mph' | 'kmh';
  onSpeedUnitToggle: () => void;
  onSeek?: (time: number) => void;
  onDraggingChange?: (isDragging: boolean) => void;
  trimPoints?: TrimPoints | null;
  isTrimming?: boolean;
  displayConfig: TelemetryDisplayConfig;
  compact?: boolean;
  showHud?: boolean;
  showGraphs?: boolean;
  className?: string;
}

export function TelemetryDashboard({
  seiData,
  isLoading,
  error,
  allSeiMessages,
  fps,
  duration,
  currentTime,
  isPlaying,
  playbackRate = 1,
  speedUnit,
  onSpeedUnitToggle,
  onSeek,
  onDraggingChange,
  trimPoints,
  isTrimming,
  displayConfig,
  compact = false,
  showHud = true,
  showGraphs = true,
  className = '',
}: TelemetryDashboardProps) {
  const hasHud = showHud && displayConfig.showHud;
  const hasGraphs =
    showGraphs &&
    duration > 0 &&
    allSeiMessages.length > 0 &&
    (displayConfig.showGraphLong || displayConfig.showGraphLat || displayConfig.showGraphSpeed);

  if (!hasHud && !hasGraphs) {
    return (
      <div className={`flex items-center justify-center bg-black text-gray-600 text-xs ${className}`}>
        Telemetry hidden
      </div>
    );
  }

  return (
    <div className={`flex flex-col bg-black overflow-hidden ${className}`}>
      {hasHud && (
        <div className={`flex justify-center ${compact ? 'py-1' : 'py-2'} shrink-0`}>
          <TelemetryCard
            seiData={seiData}
            isLoading={isLoading}
            error={error}
            speedUnit={speedUnit}
            onSpeedUnitToggle={onSpeedUnitToggle}
            displayConfig={displayConfig}
            compact={compact}
          />
        </div>
      )}
      {hasGraphs && onSeek && (
        <div className="flex-1 min-h-0">
          <TelemetryGraphs
            allSeiMessages={allSeiMessages}
            fps={fps}
            duration={duration}
            currentTime={currentTime}
            isPlaying={isPlaying}
            playbackRate={playbackRate}
            speedUnit={speedUnit}
            onSeek={onSeek}
            onDraggingChange={onDraggingChange}
            trimPoints={trimPoints}
            isTrimming={isTrimming}
            displayConfig={displayConfig}
            compact={compact}
          />
        </div>
      )}
    </div>
  );
}