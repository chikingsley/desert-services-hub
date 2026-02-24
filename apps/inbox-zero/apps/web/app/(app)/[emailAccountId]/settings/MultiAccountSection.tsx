"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { capitalCase } from "capital-case";
import { CrownIcon } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { usePostHog } from "posthog-js/react";
import { useCallback } from "react";
import { type SubmitHandler, useFieldArray, useForm } from "react-hook-form";
import useSWR from "swr";
import { usePremiumModal } from "@/app/(app)/premium/PremiumModal";
import type { MultiAccountEmailsResponse } from "@/app/api/user/settings/multi-account/route";
import {
  type SaveMultiAccountPremiumBody,
  saveMultiAccountPremiumBody,
} from "@/app/api/user/settings/multi-account/validation";
import { AlertBasic, AlertWithButton } from "@/components/Alert";
import { Input } from "@/components/Input";
import { LoadingContent } from "@/components/LoadingContent";
import { usePremium } from "@/components/PremiumAlert";
import { SettingsSection } from "@/components/SettingsSection";
import { toastError, toastSuccess } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import type { PremiumTier } from "@/generated/prisma/enums";
import {
  claimPremiumAdminAction,
  updateMultiAccountPremiumAction,
} from "@/utils/actions/premium";
import { useSession } from "@/utils/auth-client";
import { getActionErrorMessage } from "@/utils/error";
import { getUserTier, isAdminForPremium } from "@/utils/premium";

export function MultiAccountSection() {
  const { data: session } = useSession();
  const { data, isLoading, error, mutate } = useSWR<MultiAccountEmailsResponse>(
    "/api/user/settings/multi-account"
  );
  const {
    isPremium,
    premium,
    isLoading: isLoadingPremium,
    error: errorPremium,
  } = usePremium();

  const premiumTier = getUserTier(premium);

  const { openModal, PremiumModal } = usePremiumModal();

  const { execute: claimPremiumAdmin } = useAction(claimPremiumAdminAction, {
    onSuccess: () => {
      toastSuccess({ description: "Admin claimed!" });
      mutate();
    },
    onError: (error) => {
      toastError({
        description: getActionErrorMessage(error.error, {
          prefix: "Failed to claim premium admin",
        }),
      });
    },
  });

  if (
    isPremium &&
    !isAdminForPremium(data?.admins || [], session?.user.id || "")
  ) {
    return null;
  }

  return (
    <SettingsSection
      className="space-y-4"
      description="Grant premium access to additional email accounts. Additional members are billed to your subscription. Each account maintains separate email privacy."
      id="manage-users"
      title="Manage Team Access"
    >
      <LoadingContent error={errorPremium} loading={isLoadingPremium}>
        {isPremium ? (
          <LoadingContent error={error} loading={isLoading}>
            {data && (
              <div>
                {!data.admins.length && (
                  <div className="mb-4">
                    <Button onClick={() => claimPremiumAdmin()}>
                      Claim Admin
                    </Button>
                  </div>
                )}

                {premiumTier && (
                  <ExtraSeatsAlert
                    emailAccountsAccess={premium?.emailAccountsAccess || 0}
                    premiumTier={premiumTier}
                    seatsUsed={data.emailAccounts.length}
                  />
                )}

                <div className="mt-4">
                  <MultiAccountForm
                    emailAccountsAccess={premium?.emailAccountsAccess || 0}
                    emailAddresses={data.emailAccounts}
                    isLifetime={premium?.tier === "LIFETIME"}
                    onUpdate={mutate}
                    pendingInvites={premium?.pendingInvites || []}
                  />
                </div>
              </div>
            )}
          </LoadingContent>
        ) : (
          <AlertWithButton
            button={<Button onClick={openModal}>Upgrade</Button>}
            description="Upgrade to premium to share premium with other email addresses."
            icon={<CrownIcon className="h-4 w-4" />}
            title="Upgrade"
          />
        )}
      </LoadingContent>
      <PremiumModal />
    </SettingsSection>
  );
}

function MultiAccountForm({
  emailAddresses,
  isLifetime,
  emailAccountsAccess,
  pendingInvites,
  onUpdate,
}: {
  emailAddresses: { email: string; isOwnAccount: boolean }[];
  isLifetime: boolean;
  emailAccountsAccess: number;
  pendingInvites: string[];
  onUpdate?: () => void;
}) {
  const teamAccounts = emailAddresses.filter((e) => !e.isOwnAccount);

  const {
    register,
    handleSubmit,
    formState: { errors },
    control,
  } = useForm<SaveMultiAccountPremiumBody>({
    resolver: zodResolver(saveMultiAccountPremiumBody),
    defaultValues: {
      emailAddresses: (() => {
        const existingEmails = new Set(teamAccounts.map((e) => e.email));
        const uniquePendingInvites = pendingInvites.filter(
          (email) => !existingEmails.has(email)
        );
        const initialEmails = [
          ...teamAccounts.map((e) => ({ email: e.email })),
          ...uniquePendingInvites.map((email) => ({ email })),
        ];
        return initialEmails.length ? initialEmails : [{ email: "" }];
      })(),
    },
  });

  const { fields, append, remove } = useFieldArray({
    name: "emailAddresses",
    control,
  });
  const posthog = usePostHog();

  const extraSeats = fields.length - emailAccountsAccess - 1;
  const needsToPurchaseMoreSeats = isLifetime && extraSeats > 0;

  const { execute: updateMultiAccountPremium, isExecuting } = useAction(
    updateMultiAccountPremiumAction,
    {
      onSuccess: () => {
        toastSuccess({ description: "Users updated!" });
        onUpdate?.();
      },
      onError: (error) => {
        toastError({
          description: getActionErrorMessage(error.error, {
            prefix: "Failed to update users",
          }),
        });
      },
    }
  );

  const onSubmit: SubmitHandler<SaveMultiAccountPremiumBody> = useCallback(
    async (data) => {
      if (!data.emailAddresses || needsToPurchaseMoreSeats) {
        return;
      }

      const emails = data.emailAddresses
        .map((e) => e.email.trim())
        .filter((email) => email.length > 0);
      updateMultiAccountPremium({ emails });
    },
    [needsToPurchaseMoreSeats, updateMultiAccountPremium]
  );

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
      <div className="space-y-2">
        {fields.map((field, i) => (
          <Input
            error={errors.emailAddresses?.[i]?.email}
            key={field.id}
            name={`emailAddresses.${i}.email`}
            onClickAdd={() => {
              append({ email: "" });
              posthog.capture("Clicked Add User");
            }}
            onClickRemove={() => {
              remove(i);
              posthog.capture("Clicked Remove User");
              if (fields.length === 1) {
                append({ email: "" });
              }
            }}
            registerProps={register(`emailAddresses.${i}.email`)}
            type="text"
          />
        ))}
      </div>

      <Button loading={isExecuting} type="submit">
        Save
      </Button>
    </form>
  );
}

function ExtraSeatsAlert({
  emailAccountsAccess,
  premiumTier,
  seatsUsed,
}: {
  emailAccountsAccess: number;
  premiumTier: PremiumTier;
  seatsUsed: number;
}) {
  if (emailAccountsAccess > seatsUsed) {
    return (
      <AlertBasic
        description={`You have access to ${emailAccountsAccess} seats.`}
        icon={<CrownIcon className="h-4 w-4" />}
        title="Seats"
      />
    );
  }

  return (
    <AlertBasic
      description={`You are on the ${capitalCase(
        premiumTier
      )} plan. You will be billed for each additional team member you add to your account.`}
      icon={<CrownIcon className="h-4 w-4" />}
      title="Additional team member pricing"
    />
  );
}
