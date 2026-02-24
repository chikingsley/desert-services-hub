"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { OnboardingWrapper } from "@/app/(app)/[emailAccountId]/onboarding/OnboardingWrapper";
import { useAccount } from "@/providers/EmailAccountProvider";
import { prefixPath } from "@/utils/path";
import { StepConnectCalendar } from "./StepConnectCalendar";
import { StepReady } from "./StepReady";
import { StepSendTestBrief } from "./StepSendTestBrief";

const TOTAL_STEPS = 3;

interface MeetingBriefsOnboardingContentProps {
  step: number;
}

export function MeetingBriefsOnboardingContent({
  step,
}: MeetingBriefsOnboardingContentProps) {
  const { emailAccountId } = useAccount();
  const router = useRouter();

  const clampedStep = Math.min(Math.max(step, 1), TOTAL_STEPS);

  const onNext = useCallback(async () => {
    if (clampedStep < TOTAL_STEPS) {
      const nextStep = clampedStep + 1;
      router.push(
        prefixPath(emailAccountId, `/onboarding-brief?step=${nextStep}`)
      );
    }
  }, [router, emailAccountId, clampedStep]);

  return (
    <OnboardingWrapper>
      {clampedStep === 1 && <StepConnectCalendar onNext={onNext} />}
      {clampedStep === 2 && <StepSendTestBrief onNext={onNext} />}
      {clampedStep === 3 && <StepReady />}
    </OnboardingWrapper>
  );
}
