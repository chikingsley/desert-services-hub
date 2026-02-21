/**
 * Inbox Page
 *
 * Thread-based email client view. Groups emails by conversation_id and
 * shows the latest message per thread. Supports mailbox tabs, classification
 * filters, and full-text search. Click a thread to open the full conversation
 * in a slide-in panel.
 */

import type { Email } from "@lib/db/types";
import {
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Paperclip,
  PenSquare,
  RefreshCw,
  Search,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import useSWR from "swr";
import { EmptyState } from "@/apps/web/frontend/components/empty-state";
import { ComposeModal } from "@/apps/web/frontend/components/inbox/compose-modal";
import { ThreadPanel } from "@/apps/web/frontend/components/inbox/thread-panel";
import { PageHeader } from "@/apps/web/frontend/components/page-header";
import {
  PageError,
  PageLoading,
} from "@/apps/web/frontend/components/page-loading";
import { Badge } from "@/apps/web/frontend/components/ui/badge";
import { Button } from "@/apps/web/frontend/components/ui/button";
import { Input } from "@/apps/web/frontend/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/apps/web/frontend/components/ui/select";
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
import { formatDate } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────

interface ThreadItem extends Email {
  threadCount: number;
}

interface InboxResponse {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  threads: ThreadItem[];
}

interface InboxStatsResponse {
  byClassification: { classification: string; count: number }[];
  byMailbox: {
    id: number;
    email: string;
    displayName: string | null;
    count: number;
  }[];
  recentCount: number;
  total: number;
}

// ── Classification colors (shared with detail panel) ──

const CLASSIFICATION_COLORS: Record<string, string> = {
  CONTRACT: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
  DUST_PERMIT:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  INVOICE:
    "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
  PAYMENT:
    "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  ESTIMATE:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  INSURANCE:
    "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  INTERNAL: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800/40 dark:text-zinc-400",
  HR: "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300",
  IT: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300",
  SCHEDULE: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  CHANGE_ORDER: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  VENDOR: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",
  SWPPP: "bg-lime-100 text-lime-800 dark:bg-lime-900/40 dark:text-lime-300",
};

// ── Helpers ─────────────────────────────────────────────

function formatTimeAgo(dateString: string): string {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) {
    return "just now";
  }
  if (diffMin < 60) {
    return `${diffMin}m ago`;
  }
  if (diffHr < 24) {
    return `${diffHr}h ago`;
  }
  if (diffDays < 7) {
    return `${diffDays}d ago`;
  }
  return formatDate(dateString);
}

function getSenderDisplay(thread: ThreadItem): string {
  if (thread.realSenderName) {
    return thread.realSenderName;
  }
  if (thread.fromName) {
    return thread.fromName;
  }
  return thread.fromEmail?.split("@")[0] ?? "Unknown";
}

// ── Thread Row Component ────────────────────────────────

function ThreadRow({
  thread,
  onClick,
}: {
  thread: ThreadItem;
  onClick: (conversationId: string) => void;
}) {
  const sender = getSenderDisplay(thread);
  const conversationId = thread.conversationId;

  return (
    <TableRow
      className="cursor-pointer hover:bg-muted/50"
      onClick={() => conversationId && onClick(conversationId)}
    >
      <TableCell className="max-w-[200px]">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-sm">{sender}</span>
          {thread.threadCount > 1 && (
            <Badge className="shrink-0 gap-0.5 font-normal" variant="secondary">
              <MessageSquare className="h-3 w-3" />
              {thread.threadCount}
            </Badge>
          )}
        </div>
        {thread.realSenderCompany && (
          <div className="truncate text-muted-foreground text-xs">
            {thread.realSenderCompany}
          </div>
        )}
      </TableCell>

      <TableCell className="max-w-[400px]">
        <div className="truncate text-sm">
          {thread.subject || "(no subject)"}
        </div>
        <div className="truncate text-muted-foreground text-xs">
          {thread.bodyPreview?.slice(0, 120)}
        </div>
      </TableCell>

      <TableCell className="w-[100px] whitespace-nowrap text-muted-foreground text-sm">
        {formatTimeAgo(thread.receivedAt)}
      </TableCell>

      <TableCell className="w-[120px]">
        {thread.classification && (
          <Badge
            className={
              CLASSIFICATION_COLORS[thread.classification] ??
              "bg-muted text-muted-foreground"
            }
            variant="outline"
          >
            {thread.classification.replace(/_/g, " ")}
          </Badge>
        )}
      </TableCell>

      <TableCell className="w-[120px]">
        {thread.projectName && (
          <span className="truncate text-muted-foreground text-xs">
            {thread.projectName}
          </span>
        )}
      </TableCell>

      <TableCell className="w-10">
        {thread.hasAttachments && (
          <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </TableCell>
    </TableRow>
  );
}

// ── Main Inbox Page ─────────────────────────────────────

export function InboxPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Number(searchParams.get("page")) || 1;

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [selectedMailbox, setSelectedMailbox] = useState<string>("all");
  const [selectedClassification, setSelectedClassification] =
    useState<string>("all");

  // Thread panel state
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null);
  const [threadOpen, setThreadOpen] = useState(false);

  // Compose modal state
  const [composeOpen, setComposeOpen] = useState(false);

  // Fetch stats for mailbox tabs
  const { data: stats } = useSWR<InboxStatsResponse>(
    "/api/inbox/stats",
    fetcher,
    {
      refreshInterval: 30_000,
      dedupingInterval: 10_000,
      revalidateOnFocus: false,
    }
  );

  // Build inbox API URL
  const apiUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", "50");
    if (selectedMailbox !== "all") {
      params.set("mailbox", selectedMailbox);
    }
    if (selectedClassification !== "all") {
      params.set("classification", selectedClassification);
    }
    if (debouncedSearch) {
      params.set("search", debouncedSearch);
    }
    return `/api/inbox?${params.toString()}`;
  }, [page, selectedMailbox, selectedClassification, debouncedSearch]);

  const { data, error, isLoading, isValidating, mutate } =
    useSWR<InboxResponse>(apiUrl, fetcher, {
      keepPreviousData: true,
      refreshInterval: 15_000,
      dedupingInterval: 5000,
      revalidateOnFocus: false,
    });

  const resetPage = useCallback(() => {
    const params = new URLSearchParams(searchParams);
    params.set("page", "1");
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

  const goToPage = useCallback(
    (p: number) => {
      const params = new URLSearchParams(searchParams);
      params.set("page", String(p));
      setSearchParams(params);
    },
    [searchParams, setSearchParams]
  );

  const handleMailboxChange = useCallback(
    (value: string) => {
      setSelectedMailbox(value);
      resetPage();
    },
    [resetPage]
  );

  const handleClassificationChange = useCallback(
    (value: string) => {
      setSelectedClassification(value);
      resetPage();
    },
    [resetPage]
  );

  const handleThreadClick = useCallback((conversationId: string) => {
    setSelectedConversationId(conversationId);
    setThreadOpen(true);
  }, []);

  // Top mailboxes for tabs (show up to 6 with most messages)
  const mailboxTabs = useMemo(() => {
    if (!stats?.byMailbox) {
      return [];
    }
    return stats.byMailbox.slice(0, 6).map((m) => ({
      id: String(m.id),
      label: m.email.split("@")[0] ?? m.email,
      count: m.count,
    }));
  }, [stats?.byMailbox]);

  const threads = data?.threads ?? [];

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <div
              aria-live="polite"
              className="w-16 shrink-0 text-right text-muted-foreground text-xs"
            >
              <span
                className={data && isValidating ? "opacity-100" : "opacity-0"}
              >
                Updating...
              </span>
            </div>

            {/* Classification filter */}
            <Select
              onValueChange={handleClassificationChange}
              value={selectedClassification}
            >
              <SelectTrigger className="h-9 w-[160px]">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {stats?.byClassification.map((c) => (
                  <SelectItem key={c.classification} value={c.classification}>
                    {c.classification.replace(/_/g, " ")} ({c.count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Search */}
            <div className="relative">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-9 w-64 pl-9"
                onChange={(e) => {
                  setSearch(e.target.value);
                  resetPage();
                }}
                placeholder="Search conversations..."
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
        breadcrumbs={[{ label: "Inbox" }]}
        title="Inbox"
      />

      {error && <PageError message={error.message} />}
      {!error && isLoading && !data && <PageLoading />}
      {!(error || (isLoading && !data)) && (
        <div className="flex-1 p-6 lg:p-8">
          <div className="flex flex-col gap-6">
            {/* Mailbox tabs */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Tabs onValueChange={handleMailboxChange} value={selectedMailbox}>
                <TabsList>
                  <TabsTrigger value="all">
                    All
                    {stats && (
                      <span className="ml-1 text-muted-foreground/70">
                        {stats.total}
                      </span>
                    )}
                  </TabsTrigger>
                  {mailboxTabs.map((tab) => (
                    <TabsTrigger key={tab.id} value={tab.id}>
                      {tab.label}
                      <span className="ml-1 text-muted-foreground/70">
                        {tab.count}
                      </span>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <div className="flex items-center gap-3 text-muted-foreground text-sm">
                {stats?.recentCount !== undefined && (
                  <span>{stats.recentCount} in last 24h</span>
                )}
                <span>{data?.pagination.total ?? 0} threads</span>
              </div>
            </div>

            {/* Thread list */}
            {threads.length === 0 && page === 1 && !debouncedSearch ? (
              <EmptyState
                description="No conversations found. Adjust your filters or check back later."
                title="No conversations"
              />
            ) : (
              <>
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
                        <TableHead className="font-display font-medium text-foreground">
                          Project
                        </TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {threads.map((thread) => (
                        <ThreadRow
                          key={thread.id}
                          onClick={handleThreadClick}
                          thread={thread}
                        />
                      ))}
                      {threads.length === 0 && (
                        <TableRow>
                          <TableCell
                            className="py-12 text-center text-muted-foreground"
                            colSpan={6}
                          >
                            No conversations match your filters.
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
                      {data.pagination.total} threads
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

      {/* Thread detail panel */}
      <ThreadPanel
        conversationId={selectedConversationId}
        onClose={() => setThreadOpen(false)}
        open={threadOpen}
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
