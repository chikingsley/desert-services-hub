"use client";

import { ArrowRightIcon } from "lucide-react";
import { InboxReadyIllustration } from "@/app/(app)/[emailAccountId]/onboarding/illustrations/InboxReadyIllustration";
import { usePremium } from "@/components/PremiumAlert";
import { PageHeading, TypographyP } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { ONBOARDING_PROCESS_EMAILS_COUNT } from "@/utils/config";

export function StepInboxProcessed({ onNext }: { onNext: () => void }) {
  const { isPremium } = usePremium();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
      <div className="flex max-w-md flex-col items-center text-center">
        <div className="mb-6 flex h-[240px] items-end justify-center">
          <InboxReadyIllustration />
        </div>

        <PageHeading className="mb-3">Inbox Preview Ready</PageHeading>

        <TypographyP className="mb-8 text-muted-foreground">
          We labeled your last {ONBOARDING_PROCESS_EMAILS_COUNT} emails and
          drafted replies (nothing was archived).
          {!isPremium && (
            <>
              <br />
              To have incoming emails processed automatically, you'll need to
              upgrade.
            </>
          )}
        </TypographyP>

        <div className="flex w-full max-w-xs flex-col gap-2">
          <Button className="w-full" onClick={onNext}>
            Continue
            <ArrowRightIcon className="ml-2 size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
