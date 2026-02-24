"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { Properties } from "posthog-js";
import { usePostHog } from "posthog-js/react";
import { useCallback, useEffect, useState } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { survey } from "@/app/(landing)/welcome/survey";
import { Input } from "@/components/Input";
import { usePremium } from "@/components/PremiumAlert";
import { Button } from "@/components/ui/button";
import { env } from "@/env";
import { useOnboardingAnalytics } from "@/hooks/useAnalytics";
import { useSignUpEvent } from "@/hooks/useSignupEvent";
import {
  completedOnboardingAction,
  saveOnboardingAnswersAction,
} from "@/utils/actions/onboarding";

const surveyId = env.NEXT_PUBLIC_POSTHOG_ONBOARDING_SURVEY_ID;

type Inputs = Record<"$survey_response" | `$survey_response_${number}`, string>;

export const OnboardingForm = (props: { questionIndex: number }) => {
  const { questionIndex } = props;

  const posthog = usePostHog();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showOtherInput, setShowOtherInput] = useState(false);
  const { isPremium } = usePremium();

  const analytics = useOnboardingAnalytics("welcome");

  useSignUpEvent();

  useEffect(() => {
    analytics.onStart();
  }, [analytics]);

  const {
    register,
    handleSubmit,
    watch,
    getValues,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Inputs>();

  const name =
    questionIndex === 0
      ? "$survey_response"
      : (`$survey_response_${questionIndex}` as const);

  const isFinalQuestion = questionIndex === survey.questions.length - 1;

  const submitPosthog = useCallback(
    (responses: Properties) => {
      analytics.onComplete();
      posthog.capture("survey sent", { ...responses, $survey_id: surveyId });
    },
    [posthog, analytics]
  );

  const onSubmit: SubmitHandler<Inputs> = useCallback(
    async (data) => {
      const answer = data[name];

      // ask user to fill in other input
      if (answer === "Other") {
        setShowOtherInput(true);
        setValue(name, "");
        return;
      }
      setShowOtherInput(false);

      const newSeachParams = new URLSearchParams(searchParams);
      newSeachParams.set("question", (questionIndex + 1).toString());
      newSeachParams.set(name, answer);

      analytics.onNext(questionIndex + 1);

      const responses = getResponses(newSeachParams);
      await saveOnboardingAnswersAction({
        surveyId,
        questions: survey.questions,
        answers: responses,
      });

      // submit on last question
      if (isFinalQuestion) {
        submitPosthog(responses);
        await completedOnboardingAction();

        if (isPremium) {
          router.push("/setup");
        } else {
          router.push("/welcome-upgrade");
        }
      } else {
        router.push(`/welcome?${newSeachParams}`);
      }
    },
    [
      name,
      questionIndex,
      router,
      searchParams,
      submitPosthog,
      setValue,
      isFinalQuestion,
      analytics,
      isPremium,
    ]
  );

  const question = survey.questions[questionIndex];

  return (
    <form className="flex justify-center" onSubmit={handleSubmit(onSubmit)}>
      <div>
        <div className="my-4 text-lg">{question.question}</div>
        {question.choices && (
          <div className="grid gap-2">
            {question.choices?.map((answer) => (
              <Button
                key={answer}
                onClick={(e) => {
                  if (question.type === "multiple_choice") {
                    const values = new Set(getValues(name)?.split(","));
                    if (values.has(answer)) {
                      values.delete(answer);
                    } else {
                      values.add(answer);
                    }

                    const newValue = Array.from(values).join(",");
                    setValue(name, newValue);
                  } else {
                    setValue(name, answer);
                    handleSubmit(onSubmit)(e);
                  }
                }}
                type="button"
                // quick and dirty radio button implementation
                variant={
                  watch(name)?.includes(answer) ? "secondary" : "outline"
                }
              >
                {answer}
              </Button>
            ))}

            {showOtherInput && (
              <Input
                error={errors[name]}
                name={name}
                registerProps={register(name)}
                type="text"
              />
            )}
          </div>
        )}
        {question.type === "open" && (
          <div>
            <Input
              autosizeTextarea
              error={errors[name]}
              name={name}
              placeholder="Optional"
              registerProps={register(name)}
              rows={3}
              type="text"
            />
            <Button
              className="mt-4 w-full"
              loading={isSubmitting}
              type="submit"
            >
              Get Started
            </Button>
          </div>
        )}

        {(question.type === "multiple_choice" ||
          showOtherInput ||
          question.skippable) && (
          <Button className="mt-4 w-full" loading={isSubmitting} type="submit">
            {question.skippable ? "Skip" : "Next"}
          </Button>
        )}

        {/* {!isFinalQuestion && (
          <SkipOnboardingButton
            searchParams={searchParams}
            submitPosthog={submitPosthog}
            posthog={posthog}
            router={router}
          />
        )} */}
      </div>
    </form>
  );
};

// function SkipOnboardingButton({
//   searchParams,
//   submitPosthog,
//   posthog,
//   router,
// }: {
//   searchParams: URLSearchParams;
//   submitPosthog: (responses: Properties) => void;
//   posthog: PostHog;
//   router: AppRouterInstance;
// }) {
//   // // A/B test whether to show skip onboarding button
//   // if (posthog.getFeatureFlag("show-skip-onboarding-button") === "hide")
//   //   return null;

//   return (
//     <Button
//       variant="ghost"
//       className="mt-8"
//       type="button"
//       onClick={async () => {
//         const responses = getResponses(searchParams);
//         submitPosthog(responses);
//         posthog.capture("survey dismissed", { $survey_id: surveyId });
//         await completedOnboardingAction();
//         router.push("/setup");
//       }}
//     >
//       Skip Onboarding
//     </Button>
//   );
// }

function getResponses(seachParams: URLSearchParams): Record<string, string> {
  const responses = survey.questions.reduce(
    (acc, _q, i) => {
      const name =
        i === 0 ? "$survey_response" : (`$survey_response_${i}` as const);
      acc[name] = seachParams.get(name) ?? "";
      return acc;
    },
    {} as Record<string, string>
  );

  return responses;
}
