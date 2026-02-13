/**
 * Projects Page
 */
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Mail,
  Search,
} from "lucide-react";
import { startTransition, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import useSWR from "swr";
import { PageHeader } from "@/apps/web/frontend/components/page-header";
import {
  PageError,
  PageLoading,
} from "@/apps/web/frontend/components/page-loading";
import {
  ProjectRow,
  type ProjectRowData,
  packetLabel,
} from "@/apps/web/frontend/components/projects/project-row";
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
  TableHead,
  TableHeader,
  TableRow,
} from "@/apps/web/frontend/components/ui/table";
import { VirtualizedTable } from "@/apps/web/frontend/components/ui/virtualized-table";
import { useDebouncedValue } from "@/apps/web/frontend/hooks/use-debounced-value";
import { fetcher } from "@/apps/web/frontend/lib/fetcher";

interface ProjectsApiResponse {
  items: ProjectRowData[];
  pagination: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
  facets: {
    contractStatuses: Array<{ status: string; count: number }>;
    contractPacketStatuses: Array<{ status: string; count: number }>;
    dustStatuses: Array<{ status: string; count: number }>;
  };
}

const SORT_OPTIONS = [
  { value: "sla_priority.desc", label: "SLA priority (worst first)" },
  { value: "last_seen.desc", label: "Recently active" },
  { value: "email_count.desc", label: "Most emails" },
  { value: "name.asc", label: "Project A-Z" },
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

export function ProjectsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = normalizePositiveInt(searchParams.get("page"), 1);
  const perPage = normalizePositiveInt(searchParams.get("perPage"), 50);
  const contractWorkflowStatuses = parseMultiParam(
    searchParams.get("contract_packet_status")
  );
  const dustStatuses = parseMultiParam(searchParams.get("dust_status"));
  const sort = searchParams.get("sort") || "sla_priority.desc";

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

    if (contractWorkflowStatuses.length > 0) {
      params.set("contract_packet_status", contractWorkflowStatuses.join(","));
    }
    if (dustStatuses.length > 0) {
      params.set("dust_status", dustStatuses.join(","));
    }

    const q = debouncedSearch.trim();
    if (q) {
      params.set("q", q);
    }
    return params.toString();
  }, [
    page,
    perPage,
    contractWorkflowStatuses,
    dustStatuses,
    sort,
    debouncedSearch,
  ]);

  const { data, error, isLoading, isValidating } = useSWR<ProjectsApiResponse>(
    `/api/projects?${query}`,
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

  const setMultiParam = (name: string, values: string[]) => {
    const params = new URLSearchParams(searchParams);
    if (values.length > 0) {
      params.set(name, values.join(","));
    } else {
      params.delete(name);
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
  const totalPages = data?.pagination.totalPages ?? 1;
  const isInitialLoading = isLoading && !data;
  const isRefreshing = isValidating && !!data;

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader breadcrumbs={[{ label: "Projects" }]} title="Projects" />

      {error && <PageError message={error.message} />}
      {!error && isInitialLoading && <PageLoading />}
      {data && (
        <div className="flex-1 p-4 lg:px-4 lg:py-6">
          <div className="page-transition flex flex-col gap-4">
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <div className="flex flex-wrap items-center gap-3 border-border/50 border-b bg-muted/20 p-4">
                <div className="relative min-w-[280px] flex-1">
                  <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder="Search project, contractor, account, address"
                    value={searchInput}
                  />
                </div>

                <FacetedMultiSelect
                  className="min-w-[210px]"
                  onApply={(values) =>
                    setMultiParam("contract_packet_status", values)
                  }
                  options={(data?.facets.contractPacketStatuses ?? []).map(
                    (entry) => ({
                      label: packetLabel(entry.status),
                      value: entry.status,
                      count: entry.count,
                    })
                  )}
                  searchPlaceholder="Filter contract workflow statuses..."
                  selectedValues={contractWorkflowStatuses}
                  title="Contract Workflow"
                />

                <FacetedMultiSelect
                  className="min-w-[200px]"
                  onApply={(values) => setMultiParam("dust_status", values)}
                  options={(data?.facets.dustStatuses ?? []).map((entry) => ({
                    label: entry.status,
                    value: entry.status,
                    count: entry.count,
                  }))}
                  searchPlaceholder="Filter dust statuses..."
                  selectedValues={dustStatuses}
                  title="Dust"
                />

                <Select
                  onValueChange={(value) => setParam("sort", value)}
                  value={sort}
                >
                  <SelectTrigger className="min-w-[200px]" size="sm">
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
                colSpan={5}
                empty="No projects match your filters."
                header={
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30">
                      <TableHead className="min-w-[320px]">Project</TableHead>
                      <TableHead className="min-w-[260px]">Work Auth</TableHead>
                      <TableHead className="min-w-[420px]">Next Ops</TableHead>
                      <TableHead className="w-[56px] px-2 text-center">
                        <FileText className="mx-auto h-4 w-4" />
                      </TableHead>
                      <TableHead className="w-[56px] px-2 text-center">
                        <Mail className="mx-auto h-4 w-4" />
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                }
                renderRow={(project) => (
                  <ProjectRow key={project.id} project={project} />
                )}
                rowHeight={70}
                rows={items}
                scrollMode="page"
                tableClassName="table-auto"
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-sm">
                {data.pagination.total} projects
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
          </div>
        </div>
      )}
    </div>
  );
}
