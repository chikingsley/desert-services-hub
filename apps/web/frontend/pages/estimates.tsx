/**
 * Estimates List Page
 */
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import useSWR from "swr";
import { EmptyState } from "@/apps/web/frontend/components/empty-state";
import { EstimatesEmptyActions } from "@/apps/web/frontend/components/estimates/estimates-empty-actions";
import { EstimatesHeaderActions } from "@/apps/web/frontend/components/estimates/estimates-header-actions";
import {
  EstimatesTable,
  type EstimateWithVersion,
} from "@/apps/web/frontend/components/estimates/estimates-table";
import { PageHeader } from "@/apps/web/frontend/components/page-header";
import {
  PageError,
  PageLoading,
} from "@/apps/web/frontend/components/page-loading";
import { StatCard } from "@/apps/web/frontend/components/stat-card";
import { Button } from "@/apps/web/frontend/components/ui/button";
import { Input } from "@/apps/web/frontend/components/ui/input";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/apps/web/frontend/components/ui/tabs";
import { fetcher } from "@/apps/web/frontend/lib/fetcher";
import { formatCompactCurrency } from "@/lib/utils";

// API response shape for estimate versions
interface EstimateVersionFromApi {
  id: string;
  version_number: number;
  total: number;
  is_current: number;
  created_at: string;
}

interface EstimateFromApi {
  id: string;
  base_number: string;
  job_name: string;
  client_name: string | null;
  status: string;
  is_locked: number;
  created_at: string;
  takeoff_id: string | null;
  versions: EstimateVersionFromApi[];
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface EstimateStats {
  total: number;
  totalValue: number;
  bidSent: number;
  won: number;
  lost: number;
  yetToBid: number;
}

interface EstimatesApiResponse {
  estimates: EstimateFromApi[];
  pagination: Pagination;
  stats: EstimateStats;
}

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "Bid Sent", label: "Bid Sent" },
  { value: "Won", label: "Won" },
  { value: "Lost", label: "Lost" },
  { value: "Yet to Bid", label: "Yet to Bid" },
] as const;

export function EstimatesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get("page")) || 1;
  const [search, setSearch] = useState("");
  const [statusTab, setStatusTab] = useState("all");

  const statusParam =
    statusTab !== "all" ? `&status=${encodeURIComponent(statusTab)}` : "";
  const searchParam = search.trim()
    ? `&search=${encodeURIComponent(search.trim())}`
    : "";

  const { data, error, isLoading } = useSWR<EstimatesApiResponse>(
    `/api/estimates?page=${page}&limit=50${statusParam}${searchParam}`,
    fetcher
  );

  const goToPage = (p: number) => {
    const params = new URLSearchParams(searchParams);
    params.set("page", String(p));
    setSearchParams(params);
  };

  const handleStatusChange = (value: string) => {
    setStatusTab(value);
    // Reset to page 1 when changing filter
    const params = new URLSearchParams(searchParams);
    params.set("page", "1");
    setSearchParams(params);
  };

  const stats = data?.stats ?? {
    total: 0,
    totalValue: 0,
    bidSent: 0,
    won: 0,
    lost: 0,
    yetToBid: 0,
  };

  const statForTab: Record<string, number> = {
    "Bid Sent": stats.bidSent,
    Won: stats.won,
    Lost: stats.lost,
    "Yet to Bid": stats.yetToBid,
  };

  // Transform API response to match EstimatesTable props
  const estimates: EstimateWithVersion[] = (data?.estimates ?? []).map((q) => {
    const currentVersion = q.versions?.find((v) => v.is_current === 1) || null;
    return {
      id: q.id,
      base_number: q.base_number,
      job_name: q.job_name,
      client_name: q.client_name,
      status: q.status,
      created_at: q.created_at,
      current_version: currentVersion,
      takeoff_id: q.takeoff_id,
    };
  });

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        actions={
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-9 w-64 pl-9"
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search estimates..."
                value={search}
              />
            </div>
            <EstimatesHeaderActions />
          </div>
        }
        breadcrumbs={[{ label: "Estimates" }]}
        title="Estimates"
      />

      {error && <PageError message={error.message} />}
      {!error && isLoading && <PageLoading />}
      {!(error || isLoading) && (
        <div className="flex-1 p-6 lg:p-8">
          <div className="page-transition flex flex-col gap-6">
            {/* Stats bar */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatCard accent label="Total Estimates" value={stats.total} />
              <StatCard
                label="Total Value"
                value={formatCompactCurrency(stats.totalValue)}
              />
              <StatCard label="Bid Sent" value={stats.bidSent} />
              <StatCard label="Won" value={stats.won} />
              <StatCard label="Lost" value={stats.lost} />
              <StatCard label="Yet to Bid" value={stats.yetToBid} />
            </div>

            {/* Filter tabs + count */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Tabs onValueChange={handleStatusChange} value={statusTab}>
                <TabsList>
                  {STATUS_TABS.map((tab) => (
                    <TabsTrigger key={tab.value} value={tab.value}>
                      {tab.label}
                      {tab.value !== "all" && (
                        <span className="ml-1 text-muted-foreground/70">
                          {statForTab[tab.value] || 0}
                        </span>
                      )}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <div className="text-muted-foreground text-sm">
                {data?.pagination.total ?? 0} estimates
              </div>
            </div>

            {estimates.length === 0 &&
            page === 1 &&
            !search &&
            statusTab === "all" ? (
              <EmptyState
                action={<EstimatesEmptyActions />}
                description="Upload a PDF plan to measure and create estimates from takeoffs, or start a manual estimate from scratch."
                title="No estimates yet"
              />
            ) : (
              <>
                <div className="overflow-hidden rounded-xl border border-border bg-card">
                  <EstimatesTable estimates={estimates} />
                </div>

                {/* Pagination */}
                {data && data.pagination.totalPages > 1 && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-sm">
                      {data.pagination.total} estimates
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        disabled={data.pagination.page <= 1}
                        onClick={() => goToPage(data.pagination.page - 1)}
                        size="sm"
                        variant="outline"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm">
                        Page {data.pagination.page} of{" "}
                        {data.pagination.totalPages}
                      </span>
                      <Button
                        disabled={
                          data.pagination.page >= data.pagination.totalPages
                        }
                        onClick={() => goToPage(data.pagination.page + 1)}
                        size="sm"
                        variant="outline"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
