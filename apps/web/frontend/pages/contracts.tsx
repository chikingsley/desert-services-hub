/**
 * Contracts Page
 *
 * Won estimates from Monday.com — the contracts pipeline.
 * Table view of all awarded contracts with project linkage info.
 */
import { RefreshCw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { PageHeader } from "@/apps/web/frontend/components/page-header";
import {
  PageError,
  PageLoading,
} from "@/apps/web/frontend/components/page-loading";
import { StatCard } from "@/apps/web/frontend/components/stat-card";
import { StatusBadge } from "@/apps/web/frontend/components/status-badge";
import { Button } from "@/apps/web/frontend/components/ui/button";
import { Input } from "@/apps/web/frontend/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/apps/web/frontend/components/ui/table";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/apps/web/frontend/components/ui/tabs";
import { fetcher } from "@/apps/web/frontend/lib/fetcher";
import { formatCompactCurrency, formatCurrency } from "@/lib/utils";

interface ContractFromApi {
  id: number;
  monday_item_id: string | null;
  name: string;
  estimate_number: string | null;
  contractor: string | null;
  group_id: string | null;
  bid_status: string | null;
  bid_value: number | null;
  awarded_value: number | null;
  due_date: string | null;
  location: string | null;
  project_id: number | null;
  project_name: string | null;
  contract_status: string | null;
  dust_permit_status: string | null;
  created_at: string;
  updated_at: string;
}

interface ContractsApiResponse {
  contracts: ContractFromApi[];
  stats: {
    total: number;
    totalValue: number;
    pipeline: Record<string, number>;
  };
}

const CONTRACT_STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "Pending", label: "Pending" },
  { value: "Received", label: "Received" },
  { value: "Sent Back", label: "Sent Back" },
  { value: "Executed", label: "Executed" },
] as const;

export function ContractsPage() {
  const { data, error, isLoading, mutate } = useSWR<ContractsApiResponse>(
    "/api/contracts",
    fetcher
  );
  const [search, setSearch] = useState("");
  const [statusTab, setStatusTab] = useState("all");
  const normalizedSearch = search.trim().toLowerCase();

  const contracts = data?.contracts ?? [];
  const stats = data?.stats ?? { total: 0, totalValue: 0, pipeline: {} };

  const filtered = useMemo(() => {
    return contracts.filter((c) => {
      const matchesStatus =
        statusTab === "all" ||
        (statusTab === "Unlinked"
          ? !c.contract_status
          : c.contract_status === statusTab);
      const matchesSearch =
        !normalizedSearch ||
        c.name.toLowerCase().includes(normalizedSearch) ||
        c.contractor?.toLowerCase().includes(normalizedSearch) ||
        c.estimate_number?.toLowerCase().includes(normalizedSearch) ||
        c.project_name?.toLowerCase().includes(normalizedSearch);
      return matchesStatus && matchesSearch;
    });
  }, [contracts, statusTab, normalizedSearch]);

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
                placeholder="Search contracts..."
                value={search}
              />
            </div>
            <Button onClick={() => mutate()} size="sm" variant="outline">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        }
        breadcrumbs={[{ label: "Contracts" }]}
        title="Contracts"
      />

      {error && <PageError message={error.message} />}
      {!error && isLoading && <PageLoading />}
      {!(error || isLoading) && (
        <div className="flex-1 p-6 lg:p-8">
          <div className="page-transition flex flex-col gap-6">
            {/* Stats bar */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <StatCard accent label="Won Contracts" value={stats.total} />
              <StatCard
                label="Total Value"
                value={formatCompactCurrency(stats.totalValue)}
              />
              <StatCard label="Pending" value={stats.pipeline.Pending || 0} />
              <StatCard label="Received" value={stats.pipeline.Received || 0} />
              <StatCard label="Executed" value={stats.pipeline.Executed || 0} />
            </div>

            {/* Filter tabs + count */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Tabs onValueChange={setStatusTab} value={statusTab}>
                <TabsList>
                  {CONTRACT_STATUS_TABS.map((tab) => (
                    <TabsTrigger key={tab.value} value={tab.value}>
                      {tab.label}
                      {tab.value !== "all" && (
                        <span className="ml-1 text-muted-foreground/70">
                          {stats.pipeline[tab.value] || 0}
                        </span>
                      )}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <div className="text-muted-foreground text-sm">
                {filtered.length} contracts
              </div>
            </div>

            {/* Table */}
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="font-display font-medium text-foreground">
                      Estimate #
                    </TableHead>
                    <TableHead className="font-display font-medium text-foreground">
                      Project
                    </TableHead>
                    <TableHead className="font-display font-medium text-foreground">
                      Contractor
                    </TableHead>
                    <TableHead className="font-display font-medium text-foreground">
                      Contract Status
                    </TableHead>
                    <TableHead className="font-display font-medium text-foreground">
                      Dust Permit
                    </TableHead>
                    <TableHead className="text-right font-display font-medium text-foreground">
                      Value
                    </TableHead>
                    <TableHead className="font-display font-medium text-foreground">
                      Location
                    </TableHead>
                    <TableHead className="font-display font-medium text-foreground">
                      Linked Project
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((contract, index) => (
                    <TableRow
                      className="group transition-colors hover:bg-primary/5"
                      key={contract.id}
                      style={{ animationDelay: `${index * 15}ms` }}
                    >
                      <TableCell className="font-medium font-mono text-primary">
                        {contract.estimate_number || "—"}
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[280px] truncate font-medium">
                          {contract.name}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate text-muted-foreground">
                        {contract.contractor || "—"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          status={contract.contract_status || "Unlinked"}
                        />
                      </TableCell>
                      <TableCell>
                        {contract.dust_permit_status && (
                          <StatusBadge status={contract.dust_permit_status} />
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {contract.awarded_value || contract.bid_value
                          ? formatCurrency(
                              (contract.awarded_value ??
                                contract.bid_value) as number
                            )
                          : "—"}
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate text-muted-foreground text-sm">
                        {contract.location || "—"}
                      </TableCell>
                      <TableCell>
                        {contract.project_name ? (
                          <span className="max-w-[200px] truncate text-sm">
                            {contract.project_name}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50 text-sm italic">
                            Not linked
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell
                        className="py-12 text-center text-muted-foreground"
                        colSpan={8}
                      >
                        {search || statusTab !== "all"
                          ? "No contracts match your filters."
                          : "No won contracts found."}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
