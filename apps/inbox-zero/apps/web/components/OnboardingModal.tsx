"use client";

import { PlayIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useLocalStorage, useWindowSize } from "usehooks-ts";
import { MuxVideo } from "@/components/MuxVideo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { YouTubeVideo } from "@/components/YouTubeVideo";
import { useModal } from "@/hooks/useModal";

export function OnboardingModal({
  title,
  description,
  youtubeVideoId,
  muxPlaybackId,
  buttonProps,
}: {
  title: string;
  description: React.ReactNode;
  youtubeVideoId?: string;
  muxPlaybackId?: string;
  buttonProps?: React.ComponentProps<typeof Button>;
}) {
  const { isModalOpen, openModal, setIsModalOpen } = useModal();

  return (
    <>
      <Button className="text-nowrap" onClick={openModal} {...buttonProps}>
        <PlayIcon className="mr-2 h-4 w-4" />
        Watch demo
      </Button>

      <OnboardingModalDialog
        description={description}
        isModalOpen={isModalOpen}
        muxPlaybackId={muxPlaybackId}
        setIsModalOpen={setIsModalOpen}
        title={title}
        youtubeVideoId={youtubeVideoId}
      />
    </>
  );
}

export function OnboardingModalDialog({
  isModalOpen,
  setIsModalOpen,
  title,
  description,
  youtubeVideoId,
  muxPlaybackId,
}: {
  isModalOpen: boolean;
  setIsModalOpen: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  youtubeVideoId?: string;
  muxPlaybackId?: string;
}) {
  return (
    <Dialog onOpenChange={setIsModalOpen} open={isModalOpen}>
      <OnboardingDialogContent
        description={description}
        muxPlaybackId={muxPlaybackId}
        title={title}
        youtubeVideoId={youtubeVideoId}
      />
    </Dialog>
  );
}

export function OnboardingDialogContent({
  title,
  description,
  youtubeVideoId,
  muxPlaybackId,
}: {
  title: string;
  description: React.ReactNode;
  youtubeVideoId?: string;
  muxPlaybackId?: string;
}) {
  const { width } = useWindowSize();

  const videoWidth = Math.min(width * 0.75, 1200);
  const videoHeight = videoWidth * (675 / 1200);

  return (
    <DialogContent className="max-w-6xl overflow-hidden border-0 bg-transparent p-0">
      <DialogHeader className="sr-only">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>

      {muxPlaybackId ? (
        <div className="relative aspect-video w-full overflow-hidden rounded-lg">
          <MuxVideo
            className="size-full"
            playbackId={muxPlaybackId}
            title={`Onboarding video - ${title}`}
          />
        </div>
      ) : youtubeVideoId ? (
        <div className="rounded-lg bg-background p-6">
          <div className="mb-4">
            <h2 className="font-semibold text-xl">{title}</h2>
            <p className="text-muted-foreground">{description}</p>
          </div>
          <YouTubeVideo
            iframeClassName="mx-auto"
            opts={{
              height: `${videoHeight}`,
              width: `${videoWidth}`,
              playerVars: {
                // https://developers.google.com/youtube/player_parameters
                autoplay: 1,
              },
            }}
            title={`Onboarding video - ${title}`}
            videoId={youtubeVideoId}
          />
        </div>
      ) : null}
    </DialogContent>
  );
}

export const useOnboarding = (feature: string) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [hasViewedOnboarding, setHasViewedOnboarding] = useLocalStorage(
    `viewed${feature}Onboarding`,
    false
  );

  useEffect(() => {
    if (!hasViewedOnboarding) {
      setIsOpen(true);
      setHasViewedOnboarding(true);
    }
  }, [setHasViewedOnboarding, hasViewedOnboarding]);

  const onClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  return {
    isOpen,
    hasViewedOnboarding,
    setIsOpen,
    onClose,
  };
};
