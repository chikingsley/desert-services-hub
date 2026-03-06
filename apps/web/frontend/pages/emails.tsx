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
  PenSquare,
  RefreshCw,
  Search,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import useSWR from "swr";
import { ComposeModal } from "@/apps/web/frontend/components/emails/compose-modal";
import { EmailDetailPanel } from "@/apps/web/frontend/components/emails/email-detail-panel";
import { EmptyState } from "@/apps/web/frontend/components/empty-state";
import { PageHeader } from "@/apps/web/frontend/components/page-header";
import {
  PageError,
  PageLoading,
} from "@/apps/web/frontend/components/page-loading";
import { StatCard } from "@/apps/web/frontend/components/stat-card";
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
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { SenderFilter } from "./email-sender-filter";
import { EmailTableRow } from "./email-table-row";
import {
  buildApiUrl,
  buildStatForTab,
  EMPTY_STATS,
  type EmailsApiResponse,
  FILTER_TABS,
  type SenderOption,
} from "./emails-helpers";

export function EmailsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get("page")) || 1;
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [filterTab, setFilterTab] = useState("inbox");
  const [selectedSenders, setSelectedSenders] = useState<SenderOption[]>([]);
  const [hasAttachmentsOnly, setHasAttachmentsOnly] = useState(false);

  // Detail panel state
  const [selectedEmailId, setSelectedEmailId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Compose modal state
  const [composeOpen, setComposeOpen] = useState(false);

  const resetPage = useCallback(() => {
    const params = new URLSearchParams(searchParams);
    params.set("page", "1");
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

  const senderEmails = useMemo(
    () => selectedSenders.map((s) => s.email),
    [selectedSenders]
  );

  const apiUrl = useMemo(
    () =>
      buildApiUrl(
        page,
        debouncedSearch,
        filterTab,
        senderEmails,
        hasAttachmentsOnly
      ),
    [page, debouncedSearch, filterTab, senderEmails, hasAttachmentsOnly]
  );

  const { data, error, isLoading, isValidating, mutate } =
    useSWR<EmailsApiResponse>(apiUrl, fetcher, {
      keepPreviousData: true,
      refreshInterval: 15_000,
      dedupingInterval: 5000,
      revalidateOnFocus: false,
    });

  const goToPage = useCallback(
    (p: number) => {
      const params = new URLSearchParams(searchParams);
      params.set("page", String(p));
      setSearchParams(params);
    },
    [searchParams, setSearchParams]
  );

  const handleFilterChange = useCallback(
    (value: string) => {
      setFilterTab(value);
      resetPage();
    },
    [resetPage]
  );

  const handleAddSender = useCallback(
    (sender: SenderOption) => {
      setSelectedSenders((prev) => {
        if (prev.some((s) => s.email === sender.email)) {
          return prev;
        }
        return [...prev, sender];
      });
      resetPage();
    },
    [resetPage]
  );

  const handleRemoveSender = useCallback(
    (email: string) => {
      setSelectedSenders((prev) => prev.filter((s) => s.email !== email));
      resetPage();
    },
    [resetPage]
  );

  const handleClearSenders = useCallback(() => {
    setSelectedSenders([]);
    resetPage();
  }, [resetPage]);

  const toggleAttachmentsOnly = useCallback(() => {
    setHasAttachmentsOnly((prev) => !prev);
    resetPage();
  }, [resetPage]);

  const handleRowClick = useCallback((emailId: number) => {
    setSelectedEmailId(emailId);
    setDetailOpen(true);
  }, []);

  const handleSpam = useCallback(
    async (domain: string) => {
      await fetch("/api/emails/domain-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, is_excluded: true }),
      });
      setDetailOpen(false);
      mutate();
    },
    [mutate]
  );

  const handleClassifyDomain = useCallback(
    async (domain: string, classification: string) => {
      await fetch("/api/emails/domain-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain, classification }),
      });
      mutate();
    },
    [mutate]
  );

  const handleClassifyEmail = useCallback(
    async (
      emailId: number,
      opts: { classification?: string | null; isExcluded?: boolean }
    ) => {
      await fetch(`/api/emails/${emailId}/classification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          classification: opts.classification ?? null,
          ...(opts.isExcluded === undefined
            ? {}
            : { is_excluded: opts.isExcluded }),
        }),
      });
      mutate();
    },
    [mutate]
  );

  const stats = data?.stats ?? EMPTY_STATS;
  const statForTab = buildStatForTab(stats);
  const emails = data?.emails ?? [];

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <div
              aria-live="polite"
              className="w-20 shrink-0 text-right text-muted-foreground text-xs"
            >
              <span
                className={data && isValidating ? "opacity-100" : "opacity-0"}
              >
                Updating...
              </span>
            </div>
            <SenderFilter
              onAddSender={handleAddSender}
              onClearSenders={handleClearSenders}
              onRemoveSender={handleRemoveSender}
              selectedSenders={selectedSenders}
            />

            <Button
              className="h-9"
              onClick={toggleAttachmentsOnly}
              size="sm"
              variant={hasAttachmentsOnly ? "default" : "outline"}
            >
              <Paperclip className="h-4 w-4" />
              Has attachments
            </Button>

            <div className="relative">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-9 w-64 pl-9"
                onChange={(e) => {
                  setSearch(e.target.value);
                }}
                placeholder="Search emails (subject, body, senders, project, attachments)..."
                value={search}
              />
            </div>
            <Button onClick={() => mutate()} size="sm" variant="outline">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
            <Button onClick={() => setComposeOpen(true)} size="sm">
              <PenSquare className="h-4 w-4" />
              Compose
            </Button>
          </div>
        }
        breadcrumbs={[{ label: "Emails" }]}
        title="Emails"
      />

      {error && <PageError message={error.message} />}
      {!error && isLoading && !data && <PageLoading />}
      {!(error || (isLoading && !data)) && (
        <div className="flex-1 p-6 lg:p-8">
          <div className="flex flex-col gap-6">
            {/* Stats bar */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
              <StatCard accent label="Total Emails" value={stats.total} />
              <StatCard label="Contracts" value={stats.contracts} />
              <StatCard label="Estimates" value={stats.estimates} />
              <StatCard label="Dust Permits" value={stats.dustPermits} />
              <StatCard label="Payments" value={stats.payments} />
              <StatCard label="Spam Blocked" value={stats.excluded} />
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
            filterTab === "inbox" ? (
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
                      {emails.map((email) => (
                        <EmailTableRow
                          email={email}
                          key={email.id}
                          onClassifyDomain={handleClassifyDomain}
                          onClassifyEmail={handleClassifyEmail}
                          onRowClick={handleRowClick}
                          onSpam={handleSpam}
                        />
                      ))}
                      {emails.length === 0 && (
                        <TableRow>
                          <TableCell
                            className="py-12 text-center text-muted-foreground"
                            colSpan={6}
                          >
                            {search || filterTab !== "inbox"
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
        onSpam={handleSpam}
        open={detailOpen}
      />

      {/* Compose modal */}
      <ComposeModal
        onClose={() => setComposeOpen(false)}
        onSent={() => mutate()}
        open={composeOpen}
      />
    </div>
  );
}
