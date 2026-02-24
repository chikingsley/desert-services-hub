"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useAction } from "next-safe-action/hooks";
import { useCallback, useEffect, useMemo } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import type { z } from "zod";
import { Input } from "@/components/Input";
import { LoadingContent } from "@/components/LoadingContent";
import { Select } from "@/components/Select";
import { SettingCard } from "@/components/SettingCard";
import { toastSuccess } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCalendars } from "@/hooks/useCalendars";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  updateCalendarBookingLinkAction,
  updateEmailAccountTimezoneAction,
} from "@/utils/actions/calendar";
import {
  updateBookingLinkBody,
  updateTimezoneBody,
} from "@/utils/actions/calendar.validation";

const BASE_TIMEZONES = [
  { label: "Samoa (GMT-11)", value: "Pacific/Samoa" },
  { label: "Hawaii (GMT-10)", value: "Pacific/Honolulu" },
  { label: "Alaska (GMT-9)", value: "America/Anchorage" },
  { label: "Pacific Time (GMT-8)", value: "America/Los_Angeles" },
  { label: "Mountain Time (GMT-7)", value: "America/Denver" },
  { label: "Central Time (GMT-6)", value: "America/Chicago" },
  { label: "Eastern Time (GMT-5)", value: "America/New_York" },
  { label: "Caracas (GMT-4)", value: "America/Caracas" },
  { label: "Buenos Aires (GMT-3)", value: "America/Argentina/Buenos_Aires" },
  { label: "UTC", value: "UTC" },
  { label: "London (GMT+0)", value: "Europe/London" },
  { label: "Paris (GMT+1)", value: "Europe/Paris" },
  { label: "Berlin (GMT+1)", value: "Europe/Berlin" },
  { label: "Athens (GMT+2)", value: "Europe/Athens" },
  { label: "Jerusalem (GMT+2)", value: "Asia/Jerusalem" },
  { label: "Istanbul (GMT+3)", value: "Europe/Istanbul" },
  { label: "Moscow (GMT+3)", value: "Europe/Moscow" },
  { label: "Dubai (GMT+4)", value: "Asia/Dubai" },
  { label: "Karachi (GMT+5)", value: "Asia/Karachi" },
  { label: "Mumbai (GMT+5:30)", value: "Asia/Kolkata" },
  { label: "Dhaka (GMT+6)", value: "Asia/Dhaka" },
  { label: "Bangkok (GMT+7)", value: "Asia/Bangkok" },
  { label: "Singapore (GMT+8)", value: "Asia/Singapore" },
  { label: "Hong Kong (GMT+8)", value: "Asia/Hong_Kong" },
  { label: "Tokyo (GMT+9)", value: "Asia/Tokyo" },
  { label: "Sydney (GMT+10)", value: "Australia/Sydney" },
  { label: "Noumea (GMT+11)", value: "Pacific/Noumea" },
  { label: "Auckland (GMT+12)", value: "Pacific/Auckland" },
];

export function CalendarSettings() {
  const { emailAccountId } = useAccount();
  const { data, isLoading, error, mutate } = useCalendars();
  const timezone = data?.timezone || null;
  const calendarBookingLink = data?.calendarBookingLink || null;

  // Calculate timezone options on the client side
  const timezoneOptions = useMemo(() => {
    const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const offset = -new Date().getTimezoneOffset() / 60;
    const offsetStr = offset >= 0 ? `+${offset}` : `${offset}`;
    const autoDetectOption = {
      label: `🌍 Current timezone (${detectedTz} GMT${offsetStr})`,
      value: "auto-detect",
    };

    // Insert auto-detect option after UTC
    const utcIndex = BASE_TIMEZONES.findIndex((tz) => tz.value === "UTC");
    const options = [...BASE_TIMEZONES];
    options.splice(utcIndex + 1, 0, autoDetectOption);

    // Ensure the currently stored timezone is also selectable
    if (timezone && !options.some((tz) => tz.value === timezone)) {
      options.push({ label: timezone, value: timezone });
    }

    return options;
  }, [timezone]);

  const { execute: executeUpdateTimezone, isExecuting: isUpdatingTimezone } =
    useAction(updateEmailAccountTimezoneAction.bind(null, emailAccountId), {
      onSuccess: () => {
        toastSuccess({ description: "Timezone updated!" });
        mutate();
      },
    });

  const {
    execute: executeUpdateBookingLink,
    isExecuting: isUpdatingBookingLink,
  } = useAction(updateCalendarBookingLinkAction.bind(null, emailAccountId), {
    onSuccess: () => {
      toastSuccess({ description: "Booking link updated!" });
      mutate();
    },
  });

  const {
    register: registerTimezone,
    handleSubmit: handleSubmitTimezone,
    reset: resetTimezone,
    formState: { errors: timezoneErrors },
  } = useForm<z.infer<typeof updateTimezoneBody>>({
    resolver: zodResolver(updateTimezoneBody),
    defaultValues: {
      timezone: timezone || "UTC",
    },
  });

  const {
    register: registerBookingLink,
    handleSubmit: handleSubmitBookingLink,
    reset: resetBookingLink,
    formState: { errors: bookingLinkErrors },
  } = useForm<z.infer<typeof updateBookingLinkBody>>({
    resolver: zodResolver(updateBookingLinkBody),
    defaultValues: {
      bookingLink: calendarBookingLink || "",
    },
  });

  // Update form values when data loads
  useEffect(() => {
    if (timezone !== null) {
      resetTimezone({ timezone: timezone || "UTC" });
    }
  }, [timezone, resetTimezone]);

  useEffect(() => {
    if (calendarBookingLink !== null || data) {
      resetBookingLink({ bookingLink: calendarBookingLink || "" });
    }
  }, [calendarBookingLink, resetBookingLink, data]);

  const onSubmitTimezone: SubmitHandler<z.infer<typeof updateTimezoneBody>> =
    useCallback(
      (data) => {
        // If user selected "auto-detect", detect and save the actual timezone
        if (data.timezone === "auto-detect") {
          const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
          executeUpdateTimezone({ timezone: detected });
        } else {
          executeUpdateTimezone(data);
        }
      },
      [executeUpdateTimezone]
    );

  const onSubmitBookingLink: SubmitHandler<
    z.infer<typeof updateBookingLinkBody>
  > = useCallback(
    (data) => {
      executeUpdateBookingLink(data);
    },
    [executeUpdateBookingLink]
  );

  return (
    <div className="space-y-2">
      <SettingCard
        collapseOnMobile
        description="Your booking link for the AI to share when scheduling meetings"
        right={
          <LoadingContent
            error={error}
            loading={isLoading}
            loadingComponent={<Skeleton className="h-10 w-80" />}
          >
            <form
              className="flex w-full flex-col gap-2 sm:flex-row sm:items-center md:w-auto"
              onSubmit={handleSubmitBookingLink(onSubmitBookingLink)}
            >
              <div className="w-full sm:w-80">
                <Input
                  error={bookingLinkErrors.bookingLink}
                  name="bookingLink"
                  placeholder="https://cal.com/your-link"
                  registerProps={registerBookingLink("bookingLink")}
                  type="url"
                />
              </div>
              <Button
                className="w-full sm:w-auto"
                loading={isUpdatingBookingLink}
                size="sm"
                type="submit"
              >
                Save
              </Button>
            </form>
          </LoadingContent>
        }
        title="Calendar Booking Link"
      />

      <SettingCard
        collapseOnMobile
        description="Your timezone for calendar scheduling suggestions"
        right={
          <LoadingContent
            error={error}
            loading={isLoading}
            loadingComponent={<Skeleton className="h-10 w-64" />}
          >
            <form
              className="flex w-full flex-col gap-2 sm:flex-row sm:items-center md:w-auto"
              onSubmit={handleSubmitTimezone(onSubmitTimezone)}
            >
              <div className="w-full sm:w-64">
                <Select
                  options={timezoneOptions}
                  {...registerTimezone("timezone")}
                  error={timezoneErrors.timezone}
                />
              </div>
              <Button
                className="w-full sm:w-auto"
                loading={isUpdatingTimezone}
                size="sm"
                type="submit"
              >
                Save
              </Button>
            </form>
          </LoadingContent>
        }
        title="Timezone"
      />
    </div>
  );
}
