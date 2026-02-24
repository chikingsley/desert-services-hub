"use client";

import {
  ArrowRightIcon,
  ChartBarIcon,
  ClockIcon,
  ReplyIcon,
  ShieldCheckIcon,
  SparklesIcon,
  ZapIcon,
} from "lucide-react";
import { useState } from "react";
import { IconCircle } from "@/app/(app)/[emailAccountId]/onboarding/IconCircle";
import { OnboardingWrapper } from "@/app/(app)/[emailAccountId]/onboarding/OnboardingWrapper";
import { MutedText, PageHeading, TypographyP } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils";
import { saveOnboardingFeaturesAction } from "@/utils/actions/onboarding";

// `value` is the value that will be saved to the database
const choices = [
  {
    label: "AI Personal Assistant",
    description: "Auto labelling, pre-drafted responses, and more.",
    icon: <SparklesIcon className="size-4" />,
    value: "AI Personal Assistant",
  },
  {
    label: "Bulk Unsubscriber",
    description: "One-click unsubscribe and archive emails you never read",
    icon: <ClockIcon className="size-4" />,
    value: "Bulk Unsubscriber",
  },
  {
    label: "Cold Email Blocker",
    description: "Block unsolicited sales emails and spam",
    icon: <ShieldCheckIcon className="size-4" />,
    value: "Cold Email Blocker",
  },
  {
    label: "Reply Zero",
    description:
      "Never forget to reply. Never miss a follow up when others don't respond.",
    icon: <ReplyIcon className="size-4" />,
    value: "Reply/Follow-up Tracker",
  },
  {
    label: "Email Analytics",
    description: "Analyze your email activity",
    icon: <ChartBarIcon className="size-4" />,
    value: "Email Analytics",
  },
];

export function StepFeatures({ onNext }: { onNext: () => void }) {
  const [selectedChoices, setSelectedChoices] = useState<Map<string, boolean>>(
    new Map()
  );

  return (
    <OnboardingWrapper className="py-0">
      <IconCircle className="mx-auto" size="lg">
        <ZapIcon className="size-6" />
      </IconCircle>

      <div className="mt-4 text-center">
        <PageHeading>How would you like to use Inbox Zero?</PageHeading>
        <TypographyP className="mx-auto mt-2 max-w-lg">
          Select as many as you want.
        </TypographyP>

        <div className="mx-auto mt-4 grid max-w-3xl gap-4">
          {choices.map((choice) => (
            <button
              className={cn(
                "flex min-h-24 items-center gap-4 rounded-xl border bg-card p-4 text-left text-card-foreground shadow-sm transition-all",
                selectedChoices.get(choice.value) &&
                  "border-blue-600 ring-2 ring-blue-100"
              )}
              key={choice.value}
              onClick={() => {
                setSelectedChoices((prev) =>
                  new Map(prev).set(choice.value, !prev.get(choice.value))
                );
              }}
              type="button"
            >
              <IconCircle size="sm">{choice.icon}</IconCircle>

              <div>
                <div className="font-medium">{choice.label}</div>
                <MutedText>{choice.description}</MutedText>
              </div>
            </button>
          ))}
        </div>

        <div className="mx-auto mt-6 flex w-full max-w-xs">
          <Button
            className="w-full"
            onClick={() => {
              // Get all selected features (only the ones that are true)
              const features = Array.from(selectedChoices.entries())
                .filter(([_, isSelected]) => isSelected)
                .map(([label]) => label);

              // Fire and forget - don't block navigation
              saveOnboardingFeaturesAction({ features });

              onNext();
            }}
            type="button"
          >
            Continue
            <ArrowRightIcon className="ml-2 size-4" />
          </Button>
        </div>
      </div>
    </OnboardingWrapper>
  );
}
