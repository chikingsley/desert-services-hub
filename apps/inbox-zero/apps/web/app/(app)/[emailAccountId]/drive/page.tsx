"use client";

import { HashIcon } from "lucide-react";
import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import { parseAsBoolean, useQueryState } from "nuqs";
import { useCallback, useState } from "react";
import { LoadingContent } from "@/components/LoadingContent";
import { PageHeader } from "@/components/PageHeader";
import { PageWrapper } from "@/components/PageWrapper";
import { toastError, toastSuccess } from "@/components/Toast";
import { Toggle } from "@/components/Toggle";
import { MutedText } from "@/components/Typography";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { useDriveConnections } from "@/hooks/useDriveConnections";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { useMessagingChannels } from "@/hooks/useMessagingChannels";
import { useAccount } from "@/providers/EmailAccountProvider";
import { cn } from "@/utils";
import { updateFilingEnabledAction } from "@/utils/actions/drive";
import { updateChannelFeaturesAction } from "@/utils/actions/messaging-channels";
import { getActionErrorMessage } from "@/utils/error";
import { prefixPath } from "@/utils/path";
import { DriveConnections } from "./DriveConnections";
import { DriveOnboarding } from "./DriveOnboarding";
import { DriveSetup } from "./DriveSetup";
import { FilingActivity } from "./FilingActivity";
import { FilingPreferences } from "./FilingPreferences";

type DriveView = "onboarding" | "setup" | "settings";

export default function DrivePage() {
  const { emailAccountId } = useAccount();
  const { data, isLoading, error } = useDriveConnections();
  const {
    data: emailAccount,
    isLoading: emailLoading,
    error: emailError,
    mutate: mutateEmail,
  } = useEmailAccountFull();
  const [forceOnboarding] = useQueryState("onboarding", parseAsBoolean);
  const [forceSetup] = useQueryState("setup", parseAsBoolean);

  const hasConnections = (data?.connections?.length ?? 0) > 0;
  const filingEnabled = emailAccount?.filingEnabled ?? false;
  const [isSaving, setIsSaving] = useState(false);

  const view = getDriveView(
    hasConnections,
    filingEnabled,
    forceOnboarding,
    forceSetup
  );

  const handleToggle = useCallback(
    async (checked: boolean) => {
      setIsSaving(true);

      try {
        const result = await updateFilingEnabledAction(emailAccountId, {
          filingEnabled: checked,
        });

        if (result?.serverError) {
          toastError({
            title: "Error saving preferences",
            description: result.serverError,
          });
        } else {
          toastSuccess({ description: "Preferences saved" });
          mutateEmail();
        }
      } finally {
        setIsSaving(false);
      }
    },
    [emailAccountId, mutateEmail]
  );

  return (
    <PageWrapper>
      <LoadingContent
        error={error || emailError}
        loading={isLoading || emailLoading}
      >
        {view === "onboarding" && <DriveOnboarding />}
        {view === "setup" && <DriveSetup />}
        {view === "settings" && (
          <>
            <div className="flex items-center justify-between">
              <PageHeader title="Auto-file attachments" />
              <div className="flex items-center gap-3">
                <IntegrationsPopover emailAccountId={emailAccountId} />
                {!filingEnabled && <Badge variant="destructive">Paused</Badge>}
                <Switch
                  checked={filingEnabled}
                  disabled={isSaving}
                  onCheckedChange={handleToggle}
                />
              </div>
            </div>

            <div
              className={cn(
                "mt-6 space-y-4 transition-opacity duration-200",
                !filingEnabled && "pointer-events-none opacity-50"
              )}
            >
              <DriveConnections />
              <FilingPreferences />
              <FilingActivity />
            </div>
          </>
        )}
      </LoadingContent>
    </PageWrapper>
  );
}

function getDriveView(
  hasConnections: boolean,
  filingEnabled: boolean,
  forceOnboarding: boolean | null,
  forceSetup: boolean | null
): DriveView {
  if (forceOnboarding === true || !hasConnections) {
    return "onboarding";
  }
  if (forceSetup === true || (hasConnections && !filingEnabled)) {
    return "setup";
  }
  return "settings";
}

function IntegrationsPopover({ emailAccountId }: { emailAccountId: string }) {
  const { data, isLoading, mutate } = useMessagingChannels();

  const allConnected = data?.channels.filter((c) => c.isConnected) ?? [];
  const withChannel = allConnected.filter((c) => c.channelId);

  const availableProviders = data?.availableProviders ?? [];

  if (
    isLoading ||
    (allConnected.length === 0 && availableProviders.length === 0)
  ) {
    return null;
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">
          Integrations
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <div className="space-y-3">
          <div>
            <h4 className="font-medium text-sm">Integrations</h4>
            <MutedText className="text-xs">
              Send filing updates to connected apps
            </MutedText>
          </div>

          {withChannel.length > 0 ? (
            <div className="space-y-2">
              {withChannel.map((channel) => (
                <SlackChannelToggle
                  channel={channel}
                  emailAccountId={emailAccountId}
                  key={channel.id}
                  onUpdate={mutate}
                />
              ))}
            </div>
          ) : (
            <MutedText className="text-xs">
              Select a target channel in{" "}
              <Link
                className="text-foreground underline"
                href={prefixPath(emailAccountId, "/briefs")}
              >
                Meeting Briefs
              </Link>{" "}
              to enable Slack notifications.
            </MutedText>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SlackChannelToggle({
  channel,
  emailAccountId,
  onUpdate,
}: {
  channel: {
    id: string;
    channelName: string | null;
    sendDocumentFilings: boolean;
  };
  emailAccountId: string;
  onUpdate: () => void;
}) {
  const { execute } = useAction(
    updateChannelFeaturesAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Settings saved" });
        onUpdate();
      },
      onError: (error) => {
        toastError({
          description: getActionErrorMessage(error.error) ?? "Failed to update",
        });
      },
    }
  );

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <HashIcon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm">
          Slack
          {channel.channelName && (
            <span className="text-muted-foreground">
              {" "}
              &middot; #{channel.channelName}
            </span>
          )}
        </span>
      </div>
      <Toggle
        enabled={channel.sendDocumentFilings}
        name={`filing-${channel.id}`}
        onChange={(sendDocumentFilings) =>
          execute({ channelId: channel.id, sendDocumentFilings })
        }
      />
    </div>
  );
}
