/**
 * Contracts Page
 */
import { ChevronLeft, ChevronRight, RefreshCw, Search } from "lucide-react";
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
import { useDebouncedValue } from "@/apps/web/frontend/hooks/use-debounced-value";
import { fetcher } from "@/apps/web/frontend/lib/fetcher";
import { formatCompactCurrency, formatCurrency } from "@/lib/utils";

interface ContractFromApi {
  id: number;
  estimate_number: string | null;
  name: string;
  contractor: string | null;
  awarded_value: number | null;
  bid_value: number | null;
  location: string | null;
  project_name: string | null;
  contract_status: string | null;
  dust_permit_status: string | null;
}

interface ContractsApiResponse {
  items: ContractFromApi[];
  pagination: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
  facets: {
    contractStatuses: Array<{ status: string; count: number }>;
  };
  summary: {
    totalValue: number;
  };
}

const SORT_OPTIONS = [
  { value: "updated_at.desc", label: "Recently updated" },
  { value: "total.desc", label: "Highest value" },
  { value: "contractor.asc", label: "Contractor A-Z" },
  { value: "name.asc", label: "Project A-Z" },
  { value: "contract_status.asc", label: "Status A-Z" },
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

const ContractRow = memo(function ContractRow({
  contract,
}: {
  contract: ContractFromApi;
}) {
  return (
    <TableRow
      className="transition-colors hover:bg-primary/5"
      key={contract.id}
    >
      <TableCell className="font-medium font-mono text-primary">
        {contract.estimate_number || "-"}
      </TableCell>
      <TableCell className="truncate font-medium">{contract.name}</TableCell>
      <TableCell className="truncate text-muted-foreground">
        {contract.contractor || "-"}
      </TableCell>
      <TableCell>
        <StatusBadge status={contract.contract_status || "Unlinked"} />
      </TableCell>
      <TableCell>
        {contract.dust_permit_status ? (
          <StatusBadge status={contract.dust_permit_status} />
        ) : (
          <span className="text-muted-foreground/60">-</span>
        )}
      </TableCell>
      <TableCell className="text-right font-mono text-sm">
        {contract.awarded_value || contract.bid_value
          ? formatCurrency(
              (contract.awarded_value ?? contract.bid_value) as number
            )
          : "-"}
      </TableCell>
      <TableCell className="truncate text-muted-foreground text-sm">
        {contract.location || "-"}
      </TableCell>
      <TableCell className="truncate text-muted-foreground text-sm">
        {contract.project_name || "Not linked"}
      </TableCell>
    </TableRow>
  );
});

export function ContractsPage() {
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

  const { data, error, isLoading, isValidating, mutate } =
    useSWR<ContractsApiResponse>(`/api/contracts?${query}`, fetcher, {
      keepPreviousData: true,
      revalidateOnFocus: false,
    });

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
  const statuses = data?.facets.contractStatuses ?? [];
  const totalPages = data?.pagination.totalPages ?? 1;
  const isInitialLoading = isLoading && !data;
  const isRefreshing = isValidating && !!data;

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        actions={
          <Button onClick={() => mutate()} size="sm" variant="outline">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        }
        breadcrumbs={[{ label: "Contracts" }]}
        title="Contracts"
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
                    placeholder="Search estimate #, project, contractor"
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
                  searchPlaceholder="Filter contract statuses..."
                  selectedValues={selectedStatuses}
                  title="Contract status"
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
                empty="No contracts match your filters."
                header={
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead>Estimate #</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Contractor</TableHead>
                      <TableHead>Contract</TableHead>
                      <TableHead>Dust Permit</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Linked Project</TableHead>
                    </TableRow>
                  </TableHeader>
                }
                renderRow={(contract) => (
                  <ContractRow contract={contract} key={contract.id} />
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
                  {data.pagination.total} contracts
                  {isRefreshing ? " (Updating...)" : ""}
                  <span className="ml-3">
                    Total value:{" "}
                    {formatCompactCurrency(data.summary.totalValue)}
                  </span>
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
