/**
 * Emails Page
 *
 * Mini email client — search, filter by classification/sender, paginated table.
 * Click a row to view full email in a slide-in panel.
 */
import {
  ChevronLeft,
  ChevronRight,
  Paperclip,
  RefreshCw,
  Search,
} from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import useSWR from "swr";
import { EmailDetailPanel } from "@/apps/web/frontend/components/emails/email-detail-panel";
import { EmptyState } from "@/apps/web/frontend/components/empty-state";
import { PageHeader } from "@/apps/web/frontend/components/page-header";
import {
  PageError,
  PageLoading,
} from "@/apps/web/frontend/components/page-loading";
import { StatCard } from "@/apps/web/frontend/components/stat-card";
import { Badge } from "@/apps/web/frontend/components/ui/badge";
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
import { formatDate } from "@/lib/utils";
import type { Email } from "@lib/db/types";

interface EmailStats {
  total: number;
  contracts: number;
  dustPermits: number;
  invoices: number;
  internal: number;
  docusign: number;
  withAttachments: number;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface EmailsApiResponse {
  emails: Email[];
  pagination: Pagination;
  stats: EmailStats;
}

// Tab config — each tab maps to a query param strategy
const FILTER_TABS = [
  { value: "all", label: "All" },
  { value: "docusign", label: "DocuSign" },
  { value: "CONTRACT", label: "Contract" },
  { value: "DUST_PERMIT", label: "Dust Permit" },
  { value: "INVOICE", label: "Invoice" },
  { value: "INTERNAL", label: "Internal" },
] as const;

const CLASSIFICATION_COLORS: Record<string, string> = {
  CONTRACT: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
  DUST_PERMIT:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  INVOICE:
    "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
  ESTIMATE:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  INSURANCE:
    "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  INTERNAL: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800/40 dark:text-zinc-400",
  SCHEDULE: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  CHANGE_ORDER:
    "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  VENDOR: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",
  SWPPP: "bg-lime-100 text-lime-800 dark:bg-lime-900/40 dark:text-lime-300",
  SPAM: "bg-zinc-100 text-zinc-400 dark:bg-zinc-800/20 dark:text-zinc-500",
  UNKNOWN: "bg-muted text-muted-foreground",
};

function buildApiUrl(
  page: number,
  search: string,
  filterTab: string
): string {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("limit", "50");

  if (search.trim()) {
    params.set("search", search.trim());
  }

  if (filterTab === "docusign") {
    params.set("from", "docusign.net");
  } else if (filterTab !== "all") {
    params.set("classification", filterTab);
  }

  return `/api/emails?${params.toString()}`;
}

export function EmailsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get("page")) || 1;
  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState("all");

  // Detail panel state
  const [selectedEmailId, setSelectedEmailId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const apiUrl = buildApiUrl(page, search, filterTab);
  const { data, error, isLoading, mutate } = useSWR<EmailsApiResponse>(
    apiUrl,
    fetcher
  );

  const goToPage = (p: number) => {
    const params = new URLSearchParams(searchParams);
    params.set("page", String(p));
    setSearchParams(params);
  };

  const handleFilterChange = (value: string) => {
    setFilterTab(value);
    const params = new URLSearchParams(searchParams);
    params.set("page", "1");
    setSearchParams(params);
  };

  const handleRowClick = (emailId: number) => {
    setSelectedEmailId(emailId);
    setDetailOpen(true);
  };

  const stats = data?.stats ?? {
    total: 0,
    contracts: 0,
    dustPermits: 0,
    invoices: 0,
    internal: 0,
    docusign: 0,
    withAttachments: 0,
  };

  const statForTab: Record<string, number> = {
    docusign: stats.docusign,
    CONTRACT: stats.contracts,
    DUST_PERMIT: stats.dustPermits,
    INVOICE: stats.invoices,
    INTERNAL: stats.internal,
  };

  const emails = data?.emails ?? [];

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        actions={
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-9 w-64 pl-9"
                onChange={(e) => {
                  setSearch(e.target.value);
                  // Reset to page 1 on search change
                  const params = new URLSearchParams(searchParams);
                  params.set("page", "1");
                  setSearchParams(params);
                }}
                placeholder="Search emails..."
                value={search}
              />
            </div>
            <Button onClick={() => mutate()} size="sm" variant="outline">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        }
        breadcrumbs={[{ label: "Emails" }]}
        title="Emails"
      />

      {error && <PageError message={error.message} />}
      {!error && isLoading && <PageLoading />}
      {!(error || isLoading) && (
        <div className="flex-1 p-6 lg:p-8">
          <div className="page-transition flex flex-col gap-6">
            {/* Stats bar */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <StatCard accent label="Total Emails" value={stats.total} />
              <StatCard label="DocuSign" value={stats.docusign} />
              <StatCard label="Contracts" value={stats.contracts} />
              <StatCard label="Dust Permits" value={stats.dustPermits} />
              <StatCard label="Invoices" value={stats.invoices} />
              <StatCard label="w/ Attachments" value={stats.withAttachments} />
            </div>

            {/* Filter tabs + count */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Tabs onValueChange={handleFilterChange} value={filterTab}>
                <TabsList>
                  {FILTER_TABS.map((tab) => (
                    <TabsTrigger key={tab.value} value={tab.value}>
                      {tab.label}
                      {tab.value !== "all" && (
                        <span className="ml-1 text-muted-foreground/70">
                          {statForTab[tab.value] || 0}
                        </span>
                      )}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <div className="text-muted-foreground text-sm">
                {data?.pagination.total ?? 0} emails
              </div>
            </div>

            {emails.length === 0 &&
            page === 1 &&
            !search &&
            filterTab === "all" ? (
              <EmptyState
                description="No emails have been synced yet. Emails are synced automatically from Outlook."
                title="No emails"
              />
            ) : (
              <>
                {/* Table */}
                <div className="overflow-hidden rounded-xl border border-border bg-card">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableHead className="font-display font-medium text-foreground">
                          From
                        </TableHead>
                        <TableHead className="font-display font-medium text-foreground">
                          Subject
                        </TableHead>
                        <TableHead className="font-display font-medium text-foreground">
                          Date
                        </TableHead>
                        <TableHead className="font-display font-medium text-foreground">
                          Type
                        </TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {emails.map((email, index) => (
                        <TableRow
                          className="group cursor-pointer transition-colors hover:bg-primary/5"
                          key={email.id}
                          onClick={() => handleRowClick(email.id)}
                          style={{ animationDelay: `${index * 15}ms` }}
                        >
                          <TableCell>
                            <div className="max-w-[220px]">
                              <div className="truncate font-medium text-sm">
                                {email.fromName || email.fromEmail || "—"}
                              </div>
                              {email.fromName && email.fromEmail && (
                                <div className="truncate text-muted-foreground text-xs">
                                  {email.fromEmail}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="max-w-[400px] truncate">
                              {email.subject || "(no subject)"}
                            </div>
                            {email.bodyPreview && (
                              <div className="mt-0.5 max-w-[400px] truncate text-muted-foreground text-xs">
                                {email.bodyPreview.slice(0, 100)}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground text-sm">
                            {formatDate(email.receivedAt)}
                          </TableCell>
                          <TableCell>
                            {email.classification && (
                              <Badge
                                className={
                                  CLASSIFICATION_COLORS[
                                    email.classification
                                  ] || "bg-muted text-muted-foreground"
                                }
                                variant="outline"
                              >
                                {email.classification.replace(/_/g, " ")}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {email.hasAttachments && (
                              <Paperclip className="h-4 w-4 text-muted-foreground" />
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                      {emails.length === 0 && (
                        <TableRow>
                          <TableCell
                            className="py-12 text-center text-muted-foreground"
                            colSpan={5}
                          >
                            {search || filterTab !== "all"
                              ? "No emails match your filters."
                              : "No emails found."}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {data && data.pagination.totalPages > 1 && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-sm">
                      {data.pagination.total} emails
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        disabled={data.pagination.page <= 1}
                        onClick={() => goToPage(data.pagination.page - 1)}
                        size="sm"
                        variant="outline"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm">
                        Page {data.pagination.page} of{" "}
                        {data.pagination.totalPages}
                      </span>
                      <Button
                        disabled={
                          data.pagination.page >= data.pagination.totalPages
                        }
                        onClick={() => goToPage(data.pagination.page + 1)}
                        size="sm"
                        variant="outline"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Email detail panel */}
      <EmailDetailPanel
        emailId={selectedEmailId}
        onClose={() => setDetailOpen(false)}
        open={detailOpen}
      />
    </div>
  );
}
