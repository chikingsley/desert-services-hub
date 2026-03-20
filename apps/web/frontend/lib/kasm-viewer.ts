const VIEWER_DEFAULTS = {
  autoconnect: "1",
  resize: "remote",
  enable_webp: "1",
  enable_webrtc: "1",
  enable_hidpi: "1",
  enable_threading: "1",
  video_quality: "5",
  framerate: "60",
  max_video_resolution_x: "1920",
  max_video_resolution_y: "1080",
} as const;

export function buildKasmViewerUrl(rawUrl: string): string {
  if (!rawUrl) {
    return rawUrl;
  }

  const url = new URL(rawUrl);

  for (const [key, value] of Object.entries(VIEWER_DEFAULTS)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}
