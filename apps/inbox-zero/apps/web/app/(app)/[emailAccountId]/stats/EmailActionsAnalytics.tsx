"use client";

import type { EmailActionStatsResponse } from "@/app/api/user/stats/email-actions/route";
import { LoadingContent } from "@/components/LoadingContent";
import { CardBasic } from "@/components/ui/card";
import type { ChartConfig } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrgSWR } from "@/hooks/useOrgSWR";
import { COLORS } from "@/utils/colors";
import { BarChart } from "./BarChart";

const chartConfig = {
  Archived: { label: "Archived", color: COLORS.analytics.green },
  Deleted: { label: "Deleted", color: COLORS.analytics.pink },
} satisfies ChartConfig;

export function EmailActionsAnalytics() {
  const { data, isLoading, error } = useOrgSWR<EmailActionStatsResponse>(
    "/api/user/stats/email-actions"
  );

  if (data?.disabled) {
    return (
      <CardBasic>
        <p>How many emails you've archived and deleted with Inbox Zero</p>
        <div className="mt-4 flex h-72 items-center justify-center text-muted-foreground">
          <p>This feature is disabled. Contact your admin to enable it.</p>
        </div>
      </CardBasic>
    );
  }

  return (
    <LoadingContent
      error={error}
      loading={isLoading}
      loadingComponent={<Skeleton className="h-32 w-full rounded" />}
    >
      {data && (
        <CardBasic>
          <p>How many emails you've archived and deleted with Inbox Zero</p>
          <div className="mt-4">
            <BarChart
              config={chartConfig}
              data={data.result}
              dataKeys={["Archived", "Deleted"]}
              xAxisKey="date"
            />
          </div>
        </CardBasic>
      )}
    </LoadingContent>
  );
}
