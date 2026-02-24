"use client";

import { useAction } from "next-safe-action/hooks";
import { useCallback } from "react";
import { LoadingContent } from "@/components/LoadingContent";
import { toastError, toastSuccess } from "@/components/Toast";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import { Switch } from "@/components/ui/switch";
import { useOrganizationMembership } from "@/hooks/useOrganizationMembership";
import { updateAnalyticsConsentAction } from "@/utils/actions/organization";
import { getActionErrorMessage } from "@/utils/error";

export function OrgAnalyticsConsentSection({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const { data, isLoading, error, mutate } =
    useOrganizationMembership(emailAccountId);

  const { execute, isExecuting } = useAction(
    updateAnalyticsConsentAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Settings updated!" });
      },
      onError: (error) => {
        mutate();
        toastError({
          description: getActionErrorMessage(error.error, {
            prefix: "Failed to update settings",
          }),
        });
      },
      onSettled: () => {
        mutate();
      },
    }
  );

  const handleToggle = useCallback(
    (checked: boolean) => {
      if (!data) {
        return;
      }

      const optimisticData = {
        ...data,
        allowOrgAdminAnalytics: checked,
      };
      mutate(optimisticData, false);
      execute({ allowOrgAdminAnalytics: checked });
    },
    [data, execute, mutate]
  );

  if (!(isLoading || error || data?.organizationId)) {
    return null;
  }

  return (
    <LoadingContent error={error} loading={isLoading}>
      {data?.organizationId && (
        <>
          <ItemSeparator />
          <Item size="sm">
            <ItemContent>
              <ItemTitle>Organization Analytics</ItemTitle>
              <ItemDescription>
                {`Allow organization admins${data.organizationName ? ` from ${data.organizationName}` : ""} to view your usage`}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <Switch
                checked={data.allowOrgAdminAnalytics}
                disabled={isExecuting}
                onCheckedChange={handleToggle}
              />
            </ItemActions>
          </Item>
        </>
      )}
    </LoadingContent>
  );
}
