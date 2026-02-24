"use client";

import { ChevronDown, Trash2, XCircle } from "lucide-react";
import Image from "next/image";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import type { GetCalendarsResponse } from "@/app/api/user/calendars/route";
import { TypographyP } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { useCalendars } from "@/hooks/useCalendars";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  disconnectCalendarAction,
  toggleCalendarAction,
} from "@/utils/actions/calendar";
import { CalendarList } from "./CalendarList";

type CalendarConnection = GetCalendarsResponse["connections"][0];

interface CalendarConnectionCardProps {
  connection: CalendarConnection;
}

const getProviderInfo = (provider: string) => {
  const providers = {
    microsoft: {
      name: "Microsoft Calendar",
      icon: "/images/product/outlook-calendar.svg",
      alt: "Microsoft Calendar",
    },
    google: {
      name: "Google Calendar",
      icon: "/images/product/google-calendar.svg",
      alt: "Google Calendar",
    },
  };

  return providers[provider as keyof typeof providers] || providers.google;
};

export function CalendarConnectionCard({
  connection,
}: CalendarConnectionCardProps) {
  const { emailAccountId } = useAccount();
  const { data, mutate } = useCalendars();
  const [optimisticUpdates, setOptimisticUpdates] = useState<
    Record<string, boolean>
  >({});
  const [isOpen, setIsOpen] = useState(false);

  const providerInfo = getProviderInfo(connection.provider);

  const calendars = connection.calendars || [];
  const enabledCalendars = calendars.filter((cal) => {
    const optimisticValue = optimisticUpdates[cal.id];
    return optimisticValue !== undefined ? optimisticValue : cal.isEnabled;
  });

  const { execute: executeDisconnect, isExecuting: isDisconnecting } =
    useAction(disconnectCalendarAction.bind(null, emailAccountId));
  const { execute: executeToggle } = useAction(
    toggleCalendarAction.bind(null, emailAccountId)
  );

  const handleDisconnect = async () => {
    if (
      confirm(
        "Are you sure you want to disconnect this calendar? This will remove all associated calendars."
      )
    ) {
      executeDisconnect({ connectionId: connection.id });
      mutate();
    }
  };

  const handleToggleCalendar = async (
    calendarId: string,
    isEnabled: boolean
  ) => {
    setOptimisticUpdates((prev) => ({ ...prev, [calendarId]: isEnabled }));

    if (data) {
      mutate(
        {
          ...data,
          connections: data.connections.map((conn) =>
            conn.id === connection.id
              ? {
                  ...conn,
                  calendars:
                    conn.calendars?.map((cal) =>
                      cal.id === calendarId ? { ...cal, isEnabled } : cal
                    ) || [],
                }
              : conn
          ),
        },
        false
      );
    }

    try {
      executeToggle({ calendarId, isEnabled });

      setOptimisticUpdates((prev) => {
        const { [calendarId]: _, ...rest } = prev;
        return rest;
      });
    } catch {
      setOptimisticUpdates((prev) => {
        const { [calendarId]: _, ...rest } = prev;
        return rest;
      });
    } finally {
      mutate();
    }
  };

  // TODO: use card - sm variant once we merge the big pr
  return (
    <Card>
      <CardHeader className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Image
              alt={providerInfo.alt}
              height={32}
              src={providerInfo.icon}
              unoptimized
              width={32}
            />
            <div className="min-w-0">
              <CardTitle className="text-lg">{providerInfo.name}</CardTitle>
              <CardDescription className="flex items-center gap-2">
                <span className="truncate">{connection.email}</span>
                {!connection.isConnected && (
                  <div className="flex shrink-0 items-center gap-1 text-red-600">
                    <XCircle className="h-3 w-3" />
                    <span className="text-xs">Disconnected</span>
                  </div>
                )}
              </CardDescription>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              disabled={isDisconnecting}
              Icon={Trash2}
              loading={isDisconnecting}
              onClick={handleDisconnect}
              size="sm"
              variant="destructiveSoft"
            >
              Disconnect
            </Button>
          </div>
        </div>
      </CardHeader>
      <Separator className="mb-4" />
      <CardContent className="p-4 pt-0">
        {calendars.length > 0 ? (
          <Collapsible onOpenChange={setIsOpen} open={isOpen}>
            <CollapsibleTrigger asChild>
              <button
                className="flex w-full items-center gap-2 text-left text-muted-foreground text-sm transition-colors hover:text-foreground"
                type="button"
              >
                <span>
                  {enabledCalendars.length} of {calendars.length} calendars
                  selected for availability
                </span>
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${
                    isOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-4 space-y-4">
              <CalendarList
                calendars={calendars.map((cal) => ({
                  ...cal,
                  isEnabled:
                    optimisticUpdates[cal.id] !== undefined
                      ? optimisticUpdates[cal.id]
                      : cal.isEnabled,
                }))}
                onToggleCalendar={handleToggleCalendar}
              />
            </CollapsibleContent>
          </Collapsible>
        ) : (
          <TypographyP className="text-sm">
            No calendars found. Your calendars will be synced automatically.
          </TypographyP>
        )}
      </CardContent>
    </Card>
  );
}
