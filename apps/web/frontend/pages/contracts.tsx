/**
 * Contracts — two-panel queue view
 * Route: /contracts
 *
 * Left: scrollable list of won estimates, with search + sort.
 * Right: selected contract detail with metadata, status, and entity flags.
 */
import { AlertTriangle, Info, RefreshCw, Search, XCircle } from "lucide-react";
import { startTransition, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import useSWR from "swr";
import { PageHeader } from "@/apps/web/frontend/components/page-header";
import {
  PageError,
  PageLoading,
} from "@/apps/web/frontend/components/page-loading";
import { StatusBadge } from "@/apps/web/frontend/components/status-badge";
import { Button } from "@/apps/web/frontend/components/ui/button";
import { Input } from "@/apps/web/frontend/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/apps/web/frontend/components/ui/select";
import { fetcher } from "@/apps/web/frontend/lib/fetcher";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { formatCompactCurrency, formatCurrency } from "@/lib/utils";

interface ContractFromApi {
  id: number;
  estimate_number: string | null;
  name: string;
  contractor: string | null;
  awarded_value: number | null;
  bid_value: number | null;
  location: string | null;
  project_id: number | null;
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

interface ReviewEntity {
  class: string;
  text: string;
  attributes: {
    severity?: "critical" | "warning" | "info";
    recommended_action?: string;
  };
}

interface ReviewDoc {
  id: number;
  file_name: string | null;
  project_id: number | null;
  entity_count: number;
  critical_count: number;
  warning_count: number;
  info_count: number;
  entities: ReviewEntity[];
}

interface ReviewApiResponse {
  items: ReviewDoc[];
  total: number;
}

const SORT_OPTIONS = [
  { value: "updated_at.desc", label: "Recently updated" },
  { value: "total.desc", label: "Highest value" },
  { value: "contractor.asc", label: "Contractor A–Z" },
  { value: "name.asc", label: "Project A–Z" },
  { value: "contract_status.asc", label: "Status A–Z" },
] as const;

const CLASS_LABELS: Record<string, string> = {
  scope_creep: "Scope Creep",
  mobilization_trap: "Mobilization Trap",
  inapplicable_section: "Inapplicable Section",
  overbroad_language: "Overbroad Language",
  noi_not_filing: "NOI / Not Filing",
  record_retention: "Record Retention",
  inspection_terms: "Inspection Terms",
  payment_terms: "Payment Terms",
  liability_language: "Liability Language",
  company_name_issue: "Company Name Issue",
  missing_quantity: "Missing Quantity",
};

function SeverityIcon({ severity }: { severity?: string }) {
  if (severity === "critical")
    return <XCircle className="h-3 w-3 shrink-0 text-red-600" />;
  if (severity === "warning")
    return <AlertTriangle className="h-3 w-3 shrink-0 text-amber-600" />;
  return <Info className="h-3 w-3 shrink-0 text-blue-600" />;
}

function EntityRow({ entity }: { entity: ReviewEntity }) {
  const sev = entity.attributes.severity;
  const colorClass =
    sev === "critical"
      ? "border-red-500/20 bg-red-500/5"
      : sev === "warning"
        ? "border-amber-500/20 bg-amber-500/5"
        : "border-blue-500/20 bg-blue-500/5";

  return (
    <div className={`rounded-lg border p-2.5 text-xs ${colorClass}`}>
      <div className="mb-1 flex items-center gap-1.5">
        <SeverityIcon severity={sev} />
        <span className="font-medium text-muted-foreground">
          {CLASS_LABELS[entity.class] ?? entity.class}
        </span>
      </div>
      <blockquote className="mb-1 border-border border-l-2 pl-2 text-foreground/70 italic">
        &ldquo;{entity.text}&rdquo;
      </blockquote>
      {entity.attributes.recommended_action && (
        <p className="text-foreground/60">
          {entity.attributes.recommended_action}
        </p>
      )}
    </div>
  );
}

function ContractDetail({
  contract,
  reviewDocs,
}: {
  contract: ContractFromApi;
  reviewDocs: ReviewDoc[];
}) {
  const value = contract.awarded_value ?? contract.bid_value;
  const allEntities = reviewDocs.flatMap((d) => d.entities);
  const critical = allEntities.filter(
    (e) => e.attributes.severity === "critical"
  );
  const warnings = allEntities.filter(
    (e) => e.attributes.severity === "warning"
  );
  const info = allEntities.filter(
    (e) =>
      e.attributes.severity !== "critical" &&
      e.attributes.severity !== "warning"
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-border/50 border-b px-5 py-4">
        <div className="font-semibold text-base leading-tight">
          {contract.name}
        </div>
        <div className="mt-0.5 text-muted-foreground text-sm">
          {contract.contractor || "Unknown contractor"}
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-5">
        {/* Metadata grid */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="mb-0.5 text-muted-foreground text-xs">
              Estimate #
            </div>
            <div className="font-medium text-sm">
              {contract.estimate_number || "—"}
            </div>
          </div>
          <div>
            <div className="mb-0.5 text-muted-foreground text-xs">Value</div>
            <div className="font-medium text-sm">
              {value ? formatCurrency(value) : "—"}
            </div>
          </div>
          <div>
            <div className="mb-0.5 text-muted-foreground text-xs">Location</div>
            <div className="font-medium text-sm">
              {contract.location || "—"}
            </div>
          </div>
          <div>
            <div className="mb-0.5 text-muted-foreground text-xs">
              Linked Project
            </div>
            <div className="font-medium text-sm">
              {contract.project_name || "Not linked"}
            </div>
          </div>
        </div>

        {/* Status badges */}
        <div className="flex flex-wrap gap-2">
          {contract.contract_status && (
            <StatusBadge status={contract.contract_status} />
          )}
          {contract.dust_permit_status && (
            <StatusBadge status={contract.dust_permit_status} />
          )}
        </div>

        {/* Entity flags */}
        {allEntities.length > 0 && (
          <div className="space-y-3">
            <div className="font-medium text-sm">Contract Issues</div>
            {critical.length > 0 && (
              <div className="space-y-1.5">
                <div className="font-medium text-red-700 text-xs">
                  Critical ({critical.length})
                </div>
                {critical.map((e, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: entities have no stable id
                  <EntityRow entity={e} key={i} />
                ))}
              </div>
            )}
            {warnings.length > 0 && (
              <div className="space-y-1.5">
                <div className="font-medium text-amber-700 text-xs">
                  Warnings ({warnings.length})
                </div>
                {warnings.map((e, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: entities have no stable id
                  <EntityRow entity={e} key={i} />
                ))}
              </div>
            )}
            {info.length > 0 && (
              <div className="space-y-1.5">
                <div className="font-medium text-blue-700 text-xs">
                  Informational ({info.length})
                </div>
                {info.map((e, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: entities have no stable id
                  <EntityRow entity={e} key={i} />
                ))}
              </div>
            )}
          </div>
        )}

        {allEntities.length === 0 && contract.project_id && (
          <p className="text-muted-foreground text-xs">
            No contract issues analyzed yet.
          </p>
        )}

        {!contract.project_id && (
          <p className="text-muted-foreground text-xs">
            No linked project — link a project to enable contract analysis.
          </p>
        )}
      </div>
    </div>
  );
}

export function ContractsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const sort = searchParams.get("sort") || "updated_at.desc";
  const [searchInput, setSearchInput] = useState(searchParams.get("q") || "");
  const debouncedSearch = useDebouncedValue(searchInput, 250);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", "1");
    params.set("perPage", "200");
    params.set("sort", sort);
    const q = debouncedSearch.trim();
    if (q) params.set("q", q);
    return params.toString();
  }, [sort, debouncedSearch]);

  const { data, error, isLoading, isValidating, mutate } =
    useSWR<ContractsApiResponse>(`/api/contracts?${query}`, fetcher, {
      keepPreviousData: true,
      revalidateOnFocus: false,
    });

  const { data: reviewData } = useSWR<ReviewApiResponse>(
    "/api/contracts/review",
    fetcher,
    { revalidateOnFocus: false }
  );

  const setSort = (value: string) => {
    startTransition(() => {
      const params = new URLSearchParams(searchParams);
      params.set("sort", value);
      setSearchParams(params);
    });
  };

  const items = data?.items ?? [];

  const selectedItem =
    items.find((item) => item.id === selectedId) ?? items[0] ?? null;

  const reviewDocsForSelected = useMemo(() => {
    if (!(selectedItem?.project_id && reviewData?.items)) return [];
    return reviewData.items.filter(
      (doc) => doc.project_id === selectedItem.project_id
    );
  }, [selectedItem, reviewData]);

  // Stats from facets (always global — not filtered)
  const facets = data?.facets.contractStatuses ?? [];
  const totalContracts = facets.reduce((sum, f) => sum + f.count, 0);
  const unlinkedCount = facets.find((f) => f.status === "Unlinked")?.count ?? 0;
  const linkedCount = totalContracts - unlinkedCount;

  const isInitialLoading = isLoading && !data;

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
        <div className="flex flex-1 flex-col gap-4 overflow-hidden p-6 lg:p-8">
          {/* Stats bar */}
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="text-muted-foreground">
              <span className="font-semibold text-foreground">
                {totalContracts}
              </span>{" "}
              contracts
            </span>
            <span className="text-muted-foreground">
              <span className="font-semibold text-emerald-700">
                {linkedCount}
              </span>{" "}
              linked
            </span>
            <span className="text-muted-foreground">
              <span className="font-semibold text-amber-700">
                {unlinkedCount}
              </span>{" "}
              unlinked
            </span>
            <span className="text-muted-foreground">
              Total value:{" "}
              <span className="font-semibold text-foreground">
                {formatCompactCurrency(data.summary.totalValue)}
              </span>
            </span>
            {isValidating && (
              <span className="text-muted-foreground/60 text-xs">
                Updating…
              </span>
            )}
          </div>

          {/* Two-panel layout */}
          <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[360px_1fr]">
            {/* Left: contract list */}
            <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              {/* List controls */}
              <div className="flex items-center gap-2 border-border/50 border-b px-3 py-2.5">
                <div className="relative flex-1">
                  <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="h-8 pl-8 text-sm"
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Search…"
                    value={searchInput}
                  />
                </div>
                <Select onValueChange={setSort} value={sort}>
                  <SelectTrigger className="h-8 w-[130px] text-xs" size="sm">
                    <SelectValue placeholder="Sort" />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map((opt) => (
                      <SelectItem
                        className="text-xs"
                        key={opt.value}
                        value={opt.value}
                      >
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Contract rows */}
              <div className="flex-1 overflow-y-auto">
                {items.map((item) => {
                  const isSelected = selectedItem?.id === item.id;
                  const isLinked = !!item.project_name;
                  return (
                    <button
                      className={`w-full border-border/40 border-b px-4 py-3 text-left transition-colors hover:bg-muted/40 ${
                        isSelected ? "bg-primary/5" : ""
                      }`}
                      key={item.id}
                      onClick={() => setSelectedId(item.id)}
                      type="button"
                    >
                      <div className="mb-0.5 truncate font-medium text-sm">
                        {item.name}
                      </div>
                      <div className="mb-1.5 truncate text-muted-foreground text-xs">
                        {item.contractor || "Unknown"} •{" "}
                        {item.estimate_number || "No #"}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-xs ${
                            isLinked
                              ? "bg-emerald-500/10 text-emerald-700"
                              : "bg-amber-500/10 text-amber-700"
                          }`}
                        >
                          {isLinked ? item.project_name : "Unlinked"}
                        </span>
                        {item.contract_status && (
                          <StatusBadge status={item.contract_status} />
                        )}
                      </div>
                    </button>
                  );
                })}

                {items.length === 0 && (
                  <div className="p-6 text-center text-muted-foreground text-sm">
                    No contracts match your search.
                  </div>
                )}
              </div>
            </div>

            {/* Right: detail panel */}
            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              {selectedItem ? (
                <ContractDetail
                  contract={selectedItem}
                  reviewDocs={reviewDocsForSelected}
                />
              ) : (
                <div className="p-6 text-muted-foreground text-sm">
                  Select a contract.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
