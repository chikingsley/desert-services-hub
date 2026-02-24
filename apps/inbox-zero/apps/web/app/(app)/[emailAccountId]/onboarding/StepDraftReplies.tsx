"use client";

import { ArrowRightIcon } from "lucide-react";
import { DraftRepliesIllustration } from "@/app/(app)/[emailAccountId]/onboarding/illustrations/DraftRepliesIllustration";
import { PageHeading, TypographyP } from "@/components/Typography";
import { Button } from "@/components/ui/button";

export function StepDraftReplies({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
      <div className="flex max-w-md flex-col items-center text-center">
        <div className="mb-6 flex h-[240px] items-end justify-center">
          <DraftRepliesIllustration />
        </div>

        <PageHeading className="mb-3">Pre-drafted replies</PageHeading>

        <TypographyP className="mb-8 text-muted-foreground">
          When you check your inbox, every email needing a response will have a
          pre-drafted reply in your tone.
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
