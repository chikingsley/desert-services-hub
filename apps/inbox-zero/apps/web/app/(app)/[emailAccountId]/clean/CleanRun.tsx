import { EmailFirehose } from "@/app/(app)/[emailAccountId]/clean/EmailFirehose";
import { PreviewBatch } from "@/app/(app)/[emailAccountId]/clean/PreviewBatch";
import { Card } from "@/components/ui/card";
import type { CleanupJob } from "@/generated/prisma/client";
import type { getThreadsByJobId } from "@/utils/redis/clean";

export function CleanRun({
  isPreviewBatch,
  job,
  threads,
  total,
  done,
}: {
  isPreviewBatch: boolean;
  job: CleanupJob;
  threads: Awaited<ReturnType<typeof getThreadsByJobId>>;
  total: number;
  done: number;
}) {
  return (
    <div className="mx-auto my-4 w-full max-w-2xl px-4">
      {isPreviewBatch && <PreviewBatch job={job} />}
      <Card className="p-6">
        <EmailFirehose
          action={job.action}
          stats={{ total, done }}
          threads={threads.filter((t) => t.status !== "processing")}
        />
      </Card>
    </div>
  );
}
