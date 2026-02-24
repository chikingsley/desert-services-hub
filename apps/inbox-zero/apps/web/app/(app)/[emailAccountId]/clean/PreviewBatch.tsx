"use client";

import { parseAsBoolean, useQueryState } from "nuqs";
import { useState } from "react";
import { PREVIEW_RUN_COUNT } from "@/app/(app)/[emailAccountId]/clean/consts";
import { toastError } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import {
  CardContent,
  CardDescription,
  CardGreen,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { CleanupJob } from "@/generated/prisma/client";
import { CleanAction } from "@/generated/prisma/enums";
import { useAccount } from "@/providers/EmailAccountProvider";
import { cleanInboxAction } from "@/utils/actions/clean";

export function PreviewBatch({ job }: { job: CleanupJob }) {
  const { emailAccountId } = useAccount();
  const [, setIsPreviewBatch] = useQueryState("isPreviewBatch", parseAsBoolean);
  const [isLoading, setIsLoading] = useState(false);

  const handleRunOnFullInbox = async () => {
    setIsLoading(true);
    setIsPreviewBatch(false);
    const result = await cleanInboxAction(emailAccountId, {
      daysOld: job.daysOld,
      instructions: job.instructions || "",
      action: job.action,
      skips: {
        reply: job.skipReply,
        starred: job.skipStarred,
        calendar: job.skipCalendar,
        receipt: job.skipReceipt,
        attachment: job.skipAttachment,
        conversation: job.skipConversation,
      },
    });

    setIsLoading(false);

    if (result?.serverError) {
      toastError({ description: result.serverError });
      return;
    }
  };

  return (
    <CardGreen className="mb-4">
      <CardHeader>
        <CardTitle>Preview run</CardTitle>
        {/* <CardDescription>
          We processed {total} emails. {archived} were{" "}
          {job.action === CleanAction.ARCHIVE ? "archived" : "marked as read"}.
        </CardDescription> */}
        <CardDescription>
          We're cleaning up {PREVIEW_RUN_COUNT} emails so you can see how it
          works.
        </CardDescription>
        <CardDescription>
          To undo any, hover over the "
          {job.action === CleanAction.ARCHIVE ? "Archive" : "Mark as read"}"
          badge and click undo.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center gap-4">
        <Button loading={isLoading} onClick={handleRunOnFullInbox}>
          Run on Full Inbox
        </Button>
        {/* {disableRunOnFullInbox && (
          <CardDescription className="font-semibold">
            All emails have been processed
          </CardDescription>
        )} */}
      </CardContent>
    </CardGreen>
  );
}
