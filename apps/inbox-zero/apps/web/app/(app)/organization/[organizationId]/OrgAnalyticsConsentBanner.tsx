"use client";

import { ShieldCheckIcon } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { useCallback } from "react";
import { toastError, toastSuccess } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { ActionCard } from "@/components/ui/card";
import { useOrganizationMembership } from "@/hooks/useOrganizationMembership";
import { useAccount } from "@/providers/EmailAccountProvider";
import { updateAnalyticsConsentAction } from "@/utils/actions/organization";
import { getActionErrorMessage } from "@/utils/error";
import { hasOrganizationAdminRole } from "@/utils/organizations/roles";

export function OrgAnalyticsConsentBanner() {
  const { emailAccountId } = useAccount();
  const { data, isLoading, mutate } = useOrganizationMembership();

  const { execute, isPending } = useAction(
    updateAnalyticsConsentAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Analytics access granted to admins!" });
        mutate();
      },
      onError: (error) => {
        toastError({
          description: getActionErrorMessage(error.error, {
            prefix: "Failed to update settings",
          }),
        });
      },
    }
  );

  const handleAllow = useCallback(() => {
    execute({ allowOrgAdminAnalytics: true });
  }, [execute]);

  if (isLoading || !data?.organizationId || data.allowOrgAdminAnalytics) {
    return null;
  }

  const isAdmin = hasOrganizationAdminRole(data.role ?? "");

  const title = isAdmin
    ? "Include your analytics in organization stats"
    : "Allow organization admins to view your analytics";

  const description = `Your email analytics are currently private. Enable access to let${isAdmin ? " other " : " "}organization admins view your inbox statistics and usage data. This helps your team understand productivity and collaborate more effectively.`;

  return (
    <ActionCard
      action={
        <Button loading={isPending} onClick={handleAllow}>
          Allow Access
        </Button>
      }
      className="mt-6 max-w-full"
      description={description}
      icon={<ShieldCheckIcon className="h-4 w-4" />}
      title={title}
      variant="blue"
    />
  );
}
