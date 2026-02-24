"use client";

import { KeyIcon } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { toastError, toastSuccess } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { regenerateWebhookSecretAction } from "@/utils/actions/webhook";
import { getActionErrorMessage } from "@/utils/error";

export function RegenerateSecretButton({
  hasSecret,
  mutate,
}: {
  hasSecret: boolean;
  mutate: () => void;
}) {
  const { execute, isExecuting } = useAction(regenerateWebhookSecretAction, {
    onSuccess: () => {
      toastSuccess({
        description: "Webhook secret regenerated",
      });
    },
    onError: (error) => {
      toastError({
        description: getActionErrorMessage(error.error),
      });
    },
    onSettled: () => {
      mutate();
    },
  });

  return (
    <Button
      loading={isExecuting}
      onClick={() => execute()}
      size="sm"
      variant="outline"
    >
      <KeyIcon className="mr-2 size-4" />
      {hasSecret ? "Regenerate secret" : "Generate secret"}
    </Button>
  );
}
