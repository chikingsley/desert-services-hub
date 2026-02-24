"use client";

import { ArrowRightIcon } from "lucide-react";
import { EmailsSortedIllustration } from "@/app/(app)/[emailAccountId]/onboarding/illustrations/EmailsSortedIllustration";
import { PageHeading, TypographyP } from "@/components/Typography";
import { Button } from "@/components/ui/button";

export function StepEmailsSorted({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
      <div className="flex max-w-md flex-col items-center text-center">
        <div className="mb-6 flex h-[240px] items-end justify-center">
          <EmailsSortedIllustration />
        </div>

        <PageHeading className="mb-3">We sort your emails</PageHeading>

        <TypographyP className="mb-8 text-muted-foreground">
          Emails are automatically organized into categories like "To Reply",
          "Newsletters", and "Cold Emails".
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
