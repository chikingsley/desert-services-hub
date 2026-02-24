"use client";

import { format, formatDistanceToNow } from "date-fns";
import { CalendarIcon, SendIcon } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { useCallback, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { LoadingContent } from "@/components/LoadingContent";
import { toastError, toastSuccess } from "@/components/Toast";
import { TypographyH3 } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@/components/ui/item";
import { Skeleton } from "@/components/ui/skeleton";
import { useCalendarUpcomingEvents } from "@/hooks/useCalendarUpcomingEvents";
import { useMeetingBriefsHistory } from "@/hooks/useMeetingBriefs";
import { sendBriefAction } from "@/utils/actions/meeting-briefs";

export function UpcomingMeetings({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const { data, isLoading, error } = useCalendarUpcomingEvents();
  const [sendingEventId, setSendingEventId] = useState<string | null>(null);

  const { execute } = useAction(sendBriefAction.bind(null, emailAccountId), {
    onSuccess: ({ data: result }) => {
      toastSuccess({
        description: result.message || "Test brief sent!",
      });
    },
    onError: ({ error }) => {
      toastError({
        description: error.serverError || "Failed to send brief",
      });
    },
    onSettled: () => {
      setSendingEventId(null);
    },
  });

  const handleSendTestBrief = useCallback(
    (event: NonNullable<typeof data>["events"][number]) => {
      setSendingEventId(event.id);
      execute({
        event: {
          id: event.id,
          title: event.title,
          description: event.description,
          location: event.location,
          eventUrl: event.eventUrl,
          videoConferenceLink: event.videoConferenceLink,
          startTime: new Date(event.startTime).toISOString(),
          endTime: new Date(event.endTime).toISOString(),
          attendees: event.attendees,
        },
      });
    },
    [execute]
  );

  return (
    <>
      <TypographyH3>Upcoming Meetings</TypographyH3>

      <LoadingContent error={error} loading={isLoading}>
        {data?.events.length ? (
          <>
            <ItemGroup className="mt-4 gap-2">
              {data?.events.map((event) => (
                <Item key={event.id} variant="outline">
                  <ItemContent>
                    <ItemTitle>{event.title}</ItemTitle>
                    <ItemDescription>
                      {format(
                        new Date(event.startTime),
                        "EEE, MMM d 'at' h:mm a"
                      )}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <ConfirmDialog
                      confirmText="Send"
                      description="This will send you a briefing email for this meeting now. Use this to verify briefs are working correctly."
                      onConfirm={() => handleSendTestBrief(event)}
                      title="Send test brief?"
                      trigger={
                        <Button
                          Icon={SendIcon}
                          loading={sendingEventId === event.id}
                          variant="outline"
                        >
                          Send test brief
                        </Button>
                      }
                    />
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>

            <div className="mt-4">
              <SendHistoryLink />
            </div>
          </>
        ) : (
          <Empty className="mt-4 border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CalendarIcon />
              </EmptyMedia>
              <EmptyTitle>No upcoming calendar events found</EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}
      </LoadingContent>
    </>
  );
}

function SendHistoryLink() {
  const { data, isLoading, error } = useMeetingBriefsHistory();

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button className="h-auto p-0 text-muted-foreground" variant="link">
          View send history →
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send History</DialogTitle>
        </DialogHeader>

        <LoadingContent
          error={error}
          loading={isLoading}
          loadingComponent={<Skeleton className="h-10 w-full" />}
        >
          {data?.briefings.length ? (
            <ItemGroup className="mt-2 gap-2">
              {data?.briefings.map((briefing) => (
                <Item key={briefing.id} variant="outline">
                  <ItemContent>
                    <ItemTitle>{briefing.eventTitle}</ItemTitle>
                    <ItemDescription>
                      {briefing.guestCount} guest
                      {briefing.guestCount !== 1 ? "s" : ""} •{" "}
                      {formatDistanceToNow(new Date(briefing.createdAt), {
                        addSuffix: true,
                      })}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <span
                      className={`rounded px-2 py-1 text-xs ${
                        briefing.status === "SENT"
                          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                          : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                      }`}
                    >
                      {briefing.status}
                    </span>
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          ) : (
            <Empty className="mt-4 border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <CalendarIcon />
                </EmptyMedia>
                <EmptyTitle>No briefings have been sent yet</EmptyTitle>
              </EmptyHeader>
            </Empty>
          )}
        </LoadingContent>
      </DialogContent>
    </Dialog>
  );
}
