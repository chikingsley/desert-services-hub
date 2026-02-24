"use client";

import {
  Building,
  Building2,
  Factory,
  Landmark,
  User,
  Users,
} from "lucide-react";
import { useCallback } from "react";
import { IconCircle } from "@/app/(app)/[emailAccountId]/onboarding/IconCircle";
import { OnboardingButton } from "@/app/(app)/[emailAccountId]/onboarding/OnboardingButton";
import { OnboardingWrapper } from "@/app/(app)/[emailAccountId]/onboarding/OnboardingWrapper";
import { toastError } from "@/components/Toast";
import { PageHeading, TypographyP } from "@/components/Typography";
import { saveOnboardingAnswersAction } from "@/utils/actions/onboarding";

const COMPANY_SIZES = [
  {
    value: 1,
    label: "Only me",
    icon: <User className="size-4" />,
  },
  {
    value: 5,
    label: "2-10 people",
    icon: <Users className="size-4" />,
  },
  {
    value: 50,
    label: "11-100 people",
    icon: <Building className="size-4" />,
  },
  {
    value: 500,
    label: "101-1000 people",
    icon: <Factory className="size-4" />,
  },
  {
    value: 1000,
    label: "1000+ people",
    icon: <Landmark className="size-4" />,
  },
];

export function StepCompanySize({ onNext }: { onNext: () => void }) {
  const onSelectCompanySize = useCallback(
    async (companySize: number) => {
      try {
        await saveOnboardingAnswersAction({
          surveyId: "onboarding",
          questions: [{ key: "company_size", type: "single_choice" }],
          answers: { $survey_response: companySize },
        });

        onNext();
      } catch (error) {
        console.error("Failed to save company size:", error);
        toastError({
          description:
            "There was an error saving your selection. Please try again.",
        });
      }
    },
    [onNext]
  );

  return (
    <OnboardingWrapper className="py-0">
      <IconCircle className="mx-auto" size="lg">
        <Building2 className="size-6" />
      </IconCircle>

      <div className="mt-4 text-center">
        <PageHeading>What's the size of your company?</PageHeading>
        <TypographyP className="mx-auto mt-2 max-w-lg">
          This helps us tailor the experience to your organization's needs.
        </TypographyP>
      </div>

      <div className="mt-6 grid gap-3">
        {COMPANY_SIZES.map((size) => (
          <OnboardingButton
            icon={size.icon}
            key={size.value}
            onClick={() => onSelectCompanySize(size.value)}
            text={size.label}
          />
        ))}
      </div>
    </OnboardingWrapper>
  );
}
