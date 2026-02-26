"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRightIcon, SendIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { usersRolesInfo } from "@/app/(app)/[emailAccountId]/onboarding/config";
import { IconCircle } from "@/app/(app)/[emailAccountId]/onboarding/IconCircle";
import { OnboardingWrapper } from "@/app/(app)/[emailAccountId]/onboarding/OnboardingWrapper";
import { Input } from "@/components/Input";
import { ScrollableFadeContainer } from "@/components/ScrollableFadeContainer";
import { MutedText, PageHeading, TypographyP } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { cn } from "@/utils";
import { updateEmailAccountRoleAction } from "@/utils/actions/email-account";
import { saveOnboardingAnswersAction } from "@/utils/actions/onboarding";
import {
  type StepWhoSchema,
  stepWhoSchema,
} from "@/utils/actions/onboarding.validation";
import { USER_ROLES } from "@/utils/constants/user-roles";

export function StepWho({
  initialRole,
  emailAccountId,
  onNext,
}: {
  initialRole?: string | null;
  emailAccountId: string;
  onNext: () => void;
}) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [customRole, setCustomRole] = useState("");

  // Check if the initial role is not in our list (custom role)
  const isCustomRole =
    initialRole && !USER_ROLES.some((role) => role.value === initialRole);
  const defaultRole = isCustomRole ? "Other" : initialRole || "";

  const form = useForm<StepWhoSchema>({
    resolver: zodResolver(stepWhoSchema),
    defaultValues: { role: defaultRole },
  });
  const { watch, setValue } = form;
  const watchedRole = watch("role");

  // Initialize custom role if it's a custom value
  useEffect(() => {
    if (isCustomRole && initialRole) {
      setCustomRole(initialRole);
    }
  }, [isCustomRole, initialRole]);

  // Scroll to selected role on mount
  useEffect(() => {
    if (defaultRole && scrollContainerRef.current) {
      // Find the button with the selected role
      const selectedIndex = USER_ROLES.findIndex(
        (role) => role.value === defaultRole
      );
      if (selectedIndex !== -1) {
        const buttons = scrollContainerRef.current.querySelectorAll(
          'button[type="button"]'
        );
        const selectedButton = buttons[selectedIndex];
        if (selectedButton) {
          // Use setTimeout to ensure the DOM is ready
          setTimeout(() => {
            selectedButton.scrollIntoView({
              behavior: "smooth",
              block: "center",
            });
          }, 100);
        }
      }
    }
  }, [defaultRole]);

  return (
    <OnboardingWrapper>
      <div className="flex justify-center">
        <IconCircle size="lg">
          <SendIcon className="size-6" />
        </IconCircle>
      </div>

      <div className="text-center">
        <PageHeading className="mt-4">
          Let's understand how you use email
        </PageHeading>
        <TypographyP className="mt-2">
          Your role helps us design a smarter, clearer inbox with AI tailored
          just for you.
        </TypographyP>
      </div>

      <Form {...form}>
        <form
          className="mt-4 space-y-6"
          onSubmit={form.handleSubmit(async (values) => {
            const roleToSave =
              values.role === "Other" ? customRole : values.role;

            const updateEmailAccountRolePromise = updateEmailAccountRoleAction(
              emailAccountId,
              {
                role: roleToSave,
              }
            );

            // may deprecate this in the future, but to keep consistency with old data we're storing this too
            const saveOnboardingAnswersPromise = saveOnboardingAnswersAction({
              surveyId: "onboarding",
              questions: [{ key: "role", type: "single_choice" }],
              answers: { $survey_response: roleToSave },
            });

            await Promise.all([
              updateEmailAccountRolePromise,
              saveOnboardingAnswersPromise,
            ]);

            onNext();
          })}
        >
          <ScrollableFadeContainer
            className="grid gap-2 px-1 pt-6 pb-6"
            fadeFromClass="from-slate-50"
            ref={scrollContainerRef}
          >
            {Object.entries(usersRolesInfo).map(([roleName, role]) => {
              const Icon = role.icon;
              const description = USER_ROLES.find(
                (r) => r.value === roleName
              )?.description;

              return (
                <button
                  className={cn(
                    "flex items-center gap-4 rounded-xl border bg-card p-4 text-left text-card-foreground shadow-sm transition-all",
                    watchedRole === roleName &&
                      "border-blue-600 ring-2 ring-blue-100"
                  )}
                  key={roleName}
                  onClick={() => {
                    setValue("role", roleName);
                    if (roleName !== "Other") {
                      setCustomRole("");
                    }
                  }}
                  type="button"
                >
                  <IconCircle size="sm">
                    <Icon className="size-4" />
                  </IconCircle>

                  <div>
                    <div className="font-medium">{roleName}</div>
                    <MutedText>{description}</MutedText>
                  </div>
                </button>
              );
            })}
          </ScrollableFadeContainer>

          {watchedRole === "Other" && (
            <div className="px-1 pb-6">
              <Input
                className="w-full border-slate-300 px-4 py-3 text-lg transition-all focus:border-blue-600 focus:ring-blue-600"
                name="customRole"
                placeholder="Enter your role..."
                registerProps={{
                  value: customRole,
                  onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                    setCustomRole(e.target.value),
                  autoFocus: true,
                }}
                type="text"
              />
            </div>
          )}

          <div className="mx-auto flex w-full max-w-xs">
            <Button
              className="w-full"
              disabled={
                !watchedRole || (watchedRole === "Other" && !customRole.trim())
              }
              loading={form.formState.isSubmitting}
              type="submit"
            >
              Continue
              <ArrowRightIcon className="ml-2 size-4" />
            </Button>
          </div>
        </form>
      </Form>
    </OnboardingWrapper>
  );
}
