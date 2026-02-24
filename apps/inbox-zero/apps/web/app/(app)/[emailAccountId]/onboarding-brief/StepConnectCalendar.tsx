"use client";

import { Calendar, CheckIcon } from "lucide-react";
import { ConnectCalendar } from "@/app/(app)/[emailAccountId]/calendars/ConnectCalendar";
import { IconCircle } from "@/app/(app)/[emailAccountId]/onboarding/IconCircle";
import { PageHeading, TypographyP } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { useCalendars } from "@/hooks/useCalendars";
import { useAccount } from "@/providers/EmailAccountProvider";
import { prefixPath } from "@/utils/path";

export function StepConnectCalendar({ onNext }: { onNext: () => void }) {
  const { emailAccountId } = useAccount();
  const { data: calendarsData } = useCalendars();

  const hasCalendarConnected =
    calendarsData?.connections && calendarsData.connections.length > 0;

  return (
    <>
      <div className="flex justify-center">
        <IconCircle size="lg">
          <Calendar className="size-6" />
        </IconCircle>
      </div>

      <div className="text-center">
        <PageHeading className="mt-4">Connect Your Calendar</PageHeading>
        <TypographyP className="mx-auto mt-2 max-w-lg">
          We'll automatically detect your upcoming meetings with external guests
          and prepare personalized briefings.
        </TypographyP>
      </div>

      <div className="mt-8 flex flex-col items-center justify-center gap-4">
        {hasCalendarConnected ? (
          <>
            <div className="fade-in zoom-in flex animate-in items-center gap-2 font-medium text-green-600 duration-300">
              <CheckIcon className="h-5 w-5" />
              Calendar Connected!
            </div>
            <Button className="mt-2" onClick={onNext}>
              Continue
            </Button>
          </>
        ) : (
          <ConnectCalendar
            onboardingReturnPath={prefixPath(
              emailAccountId,
              "/onboarding-brief?step=2"
            )}
          />
        )}
      </div>
    </>
  );
}
