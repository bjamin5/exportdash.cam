/** Dev playback diagnostics — logs to console with [Playback] prefix */

export interface PlaybackSnapshot {
  format?: string;
  isPortraitFormat?: boolean;
  portraitLayout?: string;
  isCamTelemetry?: boolean;
  layout?: string;
  selectedAngle?: string;
  mainAngle?: string;
  isPlaying?: boolean;
  videoFound?: boolean;
  isConnected?: boolean;
  readyState?: number;
  paused?: boolean;
  ended?: boolean;
  currentTime?: number;
  videoSize?: { w: number; h: number };
  containerSize?: { w: number; h: number } | null;
  camSplitSize?: { w: number; h: number } | null;
  src?: string;
  refAngles?: string[];
  error?: string;
  action?: string;
  [key: string]: unknown;
}

export function logPlayback(message: string, snapshot: PlaybackSnapshot = {}) {
  if (typeof window === 'undefined') return;
  console.log(`[Playback] ${message}`, snapshot);
}

export function logPlaybackError(message: string, error: unknown, snapshot: PlaybackSnapshot = {}) {
  if (typeof window === 'undefined') return;
  const errMsg = error instanceof Error ? error.message : String(error);
  console.error(`[Playback] ${message}`, { ...snapshot, error: errMsg, raw: error });
}

export function describeVideo(video: HTMLVideoElement | null | undefined) {
  if (!video) return null;
  return {
    isConnected: video.isConnected,
    readyState: video.readyState,
    paused: video.paused,
    ended: video.ended,
    currentTime: video.currentTime,
    videoWidth: video.videoWidth,
    videoHeight: video.videoHeight,
    clientWidth: video.clientWidth,
    clientHeight: video.clientHeight,
    src: video.src?.slice(0, 80),
  };
}