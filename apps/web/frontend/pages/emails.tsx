/**
 * Emails Page
 *
 * Mini email client — search, filter by classification/sender, paginated table.
 * Click a row to view full email in a slide-in panel.
 */

import type { Email } from "@lib/db/types";
import {
  Ban,
  Check,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Paperclip,
  RefreshCw,
  Search,
  Tag,
  Users,
  X,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/apps/web/frontend/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/apps/web/frontend/components/ui/dropdown-menu";
import { Input } from "@/apps/web/frontend/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/apps/web/frontend/components/ui/popover";
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
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { fetcher } from "@/apps/web/frontend/lib/fetcher";
import { formatDate } from "@/lib/utils";

interface EmailStats {
  total: number;
  estimates: number;
  contracts: number;
  dustPermits: number;
  invoices: number;
  payments: number;
  hr: number;
  it: number;
  internal: number;
  docusign: number;
  withAttachments: number;
  excluded: number;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

type EmailWithDedup = Email & { recipientCount: number };

interface EmailsApiResponse {
  emails: EmailWithDedup[];
  pagination: Pagination;
  stats: EmailStats;
}

interface SenderOption {
  email: string;
  displayName: string;
  count: number;
}

// Tab config — each tab maps to a query param strategy
const FILTER_TABS = [
  { value: "inbox", label: "Inbox" },
  { value: "all", label: "All" },
  { value: "CONTRACT", label: "Contract" },
  { value: "ESTIMATE", label: "Estimate" },
  { value: "DUST_PERMIT", label: "Dust Permit" },
  { value: "PAYMENT", label: "Payment" },
  { value: "HR", label: "HR" },
  { value: "IT", label: "IT" },
  { value: "spam", label: "Spam" },
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
  CHANGE_ORDER: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  VENDOR: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",
  SWPPP: "bg-lime-100 text-lime-800 dark:bg-lime-900/40 dark:text-lime-300",
  PAYMENT:
    "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  HR: "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300",
  IT: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300",
  SPAM: "bg-zinc-100 text-zinc-400 dark:bg-zinc-800/20 dark:text-zinc-500",
  UNKNOWN: "bg-muted text-muted-foreground",
};

// Categories available for domain-level classification
const CLASSIFY_OPTIONS = [
  { value: "ESTIMATE", label: "Estimate" },
  { value: "CONTRACT", label: "Contract" },
  { value: "DUST_PERMIT", label: "Dust Permit" },
  { value: "PAYMENT", label: "Payment" },
  { value: "HR", label: "HR" },
  { value: "IT", label: "IT" },
  { value: "INSURANCE", label: "Insurance" },
  { value: "SCHEDULE", label: "Schedule" },
  { value: "VENDOR", label: "Vendor" },
] as const;

function buildApiUrl(
  page: number,
  search: string,
  filterTab: string,
  senderEmails: string[],
  hasAttachmentsOnly: boolean
): string {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("limit", "50");

  if (search.trim()) {
    params.set("search", search.trim());
  }

  if (filterTab === "inbox") {
    // Actionable default: hide noisy categories but keep dedicated tabs for them.
    params.set("exclude_classifications", "HR,IT");
  } else if (filterTab === "spam") {
    params.set("only_excluded", "1");
  } else if (filterTab !== "all") {
    params.set("classification", filterTab);
  }

  if (senderEmails.length > 0) {
    params.set("senders", senderEmails.join(","));
  }

  if (hasAttachmentsOnly) {
    params.set("has_attachments", "1");
  }

  return `/api/emails?${params.toString()}`;
}

export function EmailsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get("page")) || 1;
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [filterTab, setFilterTab] = useState("inbox");
  const [selectedSenders, setSelectedSenders] = useState<SenderOption[]>([]);
  const [senderPickerOpen, setSenderPickerOpen] = useState(false);
  const [senderQuery, setSenderQuery] = useState("");
  const [hasAttachmentsOnly, setHasAttachmentsOnly] = useState(false);

  // Detail panel state
  const [selectedEmailId, setSelectedEmailId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

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
      // Keep table stable when changing tabs/pages/search to avoid flicker.
      keepPreviousData: true,
      // Inbox changes frequently; refresh in background without full remount.
      refreshInterval: 15_000,
      dedupingInterval: 5000,
      revalidateOnFocus: false,
    });

  const senderApiUrl = useMemo(() => {
    if (!senderPickerOpen) {
      return null;
    }
    const params = new URLSearchParams();
    params.set("limit", "30");
    if (senderQuery.trim()) {
      params.set("q", senderQuery.trim());
    }
    return `/api/emails/senders?${params.toString()}`;
  }, [senderPickerOpen, senderQuery]);

  const { data: senderData, isLoading: sendersLoading } = useSWR<{
    senders: SenderOption[];
  }>(senderApiUrl, fetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
    dedupingInterval: 5000,
  });

  const senderOptions = senderData?.senders ?? [];
  const selectedSenderSet = useMemo(
    () => new Set(selectedSenders.map((s) => s.email)),
    [selectedSenders]
  );

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
      setSenderQuery("");
      setSenderPickerOpen(false);
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

  const stats = data?.stats ?? {
    total: 0,
    estimates: 0,
    contracts: 0,
    dustPermits: 0,
    invoices: 0,
    payments: 0,
    hr: 0,
    it: 0,
    internal: 0,
    docusign: 0,
    withAttachments: 0,
    excluded: 0,
  };

  const statForTab: Record<string, number> = {
    inbox: Math.max(0, stats.total - stats.hr - stats.it),
    ESTIMATE: stats.estimates,
    CONTRACT: stats.contracts,
    DUST_PERMIT: stats.dustPermits,
    PAYMENT: stats.payments,
    HR: stats.hr,
    IT: stats.it,
    spam: stats.excluded,
  };

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
            <Popover onOpenChange={setSenderPickerOpen} open={senderPickerOpen}>
              <PopoverTrigger asChild>
                <Button className="h-9" size="sm" variant="outline">
                  <Users className="h-4 w-4" />
                  {selectedSenders.length > 0
                    ? `Senders (${selectedSenders.length})`
                    : "Filter senders"}
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-[340px] p-0"
                onOpenAutoFocus={(e) => e.preventDefault()}
              >
                <Command>
                  <CommandInput
                    className="h-9"
                    onValueChange={setSenderQuery}
                    placeholder="Type sender name or email..."
                    value={senderQuery}
                  />
                  <CommandList className="max-h-72">
                    <CommandEmpty>
                      {sendersLoading
                        ? "Loading senders..."
                        : "No sender found."}
                    </CommandEmpty>
                    <CommandGroup>
                      {senderOptions.map((sender) => {
                        const isSelected = selectedSenderSet.has(sender.email);
                        return (
                          <CommandItem
                            key={sender.email}
                            onSelect={() =>
                              isSelected
                                ? handleRemoveSender(sender.email)
                                : handleAddSender(sender)
                            }
                            value={`${sender.displayName} ${sender.email}`}
                          >
                            <Check
                              className={
                                isSelected
                                  ? "h-4 w-4 opacity-100"
                                  : "h-4 w-4 opacity-0"
                              }
                            />
                            <div className="min-w-0">
                              <div className="truncate text-sm">
                                {sender.displayName}
                              </div>
                              <div className="truncate text-muted-foreground text-xs">
                                {sender.email}
                              </div>
                            </div>
                            <span className="ml-auto text-muted-foreground text-xs">
                              {sender.count}
                            </span>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {selectedSenders.length > 0 && (
              <div className="flex max-w-[420px] flex-wrap items-center gap-1">
                {selectedSenders.map((sender) => (
                  <Badge
                    className="gap-1 pr-1"
                    key={sender.email}
                    variant="secondary"
                  >
                    <span className="max-w-[170px] truncate">
                      {sender.displayName}
                    </span>
                    <button
                      aria-label={`Remove sender ${sender.email}`}
                      className="rounded p-0.5 hover:bg-muted/60"
                      onClick={() => handleRemoveSender(sender.email)}
                      type="button"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                <Button
                  className="h-7 px-2 text-xs"
                  onClick={handleClearSenders}
                  size="sm"
                  variant="ghost"
                >
                  Clear
                </Button>
              </div>
            )}

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
                      {emails.map((email) => {
                        const fromDomain = email.fromDomain;
                        return (
                          <TableRow
                            className="group cursor-pointer transition-colors hover:bg-primary/5"
                            key={email.id}
                            onClick={() => handleRowClick(email.id)}
                          >
                            <TableCell>
                              <div className="max-w-[220px]">
                                <div className="flex items-center gap-1.5">
                                  <span className="truncate font-medium text-sm">
                                    {email.fromName || email.fromEmail || "—"}
                                  </span>
                                  {email.recipientCount > 1 && (
                                    <Badge
                                      className="shrink-0 gap-0.5 bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
                                      variant="outline"
                                    >
                                      <Users className="h-3 w-3" />
                                      {email.recipientCount}
                                    </Badge>
                                  )}
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
                              {(email.classification || email.isExcluded) && (
                                <Badge
                                  className={
                                    CLASSIFICATION_COLORS[
                                      email.classification || "SPAM"
                                    ] || "bg-muted text-muted-foreground"
                                  }
                                  variant="outline"
                                >
                                  {(email.classification || "SPAM").replace(
                                    /_/g,
                                    " "
                                  )}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                {email.hasAttachments && (
                                  <Paperclip className="h-4 w-4 text-muted-foreground" />
                                )}
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      className="h-7 w-7 opacity-0 group-hover:opacity-100"
                                      onClick={(e) => e.stopPropagation()}
                                      size="icon"
                                      variant="ghost"
                                    >
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent
                                    align="end"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <DropdownMenuLabel className="text-xs">
                                      This email only
                                    </DropdownMenuLabel>
                                    {CLASSIFY_OPTIONS.map((opt) => (
                                      <DropdownMenuItem
                                        key={`single-${opt.value}`}
                                        onClick={() =>
                                          handleClassifyEmail(email.id, {
                                            classification: opt.value,
                                            isExcluded: false,
                                          })
                                        }
                                      >
                                        <Tag className="mr-2 h-3.5 w-3.5" />
                                        {opt.label}
                                      </DropdownMenuItem>
                                    ))}
                                    <DropdownMenuItem
                                      onClick={() =>
                                        handleClassifyEmail(email.id, {
                                          classification: null,
                                          isExcluded: false,
                                        })
                                      }
                                    >
                                      <Tag className="mr-2 h-3.5 w-3.5" />
                                      Clear classification
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      className="text-destructive"
                                      onClick={() =>
                                        handleClassifyEmail(email.id, {
                                          classification: "SPAM",
                                          isExcluded: true,
                                        })
                                      }
                                    >
                                      <Ban className="mr-2 h-3.5 w-3.5" />
                                      Mark as spam (email only)
                                    </DropdownMenuItem>

                                    {fromDomain && (
                                      <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuLabel className="text-xs">
                                          Domain rule ({fromDomain})
                                        </DropdownMenuLabel>
                                        {CLASSIFY_OPTIONS.map((opt) => (
                                          <DropdownMenuItem
                                            key={`domain-${opt.value}`}
                                            onClick={() =>
                                              handleClassifyDomain(
                                                fromDomain,
                                                opt.value
                                              )
                                            }
                                          >
                                            <Tag className="mr-2 h-3.5 w-3.5" />
                                            {opt.label}
                                          </DropdownMenuItem>
                                        ))}
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                          className="text-destructive"
                                          onClick={() => handleSpam(fromDomain)}
                                        >
                                          <Ban className="mr-2 h-3.5 w-3.5" />
                                          Block {fromDomain}
                                        </DropdownMenuItem>
                                      </>
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
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
    </div>
  );
}
