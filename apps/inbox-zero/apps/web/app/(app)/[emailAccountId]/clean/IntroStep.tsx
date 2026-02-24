"use client";

import Image from "next/image";
import { useStep } from "@/app/(app)/[emailAccountId]/clean/useStep";
import { PremiumAlertWithData } from "@/components/PremiumAlert";
import { SectionDescription, TypographyH3 } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { CleanAction } from "@/generated/prisma/enums";

export function IntroStep({
  unhandledCount,
  cleanAction,
}: {
  unhandledCount: number;
  cleanAction: CleanAction;
}) {
  const { onNext } = useStep();

  return (
    <div>
      <PremiumAlertWithData activeOnly className="mb-20" />
      <div className="text-center">
        <Image
          alt="clean up"
          className="mx-auto dark:brightness-90 dark:invert"
          height={200}
          src="/images/illustrations/home-office.svg"
          unoptimized
          width={200}
        />

        <TypographyH3 className="mt-2">
          Let's get your inbox cleaned up in 5 minutes
        </TypographyH3>

        {unhandledCount === null ? (
          <SectionDescription className="mx-auto mt-2 max-w-prose">
            Checking your inbox...
          </SectionDescription>
        ) : (
          <>
            <SectionDescription className="mx-auto mt-2 max-w-prose">
              You have {unhandledCount.toLocaleString()}{" "}
              {cleanAction === CleanAction.ARCHIVE ? "unarchived" : "unread"}{" "}
              emails in your inbox.
            </SectionDescription>
            <SectionDescription className="mx-auto mt-2 max-w-prose">
              Let's clean up your inbox while keeping important emails safe.
            </SectionDescription>
          </>
        )}

        <div className="mt-6">
          <Button disabled={unhandledCount === null} onClick={onNext}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
