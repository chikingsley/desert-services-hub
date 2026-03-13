import { ArrowRightLeft, Link2, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { PageHeader } from "@/apps/web/frontend/components/page-header";
import {
  PageError,
  PageLoading,
} from "@/apps/web/frontend/components/page-loading";
import { Badge } from "@/apps/web/frontend/components/ui/badge";
import { Button } from "@/apps/web/frontend/components/ui/button";
import { fetcher } from "@/apps/web/frontend/lib/fetcher";
import { formatCurrency } from "@/lib/utils";

interface ContractRow {
  awarded_value: number | null;
  bid_value: number | null;
  contract_status: string | null;
  contractor: string | null;
  created_at?: string;
  dust_permit_status: string | null;
  estimate_number: string | null;
  id: number;
  location: string | null;
  name: string;
  project_name: string | null;
  updated_at?: string;
}

interface ContractsApiResponse {
  items: ContractRow[];
  pagination: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
}

function queueStateForRow(
  row: ContractRow
): "new_project_needed" | "linked_existing" {
  return row.project_name ? "linked_existing" : "new_project_needed";
}

function stateBadgeClass(
  state: "new_project_needed" | "linked_existing"
): string {
  if (state === "linked_existing") {
    return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700";
  }
  return "border-amber-500/25 bg-amber-500/10 text-amber-700";
}

export function ContractsIntakeExperimentPage() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<
    "all" | "new_project_needed" | "linked_existing"
  >("all");

  const { data, error, isLoading, isValidating, mutate } =
    useSWR<ContractsApiResponse>(
      "/api/contracts?page=1&perPage=100&includeMeta=0&sort=updated_at.desc",
      fetcher,
      {
        keepPreviousData: true,
        revalidateOnFocus: false,
      }
    );

  const queueItems = useMemo(() => {
    const rows = data?.items ?? [];
    return rows.map((row) => ({
      ...row,
      queueState: queueStateForRow(row),
    }));
  }, [data?.items]);

  const filteredItems = useMemo(() => {
    if (statusFilter === "all") {
      return queueItems;
    }
    return queueItems.filter((item) => item.queueState === statusFilter);
  }, [queueItems, statusFilter]);

  const selectedItem =
    filteredItems.find((item) => item.id === selectedId) ??
    filteredItems[0] ??
    null;

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
        breadcrumbs={[{ label: "Experiment" }, { label: "Contracts Intake" }]}
        title="Contracts Intake Experiment"
      />

      {error && <PageError message={error.message} />}
      {!error && isInitialLoading && <PageLoading />}
      {data && (
        <div className="flex flex-1 flex-col gap-4 p-6 lg:p-8">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <ArrowRightLeft className="h-4 w-4" />
            <span>
              Prototype queue view on top of current contracts data. Current
              source: won estimates.
            </span>
          </div>

          <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[360px_1fr]">
            <div className="min-h-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <div className="flex items-center justify-between border-border/50 border-b px-4 py-3">
                <div className="font-medium text-sm">Queue Items</div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => setStatusFilter("all")}
                    size="sm"
                    variant={statusFilter === "all" ? "default" : "outline"}
                  >
                    All
                  </Button>
                  <Button
                    onClick={() => setStatusFilter("new_project_needed")}
                    size="sm"
                    variant={
                      statusFilter === "new_project_needed"
                        ? "default"
                        : "outline"
                    }
                  >
                    New Project
                  </Button>
                  <Button
                    onClick={() => setStatusFilter("linked_existing")}
                    size="sm"
                    variant={
                      statusFilter === "linked_existing" ? "default" : "outline"
                    }
                  >
                    Linked
                  </Button>
                </div>
              </div>

              <div className="max-h-[calc(100vh-260px)] overflow-y-auto">
                {filteredItems.map((item) => (
                  <button
                    className={`w-full border-border/50 border-b px-4 py-3 text-left transition-colors hover:bg-muted/40 ${
                      selectedItem?.id === item.id ? "bg-primary/5" : ""
                    }`}
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    type="button"
                  >
                    <div className="mb-1 truncate font-medium text-sm">
                      {item.name}
                    </div>
                    <div className="mb-2 truncate text-muted-foreground text-xs">
                      {item.contractor || "Unknown contractor"} •{" "}
                      {item.estimate_number || "No estimate #"}
                    </div>
                    <Badge
                      className={stateBadgeClass(item.queueState)}
                      variant="outline"
                    >
                      {item.queueState === "linked_existing"
                        ? "Linked Existing"
                        : "New Project Needed"}
                    </Badge>
                  </button>
                ))}
                {filteredItems.length === 0 && (
                  <div className="p-6 text-center text-muted-foreground text-sm">
                    No queue items for this filter.
                  </div>
                )}
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <div className="border-border/50 border-b px-5 py-4">
                <div className="font-medium text-sm">Detail Panel</div>
              </div>
              {selectedItem ? (
                <div className="space-y-5 p-6">
                  <div className="space-y-1">
                    <div className="font-semibold text-lg">
                      {selectedItem.name}
                    </div>
                    <div className="text-muted-foreground text-sm">
                      {selectedItem.contractor || "Unknown contractor"}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <div className="mb-1 text-muted-foreground text-xs">
                        Estimate #
                      </div>
                      <div className="font-medium text-sm">
                        {selectedItem.estimate_number || "-"}
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 text-muted-foreground text-xs">
                        Linked Project
                      </div>
                      <div className="font-medium text-sm">
                        {selectedItem.project_name || "Not linked"}
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 text-muted-foreground text-xs">
                        Location
                      </div>
                      <div className="font-medium text-sm">
                        {selectedItem.location || "-"}
                      </div>
                    </div>
                    <div>
                      <div className="mb-1 text-muted-foreground text-xs">
                        Value
                      </div>
                      <div className="font-medium text-sm">
                        {selectedItem.awarded_value || selectedItem.bid_value
                          ? formatCurrency(
                              (selectedItem.awarded_value ??
                                selectedItem.bid_value) as number
                            )
                          : "-"}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
                    <div className="mb-2 font-medium text-sm">
                      Planned Queue Actions
                    </div>
                    <div className="mb-3 text-muted-foreground text-xs">
                      Placeholder actions for the intake workflow.
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline">
                        <Link2 className="h-4 w-4" />
                        Link Existing Project
                      </Button>
                      <Button size="sm" variant="outline">
                        Create New Project
                      </Button>
                      <Button size="sm" variant="outline">
                        Mark Blocked
                      </Button>
                      <Button size="sm">Mark Done</Button>
                    </div>
                  </div>

                  <div className="text-muted-foreground text-xs">
                    {isValidating
                      ? "Refreshing..."
                      : `Total rows loaded: ${data.items.length}`}
                  </div>
                </div>
              ) : (
                <div className="p-6 text-muted-foreground text-sm">
                  Select a queue item.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
