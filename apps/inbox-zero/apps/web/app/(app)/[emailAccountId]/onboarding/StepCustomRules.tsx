"use client";

import { NotepadTextIcon } from "lucide-react";
import Image from "next/image";
import { ContinueButton } from "@/app/(app)/[emailAccountId]/onboarding/ContinueButton";
import { IconCircle } from "@/app/(app)/[emailAccountId]/onboarding/IconCircle";
import { OnboardingWrapper } from "@/app/(app)/[emailAccountId]/onboarding/OnboardingWrapper";
import { PageHeading, TypographyP } from "@/components/Typography";

export function StepCustomRules({
  onNext,
}: {
  provider: string;
  onNext: () => void;
}) {
  return (
    <div className="relative">
      <div className="xl:pr-[50%]">
        <OnboardingWrapper className="py-0">
          <IconCircle className="mx-auto" size="lg">
            <NotepadTextIcon className="size-6" />
          </IconCircle>

          <div className="mx-auto mt-4 max-w-lg text-center">
            <PageHeading>Custom rules</PageHeading>
            <TypographyP className="mt-2 text-left">
              We've set up the basics, but that's just the beginning. Your AI
              assistant can handle any email workflow you'd give to a human.
            </TypographyP>
            <TypographyP className="mt-2 text-left">For example:</TypographyP>
            <ul className="list-inside list-disc space-y-1 text-left text-muted-foreground leading-7">
              <li>Forward receipts to your accountant</li>
              <li>Label newsletters and archive them after a week</li>
            </ul>
          </div>

          <div className="mx-auto flex w-full max-w-xs">
            <ContinueButton
              className="w-full"
              onClick={onNext}
              size="default"
            />
          </div>
        </OnboardingWrapper>
      </div>

      <div className="fixed top-0 right-0 hidden h-screen w-1/2 items-center justify-center bg-white px-10 xl:flex">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <Image
            alt="Custom rules"
            className="rounded-xl border border-slate-200"
            height={800}
            src="/images/onboarding/custom-rules.png"
            width={1200}
          />
        </div>
      </div>
    </div>
  );
}
