"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect } from "react";
import { StepBulkUnsubscribe } from "@/app/(app)/[emailAccountId]/onboarding/StepBulkUnsubscribe";
import { StepCompanySize } from "@/app/(app)/[emailAccountId]/onboarding/StepCompanySize";
import { StepCustomRules } from "@/app/(app)/[emailAccountId]/onboarding/StepCustomRules";
import { StepDraft } from "@/app/(app)/[emailAccountId]/onboarding/StepDraft";
import { StepDraftReplies } from "@/app/(app)/[emailAccountId]/onboarding/StepDraftReplies";
import { StepEmailsSorted } from "@/app/(app)/[emailAccountId]/onboarding/StepEmailsSorted";
import { StepFeatures } from "@/app/(app)/[emailAccountId]/onboarding/StepFeatures";
import { StepInboxProcessed } from "@/app/(app)/[emailAccountId]/onboarding/StepInboxProcessed";
import { StepInviteTeam } from "@/app/(app)/[emailAccountId]/onboarding/StepInviteTeam";
import { StepLabels } from "@/app/(app)/[emailAccountId]/onboarding/StepLabels";
import { StepWelcome } from "@/app/(app)/[emailAccountId]/onboarding/StepWelcome";
import { StepWho } from "@/app/(app)/[emailAccountId]/onboarding/StepWho";
import {
  STEP_KEYS,
  STEP_ORDER,
} from "@/app/(app)/[emailAccountId]/onboarding/steps";
import { usePremium } from "@/components/PremiumAlert";
import { useOnboardingAnalytics } from "@/hooks/useAnalytics";
import { useOrganizationMembership } from "@/hooks/useOrganizationMembership";
import { usePersona } from "@/hooks/usePersona";
import { useSignUpEvent } from "@/hooks/useSignupEvent";
import { useAccount } from "@/providers/EmailAccountProvider";
import { analyzePersonaAction } from "@/utils/actions/email-account";
import { completedOnboardingAction } from "@/utils/actions/onboarding";
import {
  ASSISTANT_ONBOARDING_COOKIE,
  markOnboardingAsCompleted,
} from "@/utils/cookies";
import { prefixPath } from "@/utils/path";
import { isDefined } from "@/utils/types";

interface OnboardingContentProps {
  step: number;
}

export function OnboardingContent({ step }: OnboardingContentProps) {
  const { emailAccountId, provider, isLoading } = useAccount();
  const { isPremium } = usePremium();
  const { data: membership, isLoading: isMembershipLoading } =
    useOrganizationMembership();

  useSignUpEvent();

  const canInviteTeam =
    (membership?.isOwner && membership?.organizationId) ||
    !(membership?.organizationId || membership?.hasPendingInvitationToOrg);

  const stepMap: Record<string, (() => React.ReactNode) | undefined> = {
    [STEP_KEYS.WELCOME]: () => <StepWelcome onNext={onNext} />,
    [STEP_KEYS.EMAILS_SORTED]: () => <StepEmailsSorted onNext={onNext} />,
    [STEP_KEYS.DRAFT_REPLIES]: () => <StepDraftReplies onNext={onNext} />,
    [STEP_KEYS.BULK_UNSUBSCRIBE]: () => <StepBulkUnsubscribe onNext={onNext} />,
    [STEP_KEYS.FEATURES]: () => <StepFeatures onNext={onNext} />,
    [STEP_KEYS.WHO]: () => (
      <StepWho
        emailAccountId={emailAccountId}
        initialRole={data?.role || data?.personaAnalysis?.persona}
        onNext={onNext}
      />
    ),
    [STEP_KEYS.COMPANY_SIZE]: () => <StepCompanySize onNext={onNext} />,
    [STEP_KEYS.LABELS]: () => (
      <StepLabels
        emailAccountId={emailAccountId}
        onNext={onNext}
        provider={provider}
      />
    ),
    [STEP_KEYS.DRAFT]: () => (
      <StepDraft
        emailAccountId={emailAccountId}
        onNext={onNext}
        provider={provider}
      />
    ),
    [STEP_KEYS.CUSTOM_RULES]: () => (
      <StepCustomRules onNext={onNext} provider={provider} />
    ),
    [STEP_KEYS.INVITE_TEAM]: canInviteTeam
      ? () => (
          <StepInviteTeam
            emailAccountId={emailAccountId}
            onNext={onNext}
            organizationId={membership?.organizationId ?? undefined}
            userName={membership?.userName}
          />
        )
      : undefined,
    [STEP_KEYS.INBOX_PROCESSED]: () => <StepInboxProcessed onNext={onNext} />,
  };

  const steps = STEP_ORDER.map((key) => stepMap[key]).filter(isDefined);

  const { data, mutate } = usePersona();
  const clampedStep = Math.min(Math.max(step, 1), steps.length);

  const router = useRouter();
  const analytics = useOnboardingAnalytics("onboarding");

  useEffect(() => {
    analytics.onStart();
  }, [analytics]);

  const onNext = useCallback(async () => {
    analytics.onNext(clampedStep);
    if (clampedStep < steps.length) {
      router.push(
        prefixPath(emailAccountId, `/onboarding?step=${clampedStep + 1}`)
      );
    } else {
      analytics.onComplete();
      markOnboardingAsCompleted(ASSISTANT_ONBOARDING_COOKIE);
      await completedOnboardingAction();
      if (isPremium) {
        router.push(prefixPath(emailAccountId, "/setup"));
      } else {
        router.push("/welcome-upgrade");
      }
    }
  }, [router, emailAccountId, analytics, clampedStep, steps.length, isPremium]);

  // Trigger persona analysis on mount (first step only)
  useEffect(() => {
    if (clampedStep === 1 && !data?.personaAnalysis) {
      // Run persona analysis in the background
      analyzePersonaAction(emailAccountId)
        .then(() => {
          mutate();
        })
        .catch((error) => {
          // Fail silently - persona analysis is optional enhancement
          console.error("Failed to analyze persona:", error);
        });
    }
  }, [clampedStep, emailAccountId, data?.personaAnalysis, mutate]);

  const renderStep = steps[clampedStep - 1] || steps[0];

  // Show loading if provider is needed but not loaded yet
  if (isLoading && !provider) {
    return null;
  }

  // Wait for membership data to load before determining steps
  if (isMembershipLoading) {
    return null;
  }

  return renderStep ? renderStep() : null;
}
