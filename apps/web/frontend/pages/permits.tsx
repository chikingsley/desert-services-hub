/**
 * Dust Permits Page
 *
 * Lists all dust permits filed by Desert Services with status filtering.
 */
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { PageHeader } from "@/apps/web/frontend/components/page-header";
import {
  PageError,
  PageLoading,
} from "@/apps/web/frontend/components/page-loading";
import { StatCard } from "@/apps/web/frontend/components/stat-card";
import { StatusBadge } from "@/apps/web/frontend/components/status-badge";
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
  permits: PermitFromApi[];
  stats: {
    total: number;
    active: number;
    closed: number;
    superseded: number;
    rejected: number;
    pendingPayment: number;
    submitted: number;
    unlinked: number;
  };
}

function formatPermitDate(dateStr: string | null): string {
  if (!dateStr) {
    return "—";
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

const STATUS_TABS = [
  { value: "all", label: "All" },
  { value: "Active", label: "Active" },
  { value: "Closed", label: "Closed" },
  { value: "Superseded", label: "Superseded" },
  { value: "Rejected", label: "Rejected" },
] as const;

export function PermitsPage() {
  const { data, error, isLoading } = useSWR<PermitsApiResponse>(
    "/api/permits",
    fetcher
  );
  const [search, setSearch] = useState("");
  const [statusTab, setStatusTab] = useState("all");
  const normalizedSearch = search.trim().toLowerCase();

  const permits = data?.permits ?? [];
  const stats = data?.stats ?? {
    total: 0,
    active: 0,
    closed: 0,
    superseded: 0,
    rejected: 0,
    pendingPayment: 0,
    submitted: 0,
    unlinked: 0,
  };

  const filtered = useMemo(() => {
    return permits.filter((p) => {
      const matchesStatus = statusTab === "all" || p.status === statusTab;
      const matchesSearch =
        !normalizedSearch ||
        p.project_name?.toLowerCase().includes(normalizedSearch) ||
        p.id.toLowerCase().includes(normalizedSearch) ||
        p.address?.toLowerCase().includes(normalizedSearch) ||
        p.company_name?.toLowerCase().includes(normalizedSearch);
      return matchesStatus && matchesSearch;
    });
  }, [permits, statusTab, normalizedSearch]);

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        actions={
          <div className="relative">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 w-64 pl-9"
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search permits..."
              value={search}
            />
          </div>
        }
        breadcrumbs={[{ label: "Dust Permits" }]}
        title="Dust Permits"
      />

      {error && <PageError message={error.message} />}
      {!error && isLoading && <PageLoading />}
      {!(error || isLoading) && (
        <div className="flex-1 p-6 lg:p-8">
          <div className="page-transition flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatCard accent label="Total Permits" value={stats.total} />
              <StatCard label="Active" value={stats.active} />
              <StatCard label="Closed" value={stats.closed} />
              <StatCard label="Superseded" value={stats.superseded} />
              <StatCard label="Rejected" value={stats.rejected} />
              <StatCard label="Unlinked" value={stats.unlinked} />
            </div>

            {/* Filter tabs + count */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Tabs onValueChange={setStatusTab} value={statusTab}>
                <TabsList>
                  {STATUS_TABS.map((tab) => (
                    <TabsTrigger key={tab.value} value={tab.value}>
                      {tab.label}
                      {tab.value !== "all" && (
                        <span className="ml-1 text-muted-foreground/70">
                          {stats[tab.value.toLowerCase() as keyof typeof stats]}
                        </span>
                      )}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <div className="text-muted-foreground text-sm">
                {filtered.length} permits
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="font-display font-medium text-foreground">
                      Permit ID
                    </TableHead>
                    <TableHead className="font-display font-medium text-foreground">
                      Project
                    </TableHead>
                    <TableHead className="font-display font-medium text-foreground">
                      Company
                    </TableHead>
                    <TableHead className="font-display font-medium text-foreground">
                      Status
                    </TableHead>
                    <TableHead className="font-display font-medium text-foreground">
                      Address
                    </TableHead>
                    <TableHead className="font-display font-medium text-foreground">
                      Effective
                    </TableHead>
                    <TableHead className="font-display font-medium text-foreground">
                      Expiration
                    </TableHead>
                    <TableHead className="font-display font-medium text-foreground">
                      Submitted
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((permit, index) => (
                    <TableRow
                      className="group transition-colors hover:bg-primary/5"
                      key={permit.id}
                      style={{ animationDelay: `${index * 15}ms` }}
                    >
                      <TableCell className="font-medium font-mono text-primary">
                        {permit.id}
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="max-w-[250px] truncate font-medium">
                            {permit.project_name || (
                              <span className="text-muted-foreground/50 italic">
                                —
                              </span>
                            )}
                          </div>
                          {permit.project_db_name &&
                            permit.project_db_name !== permit.project_name && (
                              <div className="max-w-[250px] truncate text-muted-foreground text-xs">
                                {permit.project_db_name}
                              </div>
                            )}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate text-muted-foreground">
                        {permit.company_name || "—"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={permit.status} />
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-muted-foreground text-sm">
                        {permit.address || "—"}
                        {permit.city && `, ${permit.city}`}
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
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell
                        className="py-12 text-center text-muted-foreground"
                        colSpan={8}
                      >
                        {search || statusTab !== "all"
                          ? "No permits match your filters."
                          : "No permits found."}
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
