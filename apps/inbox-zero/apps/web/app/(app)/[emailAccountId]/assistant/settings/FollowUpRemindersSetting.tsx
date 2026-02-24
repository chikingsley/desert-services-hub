"use client";

import { useAction } from "next-safe-action/hooks";
import { useCallback, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Badge } from "@/components/Badge";
import { Input } from "@/components/Input";
import { SettingCard } from "@/components/SettingCard";
import { toastError, toastSuccess } from "@/components/Toast";
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
import { useActionTiming } from "@/hooks/useActionTiming";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { useFollowUpRemindersEnabled } from "@/hooks/useFeatureFlags";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  scanFollowUpRemindersAction,
  toggleFollowUpRemindersAction,
  updateFollowUpSettingsAction,
} from "@/utils/actions/follow-up-reminders";
import {
  DEFAULT_FOLLOW_UP_DAYS,
  type SaveFollowUpSettingsFormInput,
} from "@/utils/actions/follow-up-reminders.validation";
import { isGoogleProvider } from "@/utils/email/provider-types";
import { FOLLOW_UP_LABEL } from "@/utils/label";
import { getEmailTerminology } from "@/utils/terminology";
import { getGmailBasicSearchUrl } from "@/utils/url";

export function FollowUpRemindersSetting() {
  const isFeatureEnabled = useFollowUpRemindersEnabled();

  if (!isFeatureEnabled) {
    return null;
  }

  return <FollowUpRemindersSettingContent />;
}

function FollowUpRemindersSettingContent() {
  const [open, setOpen] = useState(false);
  const { data, isLoading, mutate } = useEmailAccountFull();

  const enabled =
    data?.followUpAwaitingReplyDays !== null ||
    data?.followUpNeedsReplyDays !== null;

  const { execute: executeToggle } = useAction(
    toggleFollowUpRemindersAction.bind(null, data?.id ?? ""),
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
        followUpAwaitingReplyDays: enable ? DEFAULT_FOLLOW_UP_DAYS : null,
        followUpNeedsReplyDays: enable ? DEFAULT_FOLLOW_UP_DAYS : null,
      };
      mutate(optimisticData as typeof data, false);
      executeToggle({ enabled: enable });
    },
    [data, mutate, executeToggle]
  );

  return (
    <SettingCard
      description="Get reminded when you haven't heard back or haven't replied."
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
                <FollowUpSettingsDialog
                  emailAccountId={data?.id ?? ""}
                  emailAddress={data?.email ?? ""}
                  followUpAutoDraftEnabled={
                    data?.followUpAutoDraftEnabled ?? true
                  }
                  followUpAwaitingReplyDays={data?.followUpAwaitingReplyDays}
                  followUpNeedsReplyDays={data?.followUpNeedsReplyDays}
                  onSuccess={() => {
                    mutate();
                    setOpen(false);
                  }}
                />
              </Dialog>
            )}
            <Toggle
              disabled={!data}
              enabled={enabled}
              name="follow-up-enabled"
              onChange={handleToggle}
            />
          </div>
        )
      }
      title="Follow-up reminders"
    />
  );
}

function FollowUpSettingsDialog({
  emailAccountId,
  emailAddress,
  followUpAwaitingReplyDays,
  followUpNeedsReplyDays,
  followUpAutoDraftEnabled,
  onSuccess,
}: {
  emailAccountId: string;
  emailAddress: string;
  followUpAwaitingReplyDays: number | null | undefined;
  followUpNeedsReplyDays: number | null | undefined;
  followUpAutoDraftEnabled: boolean;
  onSuccess: () => void;
}) {
  const { provider } = useAccount();
  const terminology = getEmailTerminology(provider);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<SaveFollowUpSettingsFormInput>({
    defaultValues: {
      followUpAwaitingReplyDays: followUpAwaitingReplyDays?.toString() ?? "",
      followUpNeedsReplyDays: followUpNeedsReplyDays?.toString() ?? "",
      followUpAutoDraftEnabled,
    },
  });

  const autoDraftValue = watch("followUpAutoDraftEnabled");
  const { start: startScanTiming, getElapsedMs: getScanElapsedMs } =
    useActionTiming();

  const { execute, isExecuting } = useAction(
    updateFollowUpSettingsAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Settings saved!" });
        onSuccess();
      },
      onError: (error) => {
        toastError({
          description: error.error?.serverError ?? "Failed to save settings",
        });
      },
    }
  );

  const { execute: executeScan, isExecuting: isScanning } = useAction(
    scanFollowUpRemindersAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        showScanCompleteToast(provider, emailAddress);
      },
      onError: (error) => {
        const ranForMinutes = getScanElapsedMs() > 4 * 60 * 1000;

        if (ranForMinutes) {
          showScanCompleteToast(provider, emailAddress);
        } else {
          toastError({
            description: error.error?.serverError ?? "Failed to scan",
          });
        }
      },
    }
  );

  const onSubmit = (formData: SaveFollowUpSettingsFormInput) => {
    execute({
      followUpAwaitingReplyDays: formData.followUpAwaitingReplyDays
        ? Number(formData.followUpAwaitingReplyDays)
        : null,
      followUpNeedsReplyDays: formData.followUpNeedsReplyDays
        ? Number(formData.followUpNeedsReplyDays)
        : null,
      followUpAutoDraftEnabled: formData.followUpAutoDraftEnabled,
    });
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Follow-up reminders</DialogTitle>
        <DialogDescription>
          Get reminded about conversations that need attention.
          <br />
          We'll add a <Badge color="blue">Follow-up</Badge>{" "}
          {terminology.label.singular} so you can easily find them.
        </DialogDescription>
      </DialogHeader>

      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
        <Input
          error={errors.followUpAwaitingReplyDays}
          label="Remind me when they haven't replied after"
          max={90}
          min={0.001}
          name="followUpAwaitingReplyDays"
          registerProps={register("followUpAwaitingReplyDays")}
          rightText="days"
          step={0.001}
          type="number"
        />

        <Input
          error={errors.followUpNeedsReplyDays}
          label="Remind me when I haven't replied after"
          max={90}
          min={0.001}
          name="followUpNeedsReplyDays"
          registerProps={register("followUpNeedsReplyDays")}
          rightText="days"
          step={0.001}
          type="number"
        />

        <div className="flex items-center justify-between">
          <div>
            <label
              className="block font-medium text-foreground text-sm"
              htmlFor="followUpAutoDraftEnabled"
            >
              Auto-generate drafts
            </label>
            <p className="text-muted-foreground text-sm">
              Draft a nudge when you haven't heard back.
            </p>
          </div>
          <Toggle
            enabled={autoDraftValue}
            name="followUpAutoDraftEnabled"
            onChange={(value) => setValue("followUpAutoDraftEnabled", value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <Button loading={isExecuting} size="sm" type="submit">
            Save
          </Button>
          <Button
            loading={isScanning}
            onClick={() => {
              startScanTiming();
              toast.info("Scanning your emails...", {
                description:
                  "This may take a few minutes depending on how many emails need to be checked.",
              });
              executeScan({});
            }}
            size="sm"
            type="button"
            variant="outline"
          >
            Find follow-ups
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}

function showScanCompleteToast(
  provider: string | undefined,
  emailAddress: string
) {
  if (isGoogleProvider(provider)) {
    const searchUrl = getGmailBasicSearchUrl(
      emailAddress,
      `label:${FOLLOW_UP_LABEL}`
    );
    toast.success("Scan complete!", {
      description: "View your follow-ups in Gmail.",
      action: {
        label: "View",
        onClick: () => window.open(searchUrl, "_blank"),
      },
    });
  } else {
    toast.success("Scan complete!", {
      description: `Look for the "${FOLLOW_UP_LABEL}" category in Outlook.`,
    });
  }
}
