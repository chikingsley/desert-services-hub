"use client";

import { Settings2Icon } from "lucide-react";
import Image from "next/image";
import { IconCircle } from "@/app/(app)/[emailAccountId]/onboarding/IconCircle";
import { CategoriesSetup } from "@/app/(app)/[emailAccountId]/onboarding/OnboardingCategories";
import { OnboardingWrapper } from "@/app/(app)/[emailAccountId]/onboarding/OnboardingWrapper";
import { PageHeading, TypographyP } from "@/components/Typography";

export function StepLabels({
  emailAccountId,
  provider,
  onNext,
}: {
  emailAccountId: string;
  provider: string;
  onNext: () => void;
}) {
  return (
    <div className="relative">
      <div className="xl:pr-[50%]">
        <OnboardingWrapper className="py-0">
          <IconCircle className="mx-auto" size="lg">
            <Settings2Icon className="size-6" />
          </IconCircle>

          <div className="mt-4 text-center">
            <PageHeading>How do you want your inbox organized?</PageHeading>
            <TypographyP className="mx-auto mt-2 max-w-lg">
              We'll use these labels to organize your inbox. You can add custom
              labels and change them later.
            </TypographyP>
          </div>

          <CategoriesSetup
            emailAccountId={emailAccountId}
            onNext={onNext}
            provider={provider}
          />
        </OnboardingWrapper>
      </div>

      <div className="fixed top-0 right-0 hidden h-screen w-1/2 items-center justify-center bg-white px-10 xl:flex">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <Image
            alt="Categorize your emails"
            className="rounded-xl border border-slate-200"
            height={800}
            src="/images/assistant/labels.png"
            width={1200}
          />
        </div>
      </div>
    </div>
  );
}
