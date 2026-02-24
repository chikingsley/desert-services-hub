"use client";

import { Clock, Timer, TrendingDown, TrendingUp } from "lucide-react";
import { useMemo } from "react";
import type { DateRange } from "react-day-picker";
import type { ResponseTimeResponse } from "@/app/api/user/stats/response-time/controller";
import type { ResponseTimeQuery } from "@/app/api/user/stats/response-time/validation";
import { LoadingContent } from "@/components/LoadingContent";
import {
  Card,
  CardBasic,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ChartConfig } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrgSWR } from "@/hooks/useOrgSWR";
import { cn } from "@/utils";
import { COLORS } from "@/utils/colors";
import { pluralize } from "@/utils/string";
import { isDefined } from "@/utils/types";
import { BarChart } from "./BarChart";
import { getDateRangeParams } from "./params";

interface ResponseTimeAnalyticsProps {
  dateRange?: DateRange;
  refreshInterval: number;
}

export function ResponseTimeAnalytics({
  dateRange,
  refreshInterval,
}: ResponseTimeAnalyticsProps) {
  const params: ResponseTimeQuery = getDateRangeParams(dateRange);

  const { data, isLoading, error } = useOrgSWR<ResponseTimeResponse>(
    `/api/user/stats/response-time?${new URLSearchParams(params as Record<string, string>)}`,
    { refreshInterval }
  );

  const distributionData = useMemo(() => {
    if (!data?.distribution) {
      return [];
    }
    return [
      { group: "< 1 hour", count: data.distribution.lessThan1Hour },
      { group: "1-4 hours", count: data.distribution.oneToFourHours },
      { group: "4-24 hours", count: data.distribution.fourTo24Hours },
      { group: "1-3 days", count: data.distribution.oneToThreeDays },
      { group: "3-7 days", count: data.distribution.threeToSevenDays },
      { group: "> 7 days", count: data.distribution.moreThan7Days },
    ];
  }, [data]);
  const trendData = useMemo(() => {
    if (!data?.trend) {
      return [];
    }
    return data.trend
      .map((item) =>
        item
          ? {
              date: item.period,
              median: item.medianResponseTime,
            }
          : null
      )
      .filter(isDefined);
  }, [data]);

  const distributionChartConfig: ChartConfig = {
    count: { label: "Emails", color: COLORS.analytics.blue },
  };

  const trendChartConfig: ChartConfig = {
    median: { label: "Median Response Time", color: COLORS.analytics.purple },
  };

  return (
    <LoadingContent
      error={error}
      loading={isLoading}
      loadingComponent={<Skeleton className="h-[400px] rounded" />}
    >
      {data?.summary && (
        <div className="space-y-4">
          {data.emailsAnalyzed > 0 && (
            <p className="text-muted-foreground text-sm">
              Response time data based on last {data.emailsAnalyzed}{" "}
              {pluralize(data.emailsAnalyzed, "email")}
            </p>
          )}

          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            <SummaryCard
              comparison={data.summary.previousPeriodComparison}
              icon={<Clock className="h-4 w-4" />}
              title="Median Response"
              value={formatTime(data.summary.medianResponseTime)}
            />
            <SummaryCard
              icon={<Timer className="h-4 w-4" />}
              title="Average Response"
              value={formatTime(data.summary.averageResponseTime)}
            />
            <SummaryCard
              icon={<TrendingUp className="h-4 w-4" />}
              title="Within 1 Hour"
              value={`${data.summary.within1Hour}%`}
            />
          </div>

          {/* Distribution Chart */}
          {distributionData.some((d) => d.count > 0) && (
            <CardBasic>
              <p>Response Time Distribution</p>
              <div className="mt-4">
                <BarChart
                  config={distributionChartConfig}
                  data={distributionData}
                  dataKeys={["count"]}
                  tooltipLabelFormatter={(value) => String(value)}
                  xAxisFormatter={(value) => value}
                  xAxisKey="group"
                />
              </div>
            </CardBasic>
          )}

          {/* Trend Chart */}
          {trendData.length > 0 && (
            <CardBasic>
              <p>Weekly Response Time Trend</p>
              <div className="mt-4">
                <BarChart
                  config={trendChartConfig}
                  data={trendData}
                  dataKeys={["median"]}
                  tooltipValueFormatter={formatTime}
                  xAxisFormatter={(value) => value}
                  xAxisKey="date"
                  yAxisFormatter={formatTimeShort}
                />
              </div>
            </CardBasic>
          )}

          {/* Empty state */}
          {!distributionData.some((d) => d.count > 0) &&
            trendData.length === 0 && (
              <CardBasic>
                <p>Response Time Analytics</p>
                <div className="mt-4 flex h-32 items-center justify-center text-muted-foreground">
                  <p>No response time data available for this period.</p>
                </div>
              </CardBasic>
            )}
        </div>
      )}
    </LoadingContent>
  );
}

function SummaryCard({
  title,
  value,
  icon,
  comparison,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  comparison?: {
    medianResponseTime: number;
    percentChange: number;
  } | null;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="font-medium text-muted-foreground text-sm">
          {title}
        </CardTitle>
        <span className="text-muted-foreground">{icon}</span>
      </CardHeader>
      <CardContent>
        <div className="font-bold text-2xl">{value}</div>
        {comparison && (
          <p
            className={cn(
              "mt-1 flex items-center gap-1 text-xs",
              comparison.percentChange < 0
                ? "text-green-600"
                : comparison.percentChange > 0
                  ? "text-red-600"
                  : "text-muted-foreground"
            )}
          >
            {comparison.percentChange < 0 ? (
              <TrendingDown className="h-3 w-3" />
            ) : comparison.percentChange > 0 ? (
              <TrendingUp className="h-3 w-3" />
            ) : null}
            {comparison.percentChange === 0
              ? "No change"
              : `${Math.abs(comparison.percentChange)}% ${comparison.percentChange < 0 ? "faster" : "slower"}`}
            <span className="ml-1 text-muted-foreground">vs previous</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function formatTime(minutes: number): string {
  if (minutes === 0) {
    return "0m";
  }
  if (minutes < 60) {
    return `${Math.round(minutes)}m`;
  }
  if (minutes < 1440) {
    let hours = Math.floor(minutes / 60);
    let mins = Math.round(minutes % 60);
    // Carry over if rounded minutes equals 60
    if (mins === 60) {
      hours += 1;
      mins = 0;
    }
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  let days = Math.floor(minutes / 1440);
  let hours = Math.round((minutes % 1440) / 60);
  // Carry over if rounded hours equals 24
  if (hours === 24) {
    days += 1;
    hours = 0;
  }
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
}

// Shorter format for Y-axis labels
function formatTimeShort(minutes: number): string {
  if (minutes === 0) {
    return "0";
  }
  if (minutes < 60) {
    return `${Math.round(minutes)}m`;
  }
  if (minutes < 1440) {
    const hours = Math.round(minutes / 60);
    return `${hours}h`;
  }
  const days = Math.round(minutes / 1440);
  return `${days}d`;
}
