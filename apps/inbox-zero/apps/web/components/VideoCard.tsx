"use client";

import MuxPlayer from "@mux/mux-player-react";
import { PlayIcon, X } from "lucide-react";
import Image from "next/image";
import type { ComponentProps } from "react";
import React, { useEffect, useState } from "react";
import { ClientOnly } from "@/components/ClientOnly";
import { MutedText } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { CardGreen } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type VideoCardProps = ComponentProps<typeof VideoCard> & {
  storageKey: string;
};

export function DismissibleVideoCard({ storageKey, ...props }: VideoCardProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const isDismissed = localStorage.getItem(storageKey) === "true";
    setIsVisible(!isDismissed);
    setIsLoaded(true);
  }, [storageKey]);

  const handleClose = () => {
    setIsVisible(false);
    localStorage.setItem(storageKey, "true");
  };

  if (!(isLoaded && isVisible)) {
    return null;
  }

  return <VideoCard {...props} onClose={handleClose} />;
}

const VideoCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    icon?: React.ReactNode;
    title: string;
    description: string;
    videoSrc?: string;
    thumbnailSrc?: string;
    muxPlaybackId?: string;
    onClose?: () => void;
  }
>(
  (
    {
      className,
      icon,
      title,
      description,
      videoSrc,
      thumbnailSrc,
      muxPlaybackId,
      onClose,
      ...props
    },
    ref
  ) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
      <CardGreen className={className} ref={ref} {...props}>
        <div className="relative">
          {onClose && (
            <button
              aria-label="Close"
              className="absolute top-3 right-3 z-10 rounded-full p-1.5 transition-colors duration-200 hover:bg-green-50 dark:hover:bg-green-900/20"
              onClick={onClose}
              type="button"
            >
              <X className="h-4 w-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200" />
            </button>
          )}
          <div className="flex items-center justify-between gap-6 p-6 pr-12">
            <div className="flex items-start gap-3">
              {icon && (
                <div className="mt-0.5 flex-shrink-0 text-green-600 dark:text-green-400">
                  {icon}
                </div>
              )}
              <div className="flex-1">
                <h3 className="font-semibold text-lg">{title}</h3>
                <MutedText className="mt-1">{description}</MutedText>
                <Button
                  className="mt-3"
                  Icon={PlayIcon}
                  onClick={() => setIsOpen(true)}
                  size="sm"
                  variant="primaryBlack"
                >
                  Watch Video
                </Button>
              </div>
            </div>

            <div className="hidden flex-shrink-0 items-center gap-3 md:flex">
              <Dialog onOpenChange={setIsOpen} open={isOpen}>
                <DialogTrigger asChild>
                  <button
                    aria-label="Play video"
                    className="group relative cursor-pointer overflow-hidden rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2"
                    type="button"
                  >
                    <div className="relative h-20 w-32 overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
                      <Image
                        alt={title}
                        className="object-cover transition-all duration-200 group-hover:scale-105"
                        fill
                        sizes="(max-width: 128px) 100vw, 128px"
                        src={
                          muxPlaybackId
                            ? `https://image.mux.com/${muxPlaybackId}/thumbnail.jpg`
                            : thumbnailSrc ||
                              "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAAWgmWQ0AAAAASUVORK5CYII="
                        }
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors duration-200 group-hover:bg-black/30">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/90 transition-colors duration-200 group-hover:bg-white">
                          <PlayIcon className="ml-0.5 size-3 fill-current text-gray-800" />
                        </div>
                      </div>
                    </div>
                  </button>
                </DialogTrigger>
                <DialogContent className="max-w-6xl overflow-hidden border-0 bg-transparent p-0">
                  <DialogTitle className="sr-only">Video: {title}</DialogTitle>
                  <div className="relative aspect-video w-full overflow-hidden rounded-lg">
                    {muxPlaybackId ? (
                      <ClientOnly>
                        <MuxPlayer
                          accentColor="#3b82f6"
                          autoPlay
                          className="size-full rounded-lg"
                          metadata={{ video_title: title }}
                          playbackId={muxPlaybackId}
                          style={{ overflow: "hidden" }}
                        />
                      </ClientOnly>
                    ) : (
                      <iframe
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                        className="size-full rounded-lg"
                        src={`${videoSrc}${videoSrc?.includes("?") ? "&" : "?"}autoplay=1&rel=0`}
                        title={`Video: ${title}`}
                      />
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      </CardGreen>
    );
  }
);
VideoCard.displayName = "ActionCard";

export { VideoCard };
