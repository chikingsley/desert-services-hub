"use client";

import type { DateRange } from "react-day-picker";
import { MainStatChart } from "@/app/(app)/[emailAccountId]/stats/MainStatChart";
import type { StatsByPeriodResponse } from "@/app/api/user/stats/by-period/controller";
import type { StatsByPeriodQuery } from "@/app/api/user/stats/by-period/validation";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrgSWR } from "@/hooks/useOrgSWR";
import { getDateRangeParams } from "./params";

export function StatsSummary(props: {
  dateRange?: DateRange;
  refreshInterval: number;
  period: "day" | "week" | "month" | "year";
}) {
  const { dateRange, period } = props;

  const params: StatsByPeriodQuery = {
    period,
    ...getDateRangeParams(dateRange),
  };

  const { data, isLoading, error } = useOrgSWR<
    StatsByPeriodResponse,
    { error: string }
  >(
    `/api/user/stats/by-period?${new URLSearchParams(
      Object.fromEntries(
        Object.entries(params).map(([k, v]) => [k, v?.toString() ?? ""])
      ) as Record<string, string>
    )}`,
    {
      refreshInterval: props.refreshInterval,
    }
  );

  return (
    <LoadingContent
      error={error}
      loading={isLoading}
      loadingComponent={<Skeleton className="h-[405px] rounded" />}
    >
      {data && <MainStatChart data={data} period={period} />}
    </LoadingContent>
  );
}
