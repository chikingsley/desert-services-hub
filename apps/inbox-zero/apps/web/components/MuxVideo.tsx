"use client";

import MuxPlayer from "@mux/mux-player-react";
import { ClientOnly } from "@/components/ClientOnly";
import { cn } from "@/utils";

interface MuxVideoProps {
  className?: string;
  playbackId: string;
  thumbnailTime?: number;
  title: string;
}

export function MuxVideo({
  playbackId,
  title,
  className,
  thumbnailTime,
}: MuxVideoProps) {
  return (
    <ClientOnly>
      <div className={cn("group relative", className)}>
        <MuxPlayer
          accentColor="#3b82f6"
          className="aspect-video h-full w-full rounded-md shadow ring-1 ring-gray-900/10 transition-all duration-200 ease-out group-hover:brightness-[0.9]"
          metadata={{ video_title: title }}
          playbackId={playbackId}
          thumbnailTime={thumbnailTime}
        />
      </div>
    </ClientOnly>
  );
}
