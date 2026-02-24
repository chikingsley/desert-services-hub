import { ThreadTrackerType } from "@/generated/prisma/enums";
import type { TimeRange } from "./date-filter";
import { getPaginatedThreadTrackers } from "./fetch-trackers";
import { ReplyTrackerEmails } from "./ReplyTrackerEmails";

export async function NeedsReply({
  emailAccountId,
  userEmail,
  page,
  timeRange,
  isAnalyzing,
}: {
  emailAccountId: string;
  userEmail: string;
  page: number;
  timeRange: TimeRange;
  isAnalyzing: boolean;
}) {
  const { trackers, totalPages } = await getPaginatedThreadTrackers({
    emailAccountId,
    type: ThreadTrackerType.NEEDS_REPLY,
    page,
    timeRange,
  });

  return (
    <ReplyTrackerEmails
      emailAccountId={emailAccountId}
      isAnalyzing={isAnalyzing}
      totalPages={totalPages}
      trackers={trackers}
      type={ThreadTrackerType.NEEDS_REPLY}
      userEmail={userEmail}
    />
  );
}
