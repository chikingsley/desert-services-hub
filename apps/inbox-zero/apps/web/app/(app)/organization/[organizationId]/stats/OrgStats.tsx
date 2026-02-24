"use client";

import { subDays } from "date-fns/subDays";
import { Mail, Sparkles, Users } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { AccessDenied } from "@/components/AccessDenied";
import { DatePickerWithRange } from "@/components/DatePickerWithRange";
import { LoadingContent } from "@/components/LoadingContent";
import { MutedText } from "@/components/Typography";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useOrganizationMembership } from "@/hooks/useOrganizationMembership";
import { useOrgStatsEmailBuckets } from "@/hooks/useOrgStatsEmailBuckets";
import { useOrgStatsRulesBuckets } from "@/hooks/useOrgStatsRulesBuckets";
import { useOrgStatsTotals } from "@/hooks/useOrgStatsTotals";
import { hasOrganizationAdminRole } from "@/utils/organizations/roles";

const selectOptions = [
  { label: "Last week", value: "7" },
  { label: "Last month", value: "30" },
  { label: "Last 3 months", value: "90" },
  { label: "All time", value: "0" },
];
const defaultSelected = selectOptions[1];

export function OrgStats({ organizationId }: { organizationId: string }) {
  const { data: membership, isLoading: membershipLoading } =
    useOrganizationMembership();
  const isAdmin = hasOrganizationAdminRole(membership?.role ?? "");

  const [dateDropdown, setDateDropdown] = useState<string>(
    defaultSelected.label
  );

  const now = useMemo(() => new Date(), []);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(now, Number.parseInt(defaultSelected.value)),
    to: now,
  });

  const onSetDateDropdown = useCallback(
    (option: { label: string; value: string }) => {
      setDateDropdown(option.label);
    },
    []
  );

  const options = useMemo(
    () => ({
      fromDate: dateRange?.from?.getTime(),
      toDate: dateRange?.to?.getTime(),
    }),
    [dateRange]
  );

  const {
    data: totalsData,
    isLoading: totalsLoading,
    error: totalsError,
  } = useOrgStatsTotals(organizationId, options);

  const {
    data: emailBucketsData,
    isLoading: emailBucketsLoading,
    error: emailBucketsError,
  } = useOrgStatsEmailBuckets(organizationId, options);

  const {
    data: rulesBucketsData,
    isLoading: rulesBucketsLoading,
    error: rulesBucketsError,
  } = useOrgStatsRulesBuckets(organizationId, options);

  if (membershipLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <AccessDenied message="You don't have permission to view organization analytics. Only administrators can access this page." />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <DatePickerWithRange
          dateDropdown={dateDropdown}
          dateRange={dateRange}
          onSetDateDropdown={onSetDateDropdown}
          onSetDateRange={setDateRange}
          selectOptions={selectOptions}
        />
      </div>

      <div className="space-y-6">
        <LoadingContent
          error={totalsError}
          loading={totalsLoading}
          loadingComponent={
            <div className="grid gap-4 md:grid-cols-3">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
          }
        >
          {totalsData && (
            <div className="grid gap-4 md:grid-cols-3">
              <StatCard
                icon={<Mail className="h-4 w-4 text-muted-foreground" />}
                title="Emails Received"
                value={totalsData.totalEmails.toLocaleString()}
              />
              <StatCard
                icon={<Sparkles className="h-4 w-4 text-muted-foreground" />}
                title="Rules Executed"
                value={totalsData.totalRules.toLocaleString()}
              />
              <StatCard
                icon={<Users className="h-4 w-4 text-muted-foreground" />}
                title="Active Members"
                value={totalsData.activeMembers.toLocaleString()}
              />
            </div>
          )}
        </LoadingContent>

        <div className="grid gap-4 md:grid-cols-2">
          <LoadingContent
            error={emailBucketsError}
            loading={emailBucketsLoading}
            loadingComponent={<Skeleton className="h-64" />}
          >
            {emailBucketsData && (
              <BucketChart
                data={emailBucketsData}
                description="Number of users by emails received in selected period"
                emptyMessage="No email data available. Users need to load their stats first."
                title="Email Volume Distribution"
                unit="emails"
              />
            )}
          </LoadingContent>

          <LoadingContent
            error={rulesBucketsError}
            loading={rulesBucketsLoading}
            loadingComponent={<Skeleton className="h-64" />}
          >
            {rulesBucketsData && (
              <BucketChart
                data={rulesBucketsData}
                description="Number of users by rules executed in selected period"
                emptyMessage="No automation data yet."
                title="Automation Usage Distribution"
                unit="rules"
              />
            )}
          </LoadingContent>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="font-medium text-sm">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="font-bold text-2xl">{value}</div>
      </CardContent>
    </Card>
  );
}

function BucketChart({
  title,
  description,
  data,
  emptyMessage,
  unit = "emails",
}: {
  title: string;
  description: string;
  data: { label: string; userCount: number }[];
  emptyMessage: string;
  unit?: string;
}) {
  const hasData = data.some((bucket) => bucket.userCount > 0);
  const maxValue = Math.max(...data.map((d) => d.userCount), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <MutedText>{description}</MutedText>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <div className="space-y-3">
            {data.map((bucket) => (
              <div className="space-y-1" key={bucket.label}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {bucket.label} {unit}
                  </span>
                  <span className="font-medium">
                    {bucket.userCount}{" "}
                    {bucket.userCount === 1 ? "user" : "users"}
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-secondary">
                  <div
                    className="h-2 rounded-full bg-primary transition-all"
                    style={{
                      width: `${(bucket.userCount / maxValue) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex h-40 items-center justify-center">
            <MutedText className="text-center">{emptyMessage}</MutedText>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
