import { zodResolver } from "@hookform/resolvers/zod";
import { useAction } from "next-safe-action/hooks";
import { useCallback, useEffect, useState } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import useSWR from "swr";
import { z } from "zod";
import type { GetDigestScheduleResponse } from "@/app/api/user/digest-schedule/route";
import type { GetDigestSettingsResponse } from "@/app/api/user/digest-settings/route";
import { LoadingContent } from "@/components/LoadingContent";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import { TimePicker } from "@/components/TimePicker";
import { toastError, toastSuccess } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { FormItem } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ActionType } from "@/generated/prisma/enums";
import { useRules } from "@/hooks/useRules";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  updateDigestItemsAction,
  updateDigestScheduleAction,
} from "@/utils/actions/settings";
import { getActionErrorMessage } from "@/utils/error";
import {
  bitmaskToDayOfWeek,
  createCanonicalTimeOfDay,
  dayOfWeekToBitmask,
} from "@/utils/schedule";

const digestSettingsSchema = z.object({
  selectedItems: z.set(z.string()),
  // Schedule
  schedule: z.string().min(1, "Please select a frequency"),
  dayOfWeek: z.string().min(1, "Please select a day"),
  time: z.string().min(1, "Please select a time"),
});

type DigestSettingsFormValues = z.infer<typeof digestSettingsSchema>;

const frequencies = [
  { value: "daily", label: "Day" },
  { value: "weekly", label: "Week" },
];

const daysOfWeek = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
];

export function DigestSettingsForm({ onSuccess }: { onSuccess?: () => void }) {
  const { emailAccountId } = useAccount();
  const {
    data: rules,
    isLoading: rulesLoading,
    error: rulesError,
    mutate: mutateRules,
  } = useRules();

  const {
    data: digestSettings,
    isLoading: digestLoading,
    error: digestError,
    mutate: mutateDigestSettings,
  } = useSWR<GetDigestSettingsResponse>("/api/user/digest-settings");

  const {
    data: scheduleData,
    isLoading: scheduleLoading,
    error: scheduleError,
    mutate: mutateSchedule,
  } = useSWR<GetDigestScheduleResponse>("/api/user/digest-schedule");

  const isLoading = rulesLoading || digestLoading || scheduleLoading;
  const error = rulesError || digestError || scheduleError;

  const [selectedDigestItems, setSelectedDigestItems] = useState<Set<string>>(
    new Set()
  );

  const {
    handleSubmit,
    formState: { isSubmitting },
    watch,
    setValue,
    reset,
  } = useForm<DigestSettingsFormValues>({
    resolver: zodResolver(digestSettingsSchema),
    defaultValues: {
      selectedItems: new Set(),
      schedule: "daily",
      dayOfWeek: "1",
      time: "09:00",
    },
  });

  const watchedValues = watch();

  const { execute: executeItems } = useAction(
    updateDigestItemsAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        mutateRules();
        mutateDigestSettings();
      },
      onError: (error) => {
        toastError({
          title: "Error updating digest items",
          description: getActionErrorMessage(error.error),
        });
      },
    }
  );

  const { execute: executeSchedule } = useAction(
    updateDigestScheduleAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        mutateSchedule();
      },
      onError: (error) => {
        toastError({
          title: "Error updating digest schedule",
          description: getActionErrorMessage(error.error),
        });
      },
    }
  );

  // Initialize selected items and form data from API responses
  useEffect(() => {
    if (rules && digestSettings && scheduleData) {
      const selectedItems = new Set<string>();

      // Add rules that have digest actions
      rules.forEach((rule) => {
        if (rule.actions.some((action) => action.type === ActionType.DIGEST)) {
          selectedItems.add(rule.id);
        }
      });

      // Add cold email if enabled
      if (digestSettings.coldEmail) {
        selectedItems.add("cold-emails");
      }

      setSelectedDigestItems(selectedItems);

      // Initialize schedule form data
      const initialScheduleProps = getInitialScheduleProps(scheduleData);
      reset({
        selectedItems,
        ...initialScheduleProps,
      });
    }
  }, [rules, digestSettings, scheduleData, reset]);

  // Update form when selectedDigestItems changes
  useEffect(() => {
    setValue("selectedItems", selectedDigestItems);
  }, [selectedDigestItems, setValue]);

  const onSubmit: SubmitHandler<DigestSettingsFormValues> = useCallback(
    async (data) => {
      // Handle items update
      const ruleDigestPreferences: Record<string, boolean> = {};

      // Set all rules to false first
      rules?.forEach((rule) => {
        ruleDigestPreferences[rule.id] = false;
      });

      // Then set selected rules to true
      data.selectedItems.forEach((itemId) => {
        if (itemId !== "cold-emails") {
          ruleDigestPreferences[itemId] = true;
        }
      });

      // Handle schedule update
      const { schedule, dayOfWeek, time } = data;

      let intervalDays: number;
      switch (schedule) {
        case "daily":
          intervalDays = 1;
          break;
        case "weekly":
          intervalDays = 7;
          break;
        default:
          intervalDays = 1;
      }

      const [hourStr, minuteStr] = time.split(":");
      const hour24 = Number.parseInt(hourStr, 10);
      const minute = Number.parseInt(minuteStr, 10);

      const timeOfDay = createCanonicalTimeOfDay(hour24, minute);

      const scheduleUpdateData = {
        intervalDays,
        occurrences: 1,
        daysOfWeek: dayOfWeekToBitmask(Number.parseInt(dayOfWeek, 10)),
        timeOfDay,
      };

      // Execute both updates
      try {
        await Promise.all([
          executeItems({ ruleDigestPreferences }),
          executeSchedule(scheduleUpdateData),
        ]);
        toastSuccess({
          description: "Your digest settings have been updated!",
        });
        onSuccess?.();
      } catch {
        toastError({
          title: "Error updating digest settings",
          description: "An error occurred while saving your settings",
        });
      }
    },
    [rules, executeItems, executeSchedule, onSuccess]
  );

  // Create options for MultiSelectFilter
  const digestOptions = [
    ...(rules?.map((rule) => ({
      label: rule.name,
      value: rule.id,
    })) || []),
    {
      label: "Cold Emails",
      value: "cold-emails",
    },
  ];

  return (
    <div className="grid h-full gap-8 lg:grid-cols-2">
      <div className="space-y-6">
        <LoadingContent
          error={error}
          loading={isLoading}
          loadingComponent={<Skeleton className="min-h-[200px] w-full" />}
        >
          <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
            <div>
              <Label>What to include in the digest email</Label>
              <div className="mt-3">
                <MultiSelectFilter
                  maxDisplayedValues={3}
                  options={digestOptions}
                  selectedValues={selectedDigestItems}
                  setSelectedValues={setSelectedDigestItems}
                  title="Digest Items"
                />
              </div>
            </div>

            <div>
              <Label>Send the digest email</Label>

              <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-3">
                <FormItem>
                  <Label htmlFor="frequency-select">Every</Label>
                  <Select
                    onValueChange={(val) => setValue("schedule", val)}
                    value={watchedValues.schedule}
                  >
                    <SelectTrigger id="frequency-select">
                      {watchedValues.schedule
                        ? frequencies.find(
                            (f) => f.value === watchedValues.schedule
                          )?.label
                        : "Select..."}
                    </SelectTrigger>
                    <SelectContent>
                      {frequencies.map((f) => (
                        <SelectItem key={f.value} value={f.value}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>

                {watchedValues.schedule !== "daily" && (
                  <FormItem>
                    <Label htmlFor="dayofweek-select">on</Label>
                    <Select
                      onValueChange={(val) => setValue("dayOfWeek", val)}
                      value={watchedValues.dayOfWeek}
                    >
                      <SelectTrigger id="dayofweek-select">
                        {watchedValues.dayOfWeek
                          ? daysOfWeek.find(
                              (d) => d.value === watchedValues.dayOfWeek
                            )?.label
                          : "Select..."}
                      </SelectTrigger>
                      <SelectContent>
                        {daysOfWeek.map((d) => (
                          <SelectItem key={d.value} value={d.value}>
                            {d.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )}

                <TimePicker
                  id="time-picker"
                  label="at"
                  onChange={(value) => setValue("time", value)}
                  value={watchedValues.time}
                />
              </div>
            </div>

            <Button className="mt-4" loading={isSubmitting} type="submit">
              Save
            </Button>
          </form>
        </LoadingContent>
      </div>

      <EmailPreview selectedDigestItems={selectedDigestItems} />
    </div>
  );
}

function EmailPreview({
  selectedDigestItems,
}: {
  selectedDigestItems: Set<string>;
}) {
  const { data: rules } = useRules();

  const selectedDigestNames = Array.from(selectedDigestItems).map((itemId) => {
    if (itemId === "cold-emails") {
      return "Cold Emails";
    }
    return rules?.find((rule) => rule.id === itemId)?.name || itemId;
  });

  const { data: htmlContent } = useSWR<string>(
    selectedDigestNames.length > 0
      ? `/api/digest-preview?categories=${encodeURIComponent(JSON.stringify(selectedDigestNames))}`
      : null,
    async (url: string) => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error("Failed to fetch preview");
      }
      return response.text();
    },
    { keepPreviousData: true }
  );

  return (
    <div>
      <Label>Preview</Label>
      <div className="mt-3 overflow-hidden rounded-lg border bg-slate-50">
        {selectedDigestNames.length > 0 && htmlContent ? (
          <iframe
            className="max-h-[700px] min-h-[700px] w-full bg-white"
            sandbox=""
            srcDoc={htmlContent}
            title="Digest preview"
          />
        ) : (
          <div className="py-8 text-center text-slate-500">
            <p>Select digest items to see a preview</p>
          </div>
        )}
      </div>
    </div>
  );
}

function getInitialScheduleProps(
  digestSchedule?: GetDigestScheduleResponse | null
) {
  const initialSchedule = (() => {
    if (!digestSchedule) {
      return "daily";
    }
    switch (digestSchedule.intervalDays) {
      case 1:
        return "daily";
      case 7:
        return "weekly";
      case 14:
        return "biweekly";
      case 30:
        return "monthly";
      default:
        return "daily";
    }
  })();

  const initialDayOfWeek = (() => {
    if (!digestSchedule || digestSchedule.daysOfWeek == null) {
      return "1";
    }
    const dayOfWeek = bitmaskToDayOfWeek(digestSchedule.daysOfWeek);
    return dayOfWeek !== null ? dayOfWeek.toString() : "1";
  })();

  const initialTime = digestSchedule?.timeOfDay
    ? (() => {
        const hours = new Date(digestSchedule.timeOfDay)
          .getHours()
          .toString()
          .padStart(2, "0");
        const minutes = new Date(digestSchedule.timeOfDay)
          .getMinutes()
          .toString()
          .padStart(2, "0");
        return `${hours}:${minutes}`;
      })()
    : "09:00";

  return {
    schedule: initialSchedule,
    dayOfWeek: initialDayOfWeek,
    time: initialTime,
  };
}
