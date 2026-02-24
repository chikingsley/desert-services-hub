"use client";

import { useAction } from "next-safe-action/hooks";
import { DeliveryChannelsSetting } from "@/app/(app)/[emailAccountId]/briefs/DeliveryChannelsSetting";
import { IntegrationsSetting } from "@/app/(app)/[emailAccountId]/briefs/IntegrationsSetting";
import { BriefsOnboarding } from "@/app/(app)/[emailAccountId]/briefs/Onboarding";
import { TimeDurationSetting } from "@/app/(app)/[emailAccountId]/briefs/TimeDurationSetting";
import { UpcomingMeetings } from "@/app/(app)/[emailAccountId]/briefs/UpcomingMeetings";
import { LoadingContent } from "@/components/LoadingContent";
import { PageHeader } from "@/components/PageHeader";
import { PageWrapper } from "@/components/PageWrapper";
import { PremiumAlertWithData } from "@/components/PremiumAlert";
import { SettingCard } from "@/components/SettingCard";
import { toastError, toastSuccess } from "@/components/Toast";
import { Toggle } from "@/components/Toggle";
import { useCalendars } from "@/hooks/useCalendars";
import { useMeetingBriefSettings } from "@/hooks/useMeetingBriefs";
import { useAccount } from "@/providers/EmailAccountProvider";
import { updateMeetingBriefsEnabledAction } from "@/utils/actions/meeting-briefs";

export default function MeetingBriefsPage() {
  const { emailAccountId } = useAccount();
  const { data: calendarsData, isLoading: isLoadingCalendars } = useCalendars();
  const { data, isLoading, error, mutate } = useMeetingBriefSettings();

  const hasCalendarConnected =
    calendarsData?.connections && calendarsData.connections.length > 0;

  const { execute, status } = useAction(
    updateMeetingBriefsEnabledAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Settings saved!" });
        mutate();
      },
      onError: () => {
        toastError({ description: "Failed to save settings" });
      },
    }
  );

  if (isLoadingCalendars || isLoading || error) {
    return (
      <PageWrapper>
        <LoadingContent error={error} loading={isLoadingCalendars || isLoading}>
          <div />
        </LoadingContent>
      </PageWrapper>
    );
  }

  if (!(hasCalendarConnected && data?.enabled)) {
    return (
      <BriefsOnboarding
        emailAccountId={emailAccountId}
        hasCalendarConnected={hasCalendarConnected}
        isEnabling={status === "executing"}
        onEnable={() => execute({ enabled: true })}
      />
    );
  }

  return (
    <PageWrapper>
      <PageHeader title="Meeting Briefs" />

      <div className="mt-4 max-w-3xl space-y-4">
        <PremiumAlertWithData />

        <LoadingContent error={error} loading={isLoading}>
          <div className="space-y-2">
            <SettingCard
              description="Receive email briefings before meetings with external guests"
              right={
                <Toggle
                  disabled={!hasCalendarConnected}
                  enabled={!!data?.enabled}
                  name="enabled"
                  onChange={(enabled) => execute({ enabled })}
                />
              }
              title="Enable Meeting Briefs"
            />

            {!!data?.enabled && (
              <>
                <SettingCard
                  collapseOnMobile
                  description="How long before the meeting to send the briefing"
                  right={
                    <TimeDurationSetting
                      initialMinutes={data?.minutesBefore ?? 240}
                      onSaved={mutate}
                    />
                  }
                  title="Send briefing before meeting"
                />

                <DeliveryChannelsSetting />

                <IntegrationsSetting />
              </>
            )}
          </div>
        </LoadingContent>

        {!!data?.enabled && hasCalendarConnected && (
          <div className="mt-8">
            <UpcomingMeetings emailAccountId={emailAccountId} />
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
