/**
 * Takeoffs List Page
 */
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { memo, startTransition, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import useSWR from "swr";
import { PageHeader } from "@/apps/web/frontend/components/page-header";
import {
  PageError,
  PageLoading,
} from "@/apps/web/frontend/components/page-loading";
import { NewTakeoffDialog } from "@/apps/web/frontend/components/takeoffs/new-takeoff-dialog";
import { Badge } from "@/apps/web/frontend/components/ui/badge";
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
import { formatDate } from "@/lib/utils";

interface Takeoff {
  id: string;
  name: string;
  status: string;
  created_at: string;
  updated_at: string;
}

interface TakeoffsApiResponse {
  items: Takeoff[];
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

function TakeoffsHeaderActions() {
  return (
    <NewTakeoffDialog>
      <Button>
        <Plus className="mr-2 h-4 w-4" />
        New Takeoff
      </Button>
    </NewTakeoffDialog>
  );
}

const SORT_OPTIONS = [
  { value: "updated_at.desc", label: "Recently updated" },
  { value: "created_at.desc", label: "Newest created" },
  { value: "name.asc", label: "Name A-Z" },
  { value: "status.asc", label: "Status A-Z" },
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

const TakeoffRow = memo(function TakeoffRow({ takeoff }: { takeoff: Takeoff }) {
  return (
    <TableRow key={takeoff.id}>
      <TableCell>
        <Link
          className="font-medium text-primary hover:underline"
          to={`/takeoffs/${takeoff.id}`}
        >
          {takeoff.name}
        </Link>
      </TableCell>
      <TableCell>
        <Badge variant="outline">{takeoff.status}</Badge>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {formatDate(takeoff.created_at)}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {formatDate(takeoff.updated_at)}
      </TableCell>
    </TableRow>
  );
});

export function TakeoffsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = normalizePositiveInt(searchParams.get("page"), 1);
  const perPage = normalizePositiveInt(searchParams.get("perPage"), 50);
  const selectedStatuses = parseMultiParam(searchParams.get("status"));
  const sort = searchParams.get("sort") || "updated_at.desc";

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

  const { data, error, isLoading, isValidating } = useSWR<TakeoffsApiResponse>(
    `/api/takeoffs?${query}`,
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

  const takeoffs = data?.items ?? [];
  const totalPages = data?.pagination.totalPages ?? 1;
  const isInitialLoading = isLoading && !data;
  const isRefreshing = isValidating && !!data;

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        actions={<TakeoffsHeaderActions />}
        breadcrumbs={[{ label: "Takeoffs" }]}
        title="Takeoffs"
      />

      {error && <PageError message={error.message} />}
      {!error && isInitialLoading && <PageLoading />}
      {data && (
        <div className="flex-1 p-6 lg:p-8">
          <div className="page-transition flex flex-col gap-4">
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <div className="flex flex-wrap items-center gap-3 border-border/50 border-b bg-muted/20 p-4">
                <div className="relative min-w-[260px] flex-1">
                  <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder="Search takeoff name"
                    value={searchInput}
                  />
                </div>

                <FacetedMultiSelect
                  className="min-w-[210px]"
                  onApply={setStatuses}
                  options={(data?.facets.statuses ?? []).map((entry) => ({
                    label: entry.status,
                    value: entry.status,
                    count: entry.count,
                  }))}
                  searchPlaceholder="Filter takeoff statuses..."
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
                colSpan={4}
                empty="No takeoffs match your filters."
                header={
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead>Name</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Updated</TableHead>
                    </TableRow>
                  </TableHeader>
                }
                renderRow={(takeoff) => (
                  <TakeoffRow key={takeoff.id} takeoff={takeoff} />
                )}
                rowHeight={38}
                rows={takeoffs}
                scrollMode="page"
                tableClassName="table-fixed"
              />
            </div>

            {data && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-sm">
                  {data.pagination.total} takeoffs
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
