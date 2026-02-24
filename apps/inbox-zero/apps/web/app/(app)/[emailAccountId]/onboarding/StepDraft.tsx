"use client";

import { CheckIcon, PenIcon, XIcon } from "lucide-react";
import Image from "next/image";
import { useCallback } from "react";
import { IconCircle } from "@/app/(app)/[emailAccountId]/onboarding/IconCircle";
import { OnboardingButton } from "@/app/(app)/[emailAccountId]/onboarding/OnboardingButton";
import { OnboardingWrapper } from "@/app/(app)/[emailAccountId]/onboarding/OnboardingWrapper";
import { toastError } from "@/components/Toast";
import { PageHeading, TypographyP } from "@/components/Typography";
import { enableDraftRepliesAction } from "@/utils/actions/rule";

export function StepDraft({
  emailAccountId,
  onNext,
}: {
  emailAccountId: string;
  provider: string;
  onNext: () => void;
}) {
  const onSetDraftReplies = useCallback(
    async (value: string) => {
      const result = await enableDraftRepliesAction(emailAccountId, {
        enable: value === "yes",
      });

      if (result?.serverError) {
        toastError({
          description: `There was an error: ${result.serverError || ""}`,
        });
      }

      onNext();
    },
    [onNext, emailAccountId]
  );

  return (
    <div className="relative">
      <div className="xl:pr-[50%]">
        <OnboardingWrapper className="py-0">
          <IconCircle className="mx-auto" size="lg">
            <PenIcon className="size-6" />
          </IconCircle>

          <div className="mt-4 text-center">
            <PageHeading>Should we draft replies for you?</PageHeading>
            <TypographyP className="mx-auto mt-2 max-w-lg">
              The drafts will appear in your inbox, written in your tone.
              <br />
              Our AI learns from your previous conversations to draft the best
              reply.
            </TypographyP>
          </div>

          <div className="mt-4 grid gap-2">
            <OnboardingButton
              icon={<CheckIcon className="size-4" />}
              onClick={() => onSetDraftReplies("yes")}
              text="Yes, please"
            />

            <OnboardingButton
              icon={<XIcon className="size-4" />}
              onClick={() => onSetDraftReplies("no")}
              text="No, thanks"
            />
          </div>
        </OnboardingWrapper>
      </div>

      <div className="fixed top-0 right-0 hidden h-screen w-1/2 items-center justify-center bg-white px-10 xl:flex">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <Image
            alt="Draft replies"
            className="rounded-xl border border-slate-200"
            height={800}
            src="/images/onboarding/draft.png"
            width={1200}
          />
        </div>
      </div>
    </div>
  );
}
