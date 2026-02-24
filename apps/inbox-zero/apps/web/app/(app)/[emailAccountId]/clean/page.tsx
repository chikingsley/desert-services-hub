import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ConfirmationStep } from "@/app/(app)/[emailAccountId]/clean/ConfirmationStep";
import { getLastJob } from "@/app/(app)/[emailAccountId]/clean/helpers";
import { Loading } from "@/components/Loading";
import { Card } from "@/components/ui/card";
import { checkUserOwnsEmailAccount } from "@/utils/email-account";
import { prefixPath } from "@/utils/path";

export default async function CleanPage({
  params,
}: {
  params: Promise<{ emailAccountId: string }>;
}) {
  const { emailAccountId } = await params;
  await checkUserOwnsEmailAccount({ emailAccountId });

  const lastJob = await getLastJob({ emailAccountId });
  if (!lastJob) {
    redirect(prefixPath(emailAccountId, "/clean/onboarding"));
  }

  return (
    <Card className="my-4 max-w-2xl p-6 sm:mx-4 md:mx-auto">
      <Suspense fallback={<Loading />}>
        <ConfirmationStep
          action={lastJob.action}
          instructions={lastJob.instructions ?? undefined}
          reuseSettings={true}
          showFooter
          skips={{
            reply: lastJob.skipReply ?? true,
            starred: lastJob.skipStarred ?? true,
            calendar: lastJob.skipCalendar ?? true,
            receipt: lastJob.skipReceipt ?? false,
            attachment: lastJob.skipAttachment ?? false,
          }}
          timeRange={lastJob.daysOld}
        />
      </Suspense>
    </Card>
  );
}
