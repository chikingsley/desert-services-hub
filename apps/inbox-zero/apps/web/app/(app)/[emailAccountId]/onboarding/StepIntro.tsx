"use client";

import { MailIcon } from "lucide-react";
import Image from "next/image";
import { ContinueButton } from "@/app/(app)/[emailAccountId]/onboarding/ContinueButton";
import { IconCircle } from "@/app/(app)/[emailAccountId]/onboarding/IconCircle";
import { OnboardingWrapper } from "@/app/(app)/[emailAccountId]/onboarding/OnboardingWrapper";
import { MutedText, PageHeading, TypographyP } from "@/components/Typography";
import { CardBasic } from "@/components/ui/card";

export function StepIntro({ onNext }: { onNext: () => void }) {
  return (
    <OnboardingWrapper>
      <IconCircle className="mx-auto" size="lg">
        <MailIcon className="size-6" />
      </IconCircle>

      <div className="mt-4 text-center">
        <PageHeading>Get to know Inbox Zero</PageHeading>
        <TypographyP className="mx-auto mt-2 max-w-lg">
          We'll take you through the steps to get you started and set you up for
          success.
        </TypographyP>
      </div>
      <div className="mt-8">
        <div className="grid gap-4 sm:gap-8">
          <Benefit
            description="Every email is automatically organized into categories like 'To Reply', 'Newsletters', and 'Cold Emails'. Create any categories you want."
            image="/images/onboarding/newsletters.png"
            index={1}
            title="We sort your emails"
          />
          <Benefit
            description="When you check your inbox, every email needing a response will have a pre-drafted reply in your tone, ready for you to send."
            image="/images/onboarding/draft.png"
            index={2}
            title="Pre-drafted replies"
          />
          {/* <Benefit
            index={3}
            title="Daily digest"
            description="Get a beautiful daily email summarizing everything you need to read but don't need to respond to. Read your inbox in 30 seconds instead of 30 minutes."
            image="/images/onboarding/digest.png"
          /> */}
          <Benefit
            description="See which emails you never read, and one-click unsubscribe and archive them."
            image="/images/onboarding/bulk-unsubscribe.png"
            index={3}
            title="Bulk Unsubscriber"
          />
        </div>
        <div className="mt-8 flex justify-center">
          <ContinueButton onClick={onNext} />
        </div>
      </div>
    </OnboardingWrapper>
  );
}

function Benefit({
  index,
  title,
  description,
  image,
}: {
  index: number;
  title: string;
  description: string;
  image: string;
}) {
  return (
    <CardBasic className="grid max-h-[400px] gap-4 rounded-2xl p-0 pt-4 pl-4 shadow-none sm:grid-cols-5 sm:gap-8">
      <div className="col-span-2 flex items-center gap-4">
        <IconCircle>{index}</IconCircle>
        <div>
          <div className="font-semibold text-lg sm:text-xl">{title}</div>
          <MutedText className="mt-1 leading-6">{description}</MutedText>
        </div>
      </div>
      <div className="col-span-3 overflow-hidden rounded-tl-2xl border-slate-200 border-t border-l bg-slate-50 pt-4 pl-4 text-muted-foreground text-sm">
        <Image
          alt="Benefit"
          className="h-full w-full rounded-tl-xl border-slate-200 border-t border-l object-cover object-left-top"
          height={700}
          src={image}
          width={700}
        />
      </div>
    </CardBasic>
  );
}
