import { PlayIcon } from "lucide-react";
import { OnboardingDialogContent } from "@/components/OnboardingModal";
import { PageHeading, PageSubHeading } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";

type Video = {
  title: string;
  description: React.ReactNode;
  youtubeVideoId?: string;
  muxPlaybackId?: string;
};

interface PageHeaderProps {
  description?: string;
  title: string;
  video?: Video;
}

export function PageHeader({ title, video, description }: PageHeaderProps) {
  return (
    <div>
      <div className="mt-1 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <div>
          <PageHeading>{title}</PageHeading>
          {description && (
            <PageSubHeading className="mt-1">{description}</PageSubHeading>
          )}
        </div>
        {video && (video.youtubeVideoId || video.muxPlaybackId) && (
          <WatchVideo video={video} />
        )}
      </div>
    </div>
  );
}

function WatchVideo({ video }: { video: Video }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="xs" variant="outline">
          <PlayIcon className="mr-2 size-3" />
          Watch demo
        </Button>
      </DialogTrigger>
      <OnboardingDialogContent
        description={video.description}
        muxPlaybackId={video.muxPlaybackId}
        title={video.title}
        youtubeVideoId={video.youtubeVideoId}
      />
    </Dialog>
  );
}
