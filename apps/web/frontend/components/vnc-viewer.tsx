/**
 * VNC Viewer Modal
 *
 * Embeds noVNC iframe for watching/interacting with browser automation sessions.
 * The permit-worker container exposes noVNC on port 47821 (mapped from 6080).
 */

import { ExternalLink, Maximize2, Minimize2, Monitor } from "lucide-react";
import { useState } from "react";
import { Button } from "@/apps/web/frontend/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/apps/web/frontend/components/ui/dialog";

const VNC_URL = "http://localhost:47821/vnc.html?autoconnect=true&resize=scale";

interface VncViewerProps {
  title?: string;
  subtitle?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VncViewer({
  title = "Browser Session",
  subtitle,
  open,
  onOpenChange,
}: VncViewerProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className={
          isFullscreen
            ? "h-[95vh] max-h-[95vh] w-[95vw] max-w-[95vw]"
            : "max-w-5xl"
        }
      >
        <DialogHeader>
          <div className="flex items-center justify-between pr-8">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-primary/20 bg-primary/10">
                <Monitor className="h-5 w-5 text-primary" />
              </div>
              <div>
                <DialogTitle className="font-mono">{title}</DialogTitle>
                {subtitle && <DialogDescription>{subtitle}</DialogDescription>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => setIsFullscreen(!isFullscreen)}
                size="icon"
                title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                variant="ghost"
              >
                {isFullscreen ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
              </Button>
              <Button
                onClick={() =>
                  window.open(VNC_URL, "_blank", "noopener,noreferrer")
                }
                size="icon"
                title="Open in new tab"
                variant="ghost"
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* VNC Iframe Container */}
        <div
          className={`relative overflow-hidden rounded-lg border border-border bg-black ${
            isFullscreen ? "h-[calc(95vh-120px)]" : "h-[600px]"
          }`}
        >
          {/* Subtle scanline overlay for CRT effect */}
          <div className="pointer-events-none absolute inset-0 z-10 opacity-[0.03]">
            <div
              className="h-full w-full"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.3) 2px, rgba(0,0,0,0.3) 4px)",
              }}
            />
          </div>

          {/* VNC iframe */}
          <iframe
            allow="clipboard-read; clipboard-write"
            className="h-full w-full border-0"
            src={VNC_URL}
            title={`VNC Session — ${title}`}
          />

          {/* Connection status indicator */}
          <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full border border-border bg-black/80 px-3 py-1.5 font-mono text-xs backdrop-blur-sm">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
            </span>
            <span className="text-muted-foreground">Connected</span>
          </div>
        </div>

        <div className="text-center font-mono text-muted-foreground text-xs">
          Click inside the viewer to interact
        </div>
      </DialogContent>
    </Dialog>
  );
}
