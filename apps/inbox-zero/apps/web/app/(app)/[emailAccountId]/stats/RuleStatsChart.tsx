"use client";

import { fromPairs } from "lodash";
import { useMemo } from "react";
import type { DateRange } from "react-day-picker";
import { LabelList, Pie, PieChart } from "recharts";
import type { RuleStatsResponse } from "@/app/api/user/stats/rule-stats/route";
import { LoadingContent } from "@/components/LoadingContent";
import {
  CardBasic,
  CardContent,
  CardHeader,
  CardTitle,
  Card as ShadcnCard,
} from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useOrgSWR } from "@/hooks/useOrgSWR";
import { COLORS } from "@/utils/colors";
import { BarChart } from "./BarChart";
import { getDateRangeParams } from "./params";

interface RuleStatsChartProps {
  dateRange?: DateRange;
  title: string;
}

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export function RuleStatsChart({ dateRange, title }: RuleStatsChartProps) {
  const params = getDateRangeParams(dateRange);

  const { data, isLoading, error } = useOrgSWR<RuleStatsResponse>(
    `/api/user/stats/rule-stats?${new URLSearchParams(params as Record<string, string>)}`
  );

  const barChartData = useMemo(() => {
    if (!data?.ruleStats) {
      return [];
    }
    return data.ruleStats.map((rule) => ({
      group: rule.ruleName,
      executed: rule.executedCount,
    }));
  }, [data]);

  const { pieChartData, chartConfig, barChartConfig } = useMemo(() => {
    if (!data?.ruleStats) {
      return { pieChartData: [], chartConfig: {}, barChartConfig: {} };
    }

    const pieData = data.ruleStats.map((rule, index) => ({
      name: rule.ruleName,
      value: rule.executedCount,
      fill: CHART_COLORS[index % CHART_COLORS.length],
    }));

    const config: ChartConfig = {
      value: {
        label: "Executed Rules",
      },
      ...fromPairs(
        data.ruleStats.map((rule, index) => [
          rule.ruleName,
          {
            label: rule.ruleName,
            color: CHART_COLORS[index % CHART_COLORS.length],
          },
        ])
      ),
    };

    const barConfig: ChartConfig = {
      executed: { label: "Executed Rules", color: COLORS.analytics.blue },
    };

    return {
      pieChartData: pieData,
      chartConfig: config,
      barChartConfig: barConfig,
    };
  }, [data]);

  return (
    <LoadingContent
      error={error}
      loading={isLoading}
      loadingComponent={<Skeleton className="h-64 w-full rounded" />}
    >
      {data && barChartData.length > 0 && (
        <Tabs defaultValue="bar">
          <CardBasic>
            <div className="flex items-center justify-between">
              <p>{title}</p>
              <TabsList>
                <TabsTrigger value="bar">Bar Chart</TabsTrigger>
                <TabsTrigger value="pie">Pie Chart</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent className="mt-4" value="bar">
              <BarChart
                config={barChartConfig}
                data={barChartData}
                dataKeys={["executed"]}
                xAxisFormatter={(value) => value}
                xAxisKey="group"
              />
            </TabsContent>

            <TabsContent value="pie">
              <ShadcnCard className="border-0 shadow-none">
                <CardHeader className="items-center pb-0">
                  <CardTitle className="font-normal text-base text-muted-foreground">
                    Rule Execution Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 pb-0">
                  <ChartContainer
                    className="mx-auto aspect-square max-h-[300px] [&_.recharts-text]:fill-background"
                    config={chartConfig}
                  >
                    <PieChart>
                      <ChartTooltip
                        content={
                          <ChartTooltipContent hideLabel nameKey="value" />
                        }
                      />
                      <Pie data={pieChartData} dataKey="value">
                        <LabelList
                          className="fill-background"
                          dataKey="name"
                          fontSize={12}
                          stroke="none"
                        />
                      </Pie>
                    </PieChart>
                  </ChartContainer>
                </CardContent>
              </ShadcnCard>
            </TabsContent>
          </CardBasic>
        </Tabs>
      )}
      {data && barChartData.length === 0 && (
        <CardBasic>
          <p>{title}</p>
          <div className="mt-4 flex h-72 items-center justify-center text-muted-foreground">
            <p>No executed rules found for this period.</p>
          </div>
        </CardBasic>
      )}
    </LoadingContent>
  );
}
