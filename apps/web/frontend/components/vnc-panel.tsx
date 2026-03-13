/**
 * VNC Panel — React wrapper around @simonpeacocks/react-vnc
 *
 * Connects directly via WebSocket to websockify, replacing the old iframe/noVNC approach.
 * Exposes clipboard and connection control via ref.
 */

import { VncScreen, type VncScreenHandle } from "@simonpeacocks/react-vnc";
import { type Ref, useImperativeHandle, useRef, useState } from "react";

export interface VncPanelHandle {
  clipboardPaste: (text: string) => void;
  connect: () => void;
  connected: boolean;
  disconnect: () => void;
}

interface VncPanelProps {
  aspectRatio: string;
  healthy: boolean;
  onClipboard?: (text: string) => void;
  ref?: Ref<VncPanelHandle>;
  statusLabel: string;
  wsUrl: string;
}

export function VncPanel({
  wsUrl,
  aspectRatio,
  statusLabel,
  healthy,
  ref,
  onClipboard,
}: VncPanelProps) {
  const vncRef = useRef<VncScreenHandle>(null);
  const [isConnected, setIsConnected] = useState(false);

  useImperativeHandle(
    ref,
    () => ({
      clipboardPaste: (text: string) => vncRef.current?.clipboardPaste(text),
      get connected() {
        return isConnected;
      },
      connect: () => vncRef.current?.connect(),
      disconnect: () => vncRef.current?.disconnect(),
    }),
    [isConnected]
  );

  return (
    <div
      className={`relative overflow-hidden bg-black ${
        aspectRatio === "auto"
          ? "h-full w-full"
          : "w-full rounded-2xl border border-border"
      }`}
      style={aspectRatio === "auto" ? undefined : { aspectRatio }}
    >
      <VncScreen
        autoConnect
        background="#000000"
        clipViewport={false}
        compressionLevel={2}
        dragViewport={false}
        onClipboard={(e) => {
          const text =
            (e as unknown as { detail?: { text?: string } })?.detail?.text ??
            "";
          if (text) {
            onClipboard?.(text);
          }
        }}
        onConnect={() => setIsConnected(true)}
        onDisconnect={() => setIsConnected(false)}
        ref={vncRef}
        retryDuration={3000}
        resizeSession={false}
        qualityLevel={6}
        scaleViewport
        style={{ width: "100%", height: "100%" }}
        url={wsUrl}
      />

      {/* Scanline overlay */}
      <div className="pointer-events-none absolute inset-0 z-10 opacity-[0.03]">
        <div
          className="h-full w-full"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.3) 2px, rgba(0,0,0,0.3) 4px)",
          }}
        />
      </div>

      {/* Status overlay */}
      <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full border border-border bg-black/80 px-3 py-1.5 font-mono text-xs backdrop-blur-sm">
        <span className="relative flex h-2 w-2">
          <span
            className={`absolute inline-flex h-full w-full animate-ping rounded-full ${
              healthy ? "bg-green-400" : "bg-amber-400"
            } opacity-75`}
          />
          <span
            className={`relative inline-flex h-2 w-2 rounded-full ${
              healthy ? "bg-green-500" : "bg-amber-500"
            }`}
          />
        </span>
        <span className="text-muted-foreground">{statusLabel}</span>
      </div>
    </div>
  );
}
