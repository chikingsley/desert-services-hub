"use client";

import { useAction } from "next-safe-action/hooks";
import { useCallback, useState } from "react";
import { DigestSettingsForm } from "@/app/(app)/[emailAccountId]/settings/DigestSettingsForm";
import { SettingCard } from "@/components/SettingCard";
import { toastError } from "@/components/Toast";
import { Toggle } from "@/components/Toggle";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { toggleDigestAction } from "@/utils/actions/settings";
import { createCanonicalTimeOfDay } from "@/utils/schedule";

export function DigestSetting() {
  const [open, setOpen] = useState(false);
  const { data, isLoading, mutate } = useEmailAccountFull();

  const enabled = data?.digestSchedule != null;

  const { execute: executeToggle } = useAction(
    toggleDigestAction.bind(null, data?.id ?? ""),
    {
      onError: (error) => {
        mutate();
        toastError({
          description: error.error?.serverError ?? "Failed to update settings",
        });
      },
    }
  );

  const handleToggle = useCallback(
    (enable: boolean) => {
      if (!data) {
        return;
      }

      const optimisticData = {
        ...data,
        digestSchedule: enable ? {} : null,
      };
      mutate(optimisticData as typeof data, false);
      executeToggle({
        enabled: enable,
        timeOfDay: enable ? createCanonicalTimeOfDay(9, 0) : undefined,
      });
    },
    [data, mutate, executeToggle]
  );

  return (
    <SettingCard
      description="Get a daily summary of your newsletter emails."
      right={
        isLoading ? (
          <Skeleton className="h-5 w-9" />
        ) : (
          <div className="flex items-center gap-2">
            {enabled && (
              <Dialog onOpenChange={setOpen} open={open}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline">
                    Configure
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] max-w-7xl overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Digest settings</DialogTitle>
                    <DialogDescription>
                      Configure when your digest emails are sent and which rules
                      are included.
                    </DialogDescription>
                  </DialogHeader>

                  <DigestSettingsForm onSuccess={() => setOpen(false)} />
                </DialogContent>
              </Dialog>
            )}
            <Toggle
              enabled={enabled}
              name="digest-enabled"
              onChange={handleToggle}
            />
          </div>
        )
      }
      title="Digest"
    />
  );
}
