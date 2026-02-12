/**
 * Estimates List Page
 */
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { startTransition, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import useSWR from "swr";
import { EstimatesHeaderActions } from "@/apps/web/frontend/components/estimates/estimates-header-actions";
import {
  type EstimateRowView,
  EstimatesTable,
} from "@/apps/web/frontend/components/estimates/estimates-table";
import { PageHeader } from "@/apps/web/frontend/components/page-header";
import {
  PageError,
  PageLoading,
} from "@/apps/web/frontend/components/page-loading";
import { Button } from "@/apps/web/frontend/components/ui/button";
import { FacetedMultiSelect } from "@/apps/web/frontend/components/ui/faceted-multi-select";
import { Input } from "@/apps/web/frontend/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/apps/web/frontend/components/ui/select";
import { useDebouncedValue } from "@/apps/web/frontend/hooks/use-debounced-value";
import { fetcher } from "@/apps/web/frontend/lib/fetcher";

interface Pagination {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

interface Facets {
  statuses: Array<{ status: string; count: number }>;
  sources: {
    manual: number;
    takeoff: number;
  };
}

interface EstimatesApiResponse {
  items: EstimateRowView[];
  pagination: Pagination;
  facets: Facets;
}

const SOURCE_OPTIONS = [
  { value: "all", label: "All sources" },
  { value: "manual", label: "Manual" },
  { value: "takeoff", label: "Takeoff" },
] as const;

const SORT_OPTIONS = [
  { value: "created_at.desc", label: "Newest created" },
  { value: "created_at.asc", label: "Oldest created" },
  { value: "total.desc", label: "Highest total" },
  { value: "total.asc", label: "Lowest total" },
  { value: "job_name.asc", label: "Job name A-Z" },
  { value: "client_name.asc", label: "Client A-Z" },
  { value: "status.asc", label: "Status A-Z" },
] as const;

const PER_PAGE_OPTIONS = ["25", "50", "100"] as const;

function normalizePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function parseMultiParam(value: string | null): string[] {
  if (!value) {
    return [];
  }

  const values = value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && entry !== "all");

  return [...new Set(values)];
}

export function EstimatesPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const page = normalizePositiveInt(searchParams.get("page"), 1);
  const perPage = normalizePositiveInt(searchParams.get("perPage"), 50);
  const source = searchParams.get("source") || "all";
  const selectedStatuses = parseMultiParam(searchParams.get("status"));
  const sort = searchParams.get("sort") || "created_at.desc";

  const [searchInput, setSearchInput] = useState(searchParams.get("q") || "");
  const debouncedSearch = useDebouncedValue(searchInput, 250);

  useEffect(() => {
    const current = searchParams.get("q") || "";
    if (current !== searchInput) {
      setSearchInput(current);
    }
  }, [searchParams, searchInput]);

  useEffect(() => {
    const current = searchParams.get("q") || "";
    const next = debouncedSearch.trim();
    if (current === next) {
      return;
    }

    const params = new URLSearchParams(searchParams);
    if (next) {
      params.set("q", next);
    } else {
      params.delete("q");
    }
    params.set("page", "1");
    startTransition(() => setSearchParams(params));
  }, [debouncedSearch, searchParams, setSearchParams]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("perPage", String(perPage));
    params.set("source", source);
    params.set("sort", sort);

    const q = debouncedSearch.trim();
    if (q) {
      params.set("q", q);
    }
    if (selectedStatuses.length > 0) {
      params.set("status", selectedStatuses.join(","));
    }

    return params.toString();
  }, [page, perPage, source, sort, debouncedSearch, selectedStatuses]);

  const { data, error, isLoading, isValidating } = useSWR<EstimatesApiResponse>(
    `/api/estimates?${queryString}`,
    fetcher,
    {
      keepPreviousData: true,
      revalidateOnFocus: false,
    }
  );

  const setParam = (name: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set(name, value);
    } else {
      params.delete(name);
    }
    params.set("page", "1");
    startTransition(() => setSearchParams(params));
  };

  const setStatuses = (values: string[]) => {
    const params = new URLSearchParams(searchParams);
    if (values.length > 0) {
      params.set("status", values.join(","));
    } else {
      params.delete("status");
    }
    params.set("page", "1");
    startTransition(() => setSearchParams(params));
  };

  const setPage = (nextPage: number) => {
    const params = new URLSearchParams(searchParams);
    params.set("page", String(nextPage));
    startTransition(() => setSearchParams(params));
  };

  const statuses = data?.facets.statuses ?? [];
  const items = data?.items ?? [];
  const totalPages = data?.pagination.totalPages ?? 1;
  const isInitialLoading = isLoading && !data;
  const isRefreshing = isValidating && !!data;

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        actions={<EstimatesHeaderActions />}
        breadcrumbs={[{ label: "Estimates" }]}
        title="Estimates"
      />

      {error && <PageError message={error.message} />}
      {!error && isInitialLoading && <PageLoading />}
      {data && (
        <div className="flex-1 p-6 lg:p-8">
          <div className="page-transition flex flex-col gap-4">
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <div className="flex flex-wrap items-center gap-3 border-border/50 border-b bg-muted/20 p-4">
                <div className="relative min-w-[280px] flex-1">
                  <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder="Search estimate #, job, client, address"
                    value={searchInput}
                  />
                </div>

                <FacetedMultiSelect
                  className="min-w-[220px]"
                  onApply={setStatuses}
                  options={statuses.map((entry) => ({
                    label: entry.status,
                    value: entry.status,
                    count: entry.count,
                  }))}
                  searchPlaceholder="Filter statuses..."
                  selectedValues={selectedStatuses}
                  title="Status"
                />

                <Select
                  onValueChange={(value) => setParam("source", value)}
                  value={source}
                >
                  <SelectTrigger className="min-w-[140px]" size="sm">
                    <SelectValue placeholder="Source" />
                  </SelectTrigger>
                  <SelectContent>
                    {SOURCE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  onValueChange={(value) => setParam("sort", value)}
                  value={sort}
                >
                  <SelectTrigger className="min-w-[170px]" size="sm">
                    <SelectValue placeholder="Sort" />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  onValueChange={(value) => setParam("perPage", value)}
                  value={String(perPage)}
                >
                  <SelectTrigger className="min-w-[116px]" size="sm">
                    <SelectValue placeholder="Per page" />
                  </SelectTrigger>
                  <SelectContent>
                    {PER_PAGE_OPTIONS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {value} / page
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <EstimatesTable estimates={items} />
            </div>

            {data && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm">
                  {data.pagination.total} results
                  {isRefreshing ? " (Updating...)" : ""}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground text-sm">
                    Page {data.pagination.page} of {totalPages}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      disabled={data.pagination.page <= 1}
                      onClick={() => setPage(data.pagination.page - 1)}
                      size="sm"
                      variant="outline"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      disabled={data.pagination.page >= totalPages}
                      onClick={() => setPage(data.pagination.page + 1)}
                      size="sm"
                      variant="outline"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
