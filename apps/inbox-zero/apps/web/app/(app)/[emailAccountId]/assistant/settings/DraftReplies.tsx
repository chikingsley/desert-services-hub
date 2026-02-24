"use client";

import { useCallback } from "react";
import { LoadingContent } from "@/components/LoadingContent";
import { SettingCard } from "@/components/SettingCard";
import { toastError } from "@/components/Toast";
import { Toggle } from "@/components/Toggle";
import { Skeleton } from "@/components/ui/skeleton";
import { ActionType, SystemType } from "@/generated/prisma/enums";
import { useRules } from "@/hooks/useRules";
import { useAccount } from "@/providers/EmailAccountProvider";
import { enableDraftRepliesAction } from "@/utils/actions/rule";

export function DraftReplies() {
  const { enabled, toggleDraftReplies, loading, error } = useDraftReplies();

  const handleToggle = useCallback(
    async (enable: boolean) => {
      try {
        await toggleDraftReplies(enable);
      } catch (error) {
        toastError({
          description: `There was an error: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    },
    [toggleDraftReplies]
  );

  return (
    <SettingCard
      description="Automatically draft replies written in your tone to emails needing a reply."
      right={
        <LoadingContent
          error={error}
          loading={loading}
          loadingComponent={<Skeleton className="h-8 w-32" />}
        >
          <Toggle
            enabled={enabled}
            name="draft-replies"
            onChange={handleToggle}
          />
        </LoadingContent>
      }
      title="Auto draft replies"
    />
  );
}

export function useDraftReplies() {
  const { data, mutate, isLoading, error } = useRules();
  const { emailAccountId } = useAccount();

  const toReplyRule = data?.find(
    (rule) => rule.systemType === SystemType.TO_REPLY
  );
  const isEnabled = toReplyRule?.actions.some(
    (action) => action.type === ActionType.DRAFT_EMAIL
  );

  const toggleDraftReplies = useCallback(
    async (enable: boolean) => {
      if (!data) {
        return;
      }

      const optimisticData = data.map((rule) => {
        if (rule.systemType === SystemType.TO_REPLY) {
          return {
            ...rule,
            actions: enable
              ? rule.actions.some(
                  (action) => action.type === ActionType.DRAFT_EMAIL
                )
                ? rule.actions
                : [
                    ...rule.actions,
                    {
                      id: `temp-${Date.now()}`, // Temporary ID for optimistic update
                      type: ActionType.DRAFT_EMAIL,
                      ruleId: rule.id,
                      label: null,
                      labelId: null,
                      subject: null,
                      content: null,
                      to: null,
                      cc: null,
                      bcc: null,
                      url: null,
                      delayInMinutes: null,
                      folderName: null,
                      folderId: null,
                      createdAt: new Date(),
                      updatedAt: new Date(),
                    },
                  ]
              : // Remove DRAFT_EMAIL action if disabling
                rule.actions.filter(
                  (action) => action.type !== ActionType.DRAFT_EMAIL
                ),
          };
        }
        return rule;
      });

      // Update SWR cache optimistically
      mutate(optimisticData, false);

      try {
        // Call the actual API
        const result = await enableDraftRepliesAction(emailAccountId, {
          enable,
        });

        mutate();

        return result;
      } catch (error) {
        // On error, revert the optimistic update
        mutate();
        throw error;
      }
    },
    [data, mutate, emailAccountId]
  );

  return {
    enabled: isEnabled ?? false,
    toggleDraftReplies,
    loading: isLoading,
    error,
  };
}
