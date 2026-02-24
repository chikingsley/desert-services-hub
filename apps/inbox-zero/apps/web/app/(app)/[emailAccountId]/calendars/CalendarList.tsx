"use client";

import { Calendar as CalendarIcon, Star } from "lucide-react";
import type { GetCalendarsResponse } from "@/app/api/user/calendars/route";
import { Toggle } from "@/components/Toggle";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

type Calendar = GetCalendarsResponse["connections"][0]["calendars"][0];

interface CalendarListProps {
  calendars: Calendar[];
  onToggleCalendar: (calendarId: string, isEnabled: boolean) => void;
}

export function CalendarList({
  calendars,
  onToggleCalendar,
}: CalendarListProps) {
  return (
    <div className="space-y-2">
      {calendars.map((calendar) => (
        <Card className="p-3" key={calendar.id}>
          <CardContent className="p-0">
            <div className="grid grid-cols-[auto_1fr_auto] items-start gap-3">
              <CalendarIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <div className="mb-1 flex min-w-0 items-center gap-2">
                  <p className="min-w-0 flex-1 truncate font-medium text-sm">
                    {calendar.name}
                  </p>
                  {calendar.primary && (
                    <Badge className="flex-shrink-0 text-xs" variant="outline">
                      <Star className="mr-1 h-3 w-3" />
                      Primary
                    </Badge>
                  )}
                </div>
                {calendar.description && (
                  <p className="block overflow-hidden truncate text-ellipsis whitespace-nowrap text-muted-foreground text-xs">
                    {calendar.description}
                  </p>
                )}
                {calendar.timezone && (
                  <p className="block overflow-hidden truncate text-ellipsis whitespace-nowrap text-muted-foreground text-xs">
                    {calendar.timezone}
                  </p>
                )}
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                <Toggle
                  enabled={calendar.isEnabled}
                  name={`calendar-${calendar.id}`}
                  onChange={(checked) => onToggleCalendar(calendar.id, checked)}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
