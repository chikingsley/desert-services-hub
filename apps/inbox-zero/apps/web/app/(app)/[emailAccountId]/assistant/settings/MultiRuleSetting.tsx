"use client";

import { useAction } from "next-safe-action/hooks";
import { useCallback } from "react";
import { LoadingContent } from "@/components/LoadingContent";
import { SettingCard } from "@/components/SettingCard";
import { toastError } from "@/components/Toast";
import { Toggle } from "@/components/Toggle";
import { Skeleton } from "@/components/ui/skeleton";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { enableMultiRuleSelectionAction } from "@/utils/actions/rule";
import { getActionErrorMessage } from "@/utils/error";

export function MultiRuleSetting() {
  const { data, isLoading, error, mutate } = useEmailAccountFull();

  const { execute } = useAction(
    enableMultiRuleSelectionAction.bind(null, data?.id ?? ""),
    {
      onSuccess: () => {
        mutate();
      },
      onError: (error) => {
        mutate();
        toastError({
          description: getActionErrorMessage(error.error, {
            prefix: "There was an error",
          }),
        });
      },
    }
  );

  const enabled = data?.multiRuleSelectionEnabled ?? false;

  const handleToggle = useCallback(
    (enable: boolean) => {
      if (!data) {
        return;
      }

      const optimisticData = {
        ...data,
        multiRuleSelectionEnabled: enable,
      };
      mutate(optimisticData, false);

      execute({ enable });
    },
    [data, mutate, execute]
  );

  return (
    <SettingCard
      description="Allow the AI to select multiple rules for a single email when appropriate."
      right={
        <LoadingContent
          error={error}
          loading={isLoading}
          loadingComponent={<Skeleton className="h-8 w-32" />}
        >
          <Toggle
            disabled={isLoading}
            enabled={enabled}
            name="multi-rule-selection"
            onChange={handleToggle}
          />
        </LoadingContent>
      }
      title="Multi-rule selection"
    />
  );
}
