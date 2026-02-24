"use client";

import { MailsIcon } from "lucide-react";
import { ContinueButton } from "@/app/(app)/[emailAccountId]/onboarding/ContinueButton";
import { IconCircle } from "@/app/(app)/[emailAccountId]/onboarding/IconCircle";
import { OnboardingImagePreview } from "@/app/(app)/[emailAccountId]/onboarding/ImagePreview";
import { OnboardingWrapper } from "@/app/(app)/[emailAccountId]/onboarding/OnboardingWrapper";
import { DigestItemsForm } from "@/app/(app)/[emailAccountId]/settings/DigestItemsForm";
import { DigestScheduleForm } from "@/app/(app)/[emailAccountId]/settings/DigestScheduleForm";
import { PageHeading, TypographyP } from "@/components/Typography";

export function StepDigest({ onNext }: { onNext: () => void }) {
  return (
    <div className="grid xl:grid-cols-2">
      <OnboardingWrapper className="py-0">
        <IconCircle className="mx-auto" size="lg">
          <MailsIcon className="size-6" />
        </IconCircle>

        <div className="mt-4 text-center">
          <PageHeading>Which emails do you want in your digest?</PageHeading>
          <TypographyP className="mx-auto mt-2 max-w-lg">
            Get a beautiful daily email summarizing what happened in your inbox
            today. Read your inbox in 30 seconds instead of 30 minutes.
          </TypographyP>
        </div>

        <DigestItemsForm showSaveButton={false} />
        <DigestScheduleForm showSaveButton={false} />

        <div className="mt-8 flex justify-center">
          <ContinueButton onClick={onNext} />
        </div>
      </OnboardingWrapper>

      <div className="fixed top-0 right-0 hidden h-screen w-1/2 items-center justify-center bg-white xl:flex">
        <OnboardingImagePreview
          alt="Digest Email Example"
          height={1200}
          src="/images/onboarding/digest.png"
          width={672}
        />
      </div>
    </div>
  );
}
