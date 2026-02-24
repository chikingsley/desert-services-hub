"use client";

import { ArrowRightIcon, UsersIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { IconCircle } from "@/app/(app)/[emailAccountId]/onboarding/IconCircle";
import { OnboardingWrapper } from "@/app/(app)/[emailAccountId]/onboarding/OnboardingWrapper";
import { TagInput } from "@/components/TagInput";
import { toastError, toastSuccess } from "@/components/Toast";
import { PageHeading, TypographyP } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import {
  createOrganizationAndInviteAction,
  inviteMemberAction,
} from "@/utils/actions/organization";
import { isValidEmail } from "@/utils/email";

export function StepInviteTeam({
  emailAccountId,
  organizationId,
  userName,
  onNext,
}: {
  emailAccountId: string;
  organizationId?: string;
  userName?: string | null;
  onNext: () => void;
}) {
  const [emails, setEmails] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleEmailsChange = useCallback((newEmails: string[]) => {
    setEmails(newEmails.map((e) => e.toLowerCase()));
  }, []);

  const handleInviteAndContinue = useCallback(async () => {
    if (emails.length === 0) {
      return;
    }

    setIsSubmitting(true);

    if (!organizationId) {
      const result = await createOrganizationAndInviteAction(emailAccountId, {
        emails,
        userName,
      });

      setIsSubmitting(false);

      if (result?.serverError || result?.validationErrors) {
        toastError({
          description: "Failed to create organization and send invitations",
        });
        return;
      }

      if (result?.data) {
        const successCount = result.data.results.filter(
          (r) => r.success
        ).length;
        const errorCount = result.data.results.filter((r) => !r.success).length;

        if (successCount > 0) {
          toastSuccess({
            description: `${successCount} invitation${successCount > 1 ? "s" : ""} sent successfully!`,
          });
        }
        if (errorCount > 0) {
          toastError({
            description: `Failed to send ${errorCount} invitation${errorCount > 1 ? "s" : ""}`,
          });
        }
        onNext();
      }

      return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (const email of emails) {
      const result = await inviteMemberAction({
        email,
        role: "member",
        organizationId,
      });

      if (result?.serverError || result?.validationErrors) {
        errorCount++;
      } else {
        successCount++;
      }
    }

    setIsSubmitting(false);

    if (successCount > 0) {
      toastSuccess({
        description: `${successCount} invitation${successCount > 1 ? "s" : ""} sent successfully!`,
      });
    }

    if (errorCount > 0) {
      toastError({
        description: `Failed to send ${errorCount} invitation${errorCount > 1 ? "s" : ""}`,
      });
    }

    if (successCount > 0) {
      onNext();
    }
  }, [emails, emailAccountId, organizationId, userName, onNext]);

  return (
    <OnboardingWrapper className="py-0">
      <IconCircle className="mx-auto" size="lg">
        <UsersIcon className="size-6" />
      </IconCircle>

      <div className="mt-4 text-center">
        <PageHeading>Invite your team</PageHeading>
        <TypographyP className="mx-auto mt-2 max-w-lg">
          Collaborate with your team on Inbox Zero. You can always add more
          members later.
        </TypographyP>

        <TagInput
          className="mx-auto mt-6 max-w-md text-left"
          id="email-input"
          label="Email addresses"
          onChange={handleEmailsChange}
          placeholder="Enter email addresses separated by commas"
          validate={(email) =>
            isValidEmail(email) ? null : "Please enter a valid email address"
          }
          value={emails}
        />

        <div className="mx-auto mt-6 flex w-full max-w-xs flex-col gap-2">
          <Button
            className="w-full"
            disabled={emails.length === 0}
            loading={isSubmitting}
            onClick={handleInviteAndContinue}
            type="button"
          >
            Invite & Continue
            <ArrowRightIcon className="ml-2 size-4" />
          </Button>
          <Button
            className="w-full"
            disabled={isSubmitting}
            onClick={onNext}
            type="button"
            variant="ghost"
          >
            Skip
          </Button>
        </div>
      </div>
    </OnboardingWrapper>
  );
}
