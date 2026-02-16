/**
 * Dust Permits Page
 */
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { memo, startTransition, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import useSWR from "swr";
import { PageHeader } from "@/apps/web/frontend/components/page-header";
import {
  PageError,
  PageLoading,
} from "@/apps/web/frontend/components/page-loading";
import { StatusBadge } from "@/apps/web/frontend/components/status-badge";
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
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/apps/web/frontend/components/ui/table";
import { VirtualizedTable } from "@/apps/web/frontend/components/ui/virtualized-table";
import { fetcher } from "@/apps/web/frontend/lib/fetcher";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

interface PermitFromApi {
  id: string;
  project_name: string | null;
  company_name: string | null;
  status: string | null;
  submitted_date: string | null;
  effective_date: string | null;
  expiration_date: string | null;
  address: string | null;
  city: string | null;
  project_db_name: string | null;
}

interface PermitsApiResponse {
  items: PermitFromApi[];
  pagination: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
  facets: {
    statuses: Array<{ status: string; count: number }>;
  };
}

const SORT_OPTIONS = [
  { value: "submitted_date.desc", label: "Newest submitted" },
  { value: "expiration_date.asc", label: "Expiring soon" },
  { value: "effective_date.desc", label: "Newest effective" },
  { value: "project_name.asc", label: "Project A-Z" },
] as const;

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

function formatPermitDate(dateStr: string | null): string {
  if (!dateStr) {
    return "-";
  }
  try {
    return PERMIT_DATE_FORMATTER.format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

const PERMIT_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const PermitRow = memo(function PermitRow({
  permit,
}: {
  permit: PermitFromApi;
}) {
  return (
    <TableRow className="transition-colors hover:bg-primary/5" key={permit.id}>
      <TableCell className="font-medium font-mono text-primary">
        {permit.id}
      </TableCell>
      <TableCell>
        <div className="truncate font-medium">{permit.project_name || "-"}</div>
        {permit.project_db_name &&
        permit.project_db_name !== permit.project_name ? (
          <div className="truncate text-muted-foreground text-xs">
            {permit.project_db_name}
          </div>
        ) : null}
      </TableCell>
      <TableCell className="truncate text-muted-foreground">
        {permit.company_name || "-"}
      </TableCell>
      <TableCell>
        <StatusBadge status={permit.status} />
      </TableCell>
      <TableCell className="truncate text-muted-foreground text-sm">
        {permit.address || "-"}
        {permit.city ? `, ${permit.city}` : ""}
      </TableCell>
      <TableCell className="text-muted-foreground text-sm tabular-nums">
        {formatPermitDate(permit.effective_date)}
      </TableCell>
      <TableCell className="text-muted-foreground text-sm tabular-nums">
        {formatPermitDate(permit.expiration_date)}
      </TableCell>
      <TableCell className="text-muted-foreground text-sm tabular-nums">
        {formatPermitDate(permit.submitted_date)}
      </TableCell>
    </TableRow>
  );
});

export function PermitsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = normalizePositiveInt(searchParams.get("page"), 1);
  const perPage = normalizePositiveInt(searchParams.get("perPage"), 50);
  const selectedStatuses = parseMultiParam(searchParams.get("status"));
  const sort = searchParams.get("sort") || "submitted_date.desc";

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

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("perPage", String(perPage));
    params.set("sort", sort);

    if (selectedStatuses.length > 0) {
      params.set("status", selectedStatuses.join(","));
    }

    const q = debouncedSearch.trim();
    if (q) {
      params.set("q", q);
    }
    return params.toString();
  }, [page, perPage, selectedStatuses, sort, debouncedSearch]);

  const { data, error, isLoading, isValidating } = useSWR<PermitsApiResponse>(
    `/api/permits?${query}`,
    fetcher,
    {
      keepPreviousData: true,
      revalidateOnFocus: false,
    }
  );

  const setParam = (name: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    params.set(name, value);
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

  const items = data?.items ?? [];
  const statuses = data?.facets.statuses ?? [];
  const totalPages = data?.pagination.totalPages ?? 1;
  const isInitialLoading = isLoading && !data;
  const isRefreshing = isValidating && !!data;

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        breadcrumbs={[{ label: "Dust Permits" }]}
        title="Dust Permits"
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
                    placeholder="Search permit ID, project, company, address"
                    value={searchInput}
                  />
                </div>

                <FacetedMultiSelect
                  className="min-w-[210px]"
                  onApply={setStatuses}
                  options={statuses.map((entry) => ({
                    label: entry.status,
                    value: entry.status,
                    count: entry.count,
                  }))}
                  searchPlaceholder="Filter permit statuses..."
                  selectedValues={selectedStatuses}
                  title="Status"
                />

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
                    <SelectItem value="25">25 / page</SelectItem>
                    <SelectItem value="50">50 / page</SelectItem>
                    <SelectItem value="100">100 / page</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <VirtualizedTable
                colSpan={8}
                empty="No permits match your filters."
                header={
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead>Permit ID</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Address</TableHead>
                      <TableHead>Effective</TableHead>
                      <TableHead>Expiration</TableHead>
                      <TableHead>Submitted</TableHead>
                    </TableRow>
                  </TableHeader>
                }
                renderRow={(permit) => (
                  <PermitRow key={permit.id} permit={permit} />
                )}
                rowHeight={38}
                rows={items}
                scrollMode="page"
                tableClassName="table-fixed"
              />
            </div>

            {data && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm">
                  {data.pagination.total} permits
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
