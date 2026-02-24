"use client";

import { LightbulbIcon, MailIcon, UserSearchIcon } from "lucide-react";
import { ConnectCalendar } from "@/app/(app)/[emailAccountId]/calendars/ConnectCalendar";
import { SetupCard } from "@/components/SetupCard";
import { MessageText } from "@/components/Typography";
import { Button } from "@/components/ui/button";

const features = [
  {
    icon: <UserSearchIcon className="size-4 text-blue-500" />,
    title: "Attendee research",
    description: "Who they are, their company, and role",
  },
  {
    icon: <MailIcon className="size-4 text-blue-500" />,
    title: "Email history",
    description: "Recent conversations with this person",
  },
  {
    icon: <LightbulbIcon className="size-4 text-blue-500" />,
    title: "Key context",
    description: "Important details from past discussions",
  },
];

export function BriefsOnboarding({
  emailAccountId,
  hasCalendarConnected = false,
  onEnable,
  isEnabling = false,
}: {
  emailAccountId: string;
  hasCalendarConnected?: boolean;
  onEnable?: () => void;
  isEnabling?: boolean;
}) {
  return (
    <SetupCard
      description="Receive briefings via email or Slack before meetings with external guests."
      features={features}
      imageAlt="Meeting Briefs"
      imageSrc="/images/illustrations/communication.svg"
      title="Meeting Briefs"
    >
      {hasCalendarConnected ? (
        <>
          <MessageText>
            You're all set! Enable meeting briefs to get started:
          </MessageText>
          <Button loading={isEnabling} onClick={onEnable}>
            Enable Meeting Briefs
          </Button>
        </>
      ) : (
        <>
          <MessageText>Connect your calendar to get started:</MessageText>
          <ConnectCalendar onboardingReturnPath={`/${emailAccountId}/briefs`} />
        </>
      )}
    </SetupCard>
  );
}
