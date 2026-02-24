"use client";

import { HashIcon, LockIcon, MailIcon, MessageSquareIcon } from "lucide-react";
import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { LoadingContent } from "@/components/LoadingContent";
import { toastError, toastSuccess } from "@/components/Toast";
import { Toggle } from "@/components/Toggle";
import { MutedText } from "@/components/Typography";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MessagingProvider } from "@/generated/prisma/enums";
import { useMeetingBriefSettings } from "@/hooks/useMeetingBriefs";
import {
  useChannelTargets,
  useMessagingChannels,
} from "@/hooks/useMessagingChannels";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  updateChannelFeaturesAction,
  updateEmailDeliveryAction,
  updateSlackChannelAction,
} from "@/utils/actions/messaging-channels";
import { getActionErrorMessage } from "@/utils/error";
import { prefixPath } from "@/utils/path";

const PROVIDER_CONFIG: Record<
  MessagingProvider,
  {
    name: string;
    icon: typeof MessageSquareIcon;
    targetPrefix: string;
  }
> = {
  SLACK: { name: "Slack", icon: HashIcon, targetPrefix: "#" },
};

export function DeliveryChannelsSetting() {
  const { emailAccountId } = useAccount();
  const {
    data: briefSettings,
    isLoading: isLoadingBriefSettings,
    mutate: mutateBriefSettings,
  } = useMeetingBriefSettings();
  const {
    data: channelsData,
    isLoading: isLoadingChannels,
    error: channelsError,
    mutate: mutateChannels,
  } = useMessagingChannels();

  const { execute: executeEmailDelivery } = useAction(
    updateEmailDeliveryAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Settings saved" });
        mutateBriefSettings();
      },
      onError: (error) => {
        toastError({
          description: getActionErrorMessage(error.error) ?? "Failed to update",
        });
      },
    }
  );

  const connectedChannels =
    channelsData?.channels.filter((c) => c.isConnected) ?? [];

  const hasSlack = connectedChannels.some((c) => c.provider === "SLACK");
  const slackAvailable =
    channelsData?.availableProviders?.includes("SLACK") ?? false;

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div>
          <h3 className="font-medium">Delivery Channels</h3>
          <MutedText>Choose where to receive meeting briefings</MutedText>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <MailIcon className="h-5 w-5 text-muted-foreground" />
            <div className="flex-1 font-medium text-sm">Email</div>
            <Toggle
              disabled={isLoadingBriefSettings}
              enabled={briefSettings?.meetingBriefsSendEmail ?? true}
              name="emailDelivery"
              onChange={(sendEmail) => executeEmailDelivery({ sendEmail })}
            />
          </div>

          <LoadingContent error={channelsError} loading={isLoadingChannels}>
            {connectedChannels.map((channel) => (
              <ChannelRow
                channel={channel}
                emailAccountId={emailAccountId}
                key={channel.id}
                onUpdate={mutateChannels}
              />
            ))}
          </LoadingContent>

          {!(isLoadingChannels || hasSlack) && slackAvailable && (
            <MutedText className="text-xs">
              Want to receive briefs in Slack?{" "}
              <Link
                className="text-foreground underline"
                href={prefixPath(emailAccountId, "/settings")}
              >
                Connect Slack in Settings
              </Link>
            </MutedText>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ChannelRow({
  channel,
  emailAccountId,
  onUpdate,
}: {
  channel: {
    id: string;
    provider: MessagingProvider;
    channelId: string | null;
    channelName: string | null;
    sendMeetingBriefs: boolean;
  };
  emailAccountId: string;
  onUpdate: () => void;
}) {
  const config = PROVIDER_CONFIG[channel.provider];
  const Icon = config?.icon ?? MessageSquareIcon;
  const [selectingTarget, setSelectingTarget] = useState(!channel.channelId);

  const {
    data: targetsData,
    isLoading: isLoadingTargets,
    error: targetsError,
  } = useChannelTargets(selectingTarget ? channel.id : null);

  const privateTargets = targetsData?.targets.filter((t) => t.isPrivate);

  const { execute: executeTarget } = useAction(
    updateSlackChannelAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Slack channel updated" });
        setSelectingTarget(false);
        onUpdate();
      },
      onError: (error) => {
        toastError({
          description: getActionErrorMessage(error.error) ?? "Failed to update",
        });
      },
    }
  );

  const { execute: executeFeatures } = useAction(
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
    <div className="flex items-center gap-3">
      <Icon className="h-5 w-5 text-muted-foreground" />
      <div className="flex-1">
        {!channel.channelId || selectingTarget ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">
                {config?.name ?? channel.provider}
              </span>
              <Select
                disabled={isLoadingTargets || !!targetsError}
                onValueChange={(value) => {
                  const target = privateTargets?.find((t) => t.id === value);
                  if (target) {
                    executeTarget({
                      channelId: channel.id,
                      targetId: target.id,
                      targetName: target.name,
                    });
                  }
                }}
              >
                <SelectTrigger className="h-8 w-48 text-xs">
                  <SelectValue
                    placeholder={
                      targetsError
                        ? "Failed to load channels"
                        : isLoadingTargets
                          ? "Loading channels..."
                          : "Select private channel"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {privateTargets?.map((target) => (
                    <SelectItem key={target.id} value={target.id}>
                      <LockIcon className="mr-1 inline h-3 w-3" />
                      {target.name}
                    </SelectItem>
                  ))}
                  {!isLoadingTargets &&
                    privateTargets &&
                    privateTargets.length === 0 && (
                      <div className="px-2 py-1.5 text-muted-foreground text-xs">
                        No private channels found. Create one and invite the bot
                        first.
                      </div>
                    )}
                </SelectContent>
              </Select>
            </div>
            {!isLoadingTargets && (
              <MutedText className="text-xs">
                Create a private Slack channel, then type{" "}
                <code className="rounded bg-muted px-1">
                  /invite @InboxZero
                </code>{" "}
                in it. The channel will appear above once the bot is invited.
              </MutedText>
            )}
          </div>
        ) : (
          <button
            className="text-left font-medium text-sm hover:underline"
            onClick={() => setSelectingTarget(true)}
            title="Change channel"
            type="button"
          >
            {config?.name ?? channel.provider}{" "}
            <span className="font-normal text-muted-foreground">
              &middot; {config?.targetPrefix}
              {channel.channelName}
            </span>
          </button>
        )}
      </div>

      {channel.channelId && !selectingTarget && (
        <Toggle
          enabled={channel.sendMeetingBriefs}
          name={`briefs-${channel.id}`}
          onChange={(sendMeetingBriefs) =>
            executeFeatures({
              channelId: channel.id,
              sendMeetingBriefs,
            })
          }
        />
      )}
    </div>
  );
}
