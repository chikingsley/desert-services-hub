/**
 * Projects Page
 *
 * Lists all projects with compliance status tracking.
 * Each project tracks: contract, dust permit, NOI, SWPPP, signs.
 */
import { Mail, Search } from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import { PageHeader } from "@/apps/web/frontend/components/page-header";
import {
  PageError,
  PageLoading,
} from "@/apps/web/frontend/components/page-loading";
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
import { fetcher } from "@/apps/web/frontend/lib/fetcher";
import { formatCurrency } from "@/lib/utils";

interface ProjectFromApi {
  id: number;
  name: string;
  project_number: string | null;
  contractor: string | null;
  awarded_value: number | null;
  address: string | null;
  location_city: string | null;
  contract_status: string;
  dust_permit_status: string;
  noi_status: string;
  swppp_status: string;
  signs_status: string;
  email_count: number;
  last_seen: string | null;
  account_name: string | null;
}

interface ProjectsApiResponse {
  projects: ProjectFromApi[];
  stats: {
    total: number;
    contractStatus: Record<string, number>;
    dustPermitStatus: Record<string, number>;
  };
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/80 px-4 py-3">
      <div
        className={`font-display font-semibold text-2xl ${accent ? "text-primary" : "text-foreground"}`}
      >
        {value}
      </div>
      <div className="text-muted-foreground text-xs">{label}</div>
    </div>
  );
}

export function ProjectsPage() {
  const { data, error, isLoading } = useSWR<ProjectsApiResponse>(
    "/api/projects",
    fetcher
  );
  const [search, setSearch] = useState("");

  const projects = data?.projects ?? [];
  const stats = data?.stats ?? {
    total: 0,
    contractStatus: {},
    dustPermitStatus: {},
  };

  const filtered = search
    ? projects.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.contractor?.toLowerCase().includes(search.toLowerCase()) ||
          p.account_name?.toLowerCase().includes(search.toLowerCase()) ||
          p.address?.toLowerCase().includes(search.toLowerCase())
      )
    : projects;

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        actions={
          <div className="relative">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 w-64 pl-9"
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects..."
              value={search}
            />
          </div>
        }
        breadcrumbs={[{ label: "Projects" }]}
        title="Projects"
      />

      {error && <PageError message={error.message} />}
      {!error && isLoading && <PageLoading />}
      {!(error || isLoading) && (
        <div className="flex-1 p-6 lg:p-8">
          <div className="page-transition flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              <StatCard accent label="Total Projects" value={stats.total} />
              <StatCard
                label="Contract Pending"
                value={stats.contractStatus.Pending || 0}
              />
              <StatCard
                label="Contract Received"
                value={stats.contractStatus.Received || 0}
              />
              <StatCard
                label="Contract Executed"
                value={stats.contractStatus.Executed || 0}
              />
              <StatCard
                label="Dust Permit Issued"
                value={stats.dustPermitStatus.Issued || 0}
              />
              <StatCard
                label="Dust Permit Requested"
                value={stats.dustPermitStatus.Requested || 0}
              />
            </div>

            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="font-display font-medium text-foreground">
                      Project
                    </TableHead>
                    <TableHead className="font-display font-medium text-foreground">
                      Contractor
                    </TableHead>
                    <TableHead className="font-display font-medium text-foreground">
                      Contract
                    </TableHead>
                    <TableHead className="font-display font-medium text-foreground">
                      Dust Permit
                    </TableHead>
                    <TableHead className="font-display font-medium text-foreground">
                      NOI
                    </TableHead>
                    <TableHead className="font-display font-medium text-foreground">
                      SWPPP
                    </TableHead>
                    <TableHead className="font-display font-medium text-foreground">
                      Signs
                    </TableHead>
                    <TableHead className="text-right font-display font-medium text-foreground">
                      Value
                    </TableHead>
                    <TableHead className="text-right font-display font-medium text-foreground">
                      <Mail className="ml-auto h-4 w-4" />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((project, index) => (
                    <TableRow
                      className="group transition-colors hover:bg-primary/5"
                      key={project.id}
                      style={{ animationDelay: `${index * 20}ms` }}
                    >
                      <TableCell>
                        <div>
                          <div className="font-medium">{project.name}</div>
                          {project.address && (
                            <div className="text-muted-foreground text-xs">
                              {project.address}
                              {project.location_city &&
                                `, ${project.location_city}`}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {project.account_name || project.contractor || (
                          <span className="text-muted-foreground/50 italic">
                            —
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={project.contract_status} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={project.dust_permit_status} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={project.noi_status} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={project.swppp_status} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={project.signs_status} />
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {project.awarded_value
                          ? formatCurrency(project.awarded_value)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground text-sm tabular-nums">
                        {project.email_count || 0}
                      </TableCell>
                    </TableRow>
                  ))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell
                        className="py-12 text-center text-muted-foreground"
                        colSpan={9}
                      >
                        {search
                          ? "No projects match your search."
                          : "No projects yet."}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="text-muted-foreground text-sm">
              {filtered.length} of {projects.length} projects
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
