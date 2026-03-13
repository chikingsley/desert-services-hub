import {
  RefreshCw,
  ShieldCheck,
  ShieldOff,
  UserRoundSearch,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { PageHeader } from "@/apps/web/frontend/components/page-header";
import {
  PageError,
  PageLoading,
} from "@/apps/web/frontend/components/page-loading";
import { ReviewQueueCard } from "@/apps/web/frontend/components/review/review-queue-card";
import { StatCard } from "@/apps/web/frontend/components/stat-card";
import { Badge } from "@/apps/web/frontend/components/ui/badge";
import { Button } from "@/apps/web/frontend/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/apps/web/frontend/components/ui/card";
import { Input } from "@/apps/web/frontend/components/ui/input";
import { Kbd } from "@/apps/web/frontend/components/ui/kbd";
import { Label } from "@/apps/web/frontend/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/apps/web/frontend/components/ui/select";
import { Switch } from "@/apps/web/frontend/components/ui/switch";
import { useDebouncedValue } from "@/apps/web/frontend/hooks/use-debounced-value";
import { fetcher } from "@/apps/web/frontend/lib/fetcher";

type SenderReviewStatus =
  | "all"
  | "private"
  | "reviewed"
  | "spam"
  | "unreviewed";

interface SenderReviewSample {
  accountDomain: string | null;
  accountName: string | null;
  accountType: string | null;
  emailId: number;
  receivedAt: string;
  senderEmail: string | null;
  senderName: string | null;
  subject: string | null;
}

interface LlmVerdict {
  category: string | null;
  confidence: number | null;
  isWorkRelated: boolean;
  reason: string | null;
}

interface SenderReviewItem {
  domain: string;
  emailCount: number;
  firstReceivedAt: string | null;
  lastReceivedAt: string | null;
  linkedAccountCount: number;
  llmVerdict: LlmVerdict | null;
  matchedRuleDomain: string | null;
  reviewed: boolean;
  rule: {
    classification: string | null;
    createdAt: string | null;
    domain: string;
    isExcluded: boolean;
  } | null;
  samples: SenderReviewSample[];
  senderCount: number;
}

interface SenderReviewResponse {
  items: SenderReviewItem[];
  pagination: {
    limit: number;
    page: number;
    total: number;
    totalPages: number;
  };
  requestId: string;
  stats: {
    activeDomains: number;
    activeUnclassifiedEmails: number;
    privateDomains: number;
    reviewedDomains: number;
    spamDomains: number;
    unreviewedDomains: number;
  };
}

interface SenderReviewAudit {
  createdAt: string | null;
  domain: string;
  inputTokens: number | null;
  metadata: Record<string, unknown> | null;
  model: string | null;
  outputTokens: number | null;
  processingTimeMs: number | null;
  promptInput: {
    domain?: string;
    emailCount?: number;
    samples?: Record<string, unknown>[];
  } | null;
  promptText: string | null;
  promptVersion: string | null;
  provider: string | null;
  rawResult: Record<string, unknown> | null;
  reason: string | null;
  totalTokens: number | null;
  updatedAt: string | null;
}

interface SenderReviewAuditResponse {
  audit: SenderReviewAudit;
}

const STATUS_OPTIONS: Array<{ label: string; value: SenderReviewStatus }> = [
  { label: "Needs review", value: "unreviewed" },
  { label: "Reviewed", value: "reviewed" },
  { label: "Private", value: "private" },
  { label: "Spam", value: "spam" },
  { label: "All", value: "all" },
];

const QUEUE_LIMIT = 100;
const QUEUE_REFRESH_DEBOUNCE_MS = 750;

function formatCount(value: number): string {
  return value.toLocaleString();
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "—";
  }
  return new Date(value).toLocaleString();
}

function formatMaybeCount(value: number | null | undefined): string {
  if (typeof value !== "number") {
    return "—";
  }
  return value.toLocaleString();
}

function renderRuleLabel(item: SenderReviewItem): string {
  if (!item.rule) {
    return "Needs review";
  }
  if (item.rule.classification) {
    return item.rule.classification;
  }
  return item.rule.isExcluded ? "Excluded" : "Trusted";
}

function ruleBadgeClass(item: SenderReviewItem): string {
  if (!item.rule) {
    return "bg-amber-100 text-amber-900";
  }

  switch (item.rule.classification) {
    case "SPAM":
      return "bg-zinc-200 text-zinc-700";
    case "HR":
      return "bg-pink-100 text-pink-800";
    case "IT":
      return "bg-cyan-100 text-cyan-800";
    default:
      return item.rule.isExcluded
        ? "bg-zinc-200 text-zinc-700"
        : "bg-emerald-100 text-emerald-800";
  }
}

function verdictBadgeClass(verdict: LlmVerdict): string {
  return verdict.isWorkRelated
    ? "bg-emerald-100 text-emerald-800"
    : "bg-red-100 text-red-800";
}

function verdictLabel(verdict: LlmVerdict): string {
  return verdict.isWorkRelated ? "Work" : "Not work";
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(
    target.closest(
      'input, textarea, select, [contenteditable="true"], [role="textbox"]'
    )
  );
}

function buildSenderReviewApiUrl(
  search: string,
  status: SenderReviewStatus
): string {
  const params = new URLSearchParams();
  params.set("limit", String(QUEUE_LIMIT));
  params.set("status", status);
  if (search.trim()) {
    params.set("search", search.trim());
  }
  return `/api/emails/sender-review?${params.toString()}`;
}

export function SenderReviewPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<SenderReviewStatus>("unreviewed");
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [savingDomain, setSavingDomain] = useState<string | null>(null);
  const [hotkeysEnabled, setHotkeysEnabled] = useState(false);
  const [dismissedDomains, setDismissedDomains] = useState<string[]>([]);
  const [classifying, setClassifying] = useState(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedSearch = useDebouncedValue(search, 300);

  const apiUrl = useMemo(
    () => buildSenderReviewApiUrl(debouncedSearch, status),
    [debouncedSearch, status]
  );

  const { data, error, isLoading, isValidating, mutate } =
    useSWR<SenderReviewResponse>(apiUrl, fetcher, {
      dedupingInterval: 5000,
      keepPreviousData: true,
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    });

  const clearQueuedRefresh = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  const scheduleQueueRefresh = useCallback(() => {
    clearQueuedRefresh();
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      mutate().catch((refreshError) => {
        console.error("Failed to refresh sender review queue:", refreshError);
      });
    }, QUEUE_REFRESH_DEBOUNCE_MS);
  }, [clearQueuedRefresh, mutate]);

  useEffect(() => clearQueuedRefresh, [clearQueuedRefresh]);

  useEffect(() => {
    if (apiUrl) {
      setDismissedDomains([]);
    }
  }, [apiUrl]);

  const items = data?.items ?? [];
  const visibleItems = useMemo(() => {
    if (status !== "unreviewed" || dismissedDomains.length === 0) {
      return items;
    }

    const dismissed = new Set(dismissedDomains);
    return items.filter((item) => !dismissed.has(item.domain));
  }, [dismissedDomains, items, status]);

  useEffect(() => {
    const firstDomain = visibleItems[0]?.domain ?? null;
    if (!selectedDomain && firstDomain) {
      setSelectedDomain(firstDomain);
      return;
    }

    if (
      selectedDomain &&
      !visibleItems.some((item) => item.domain === selectedDomain)
    ) {
      setSelectedDomain(firstDomain);
    }
  }, [selectedDomain, visibleItems]);

  const selectedItem =
    visibleItems.find((item) => item.domain === selectedDomain) ?? null;
  const auditUrl = selectedItem?.llmVerdict
    ? `/api/emails/sender-review/${encodeURIComponent(selectedItem.domain)}/audit`
    : null;
  const {
    data: auditData,
    error: auditError,
    isLoading: isAuditLoading,
  } = useSWR<SenderReviewAuditResponse>(auditUrl, fetcher, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });
  const audit = auditData?.audit ?? null;
  const stats = data?.stats;

  const applyRule = useCallback(
    async (
      domain: string,
      payload: { classification: string | null; is_excluded: boolean },
      successLabel: string
    ) => {
      try {
        setSavingDomain(domain);
        const response = await fetch("/api/emails/domain-rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain, ...payload }),
        });

        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || `HTTP ${response.status}`);
        }

        if (data) {
          const currentIndex = data.items.findIndex(
            (item) => item.domain === domain
          );
          const currentItem =
            currentIndex >= 0 ? data.items[currentIndex] : null;

          if (currentItem) {
            const remainingItems = data.items.filter(
              (item) => item.domain !== domain
            );
            const nextSelectedDomain =
              remainingItems[currentIndex]?.domain ??
              remainingItems[currentIndex - 1]?.domain ??
              null;
            const nextTotal = Math.max(0, data.pagination.total - 1);

            setSelectedDomain(nextSelectedDomain);
            setDismissedDomains((current) =>
              current.includes(domain) ? current : [...current, domain]
            );
            mutate(
              {
                ...data,
                items: remainingItems,
                pagination: {
                  ...data.pagination,
                  total: nextTotal,
                },
                stats: {
                  ...data.stats,
                  activeDomains: Math.max(0, data.stats.activeDomains - 1),
                  activeUnclassifiedEmails: Math.max(
                    0,
                    data.stats.activeUnclassifiedEmails - currentItem.emailCount
                  ),
                  unreviewedDomains:
                    status === "unreviewed"
                      ? Math.max(0, data.stats.unreviewedDomains - 1)
                      : data.stats.unreviewedDomains,
                  reviewedDomains:
                    !currentItem.rule && status === "unreviewed"
                      ? data.stats.reviewedDomains + 1
                      : data.stats.reviewedDomains,
                  privateDomains:
                    payload.classification === "HR" ||
                    payload.classification === "IT"
                      ? data.stats.privateDomains + 1
                      : data.stats.privateDomains,
                  spamDomains:
                    payload.classification === "SPAM"
                      ? data.stats.spamDomains + 1
                      : data.stats.spamDomains,
                },
              },
              { revalidate: false }
            );
          }
        }

        toast.success(successLabel);
        scheduleQueueRefresh();
      } catch (applyError) {
        toast.error(
          applyError instanceof Error
            ? applyError.message
            : "Failed to save domain rule"
        );
      } finally {
        setSavingDomain(null);
      }
    },
    [data, mutate, scheduleQueueRefresh, status]
  );

  const runClassifyBatch = useCallback(async () => {
    if (classifying) {
      return;
    }
    setClassifying(true);
    try {
      const response = await fetch("/api/emails/sender-review/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 25, provider: "openrouter" }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const result = (await response.json()) as {
        results?: unknown[];
      };
      const count = result.results?.length ?? 0;
      toast.success(`Classified ${count} domains`);
      mutate();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to classify domains"
      );
    } finally {
      setClassifying(false);
    }
  }, [classifying, mutate]);

  const approveVerdict = useCallback(
    async (domain: string) => {
      try {
        setSavingDomain(domain);
        const response = await fetch(
          `/api/emails/sender-review/classify/${encodeURIComponent(domain)}`,
          { method: "POST" }
        );
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const result = (await response.json()) as {
          isWorkRelated?: boolean;
        };
        const label = result.isWorkRelated
          ? `Trusted ${domain}`
          : `Excluded ${domain}`;

        if (data) {
          const currentIndex = data.items.findIndex(
            (item) => item.domain === domain
          );
          const remainingItems = data.items.filter(
            (item) => item.domain !== domain
          );
          const nextSelectedDomain =
            remainingItems[currentIndex]?.domain ??
            remainingItems[currentIndex - 1]?.domain ??
            null;

          setSelectedDomain(nextSelectedDomain);
          setDismissedDomains((current) =>
            current.includes(domain) ? current : [...current, domain]
          );
          mutate(
            {
              ...data,
              items: remainingItems,
              pagination: {
                ...data.pagination,
                total: Math.max(0, data.pagination.total - 1),
              },
              stats: {
                ...data.stats,
                activeDomains: Math.max(0, data.stats.activeDomains - 1),
                unreviewedDomains: Math.max(
                  0,
                  data.stats.unreviewedDomains - 1
                ),
                reviewedDomains: data.stats.reviewedDomains + 1,
              },
            },
            { revalidate: false }
          );
        }

        toast.success(label);
        scheduleQueueRefresh();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to approve domain"
        );
      } finally {
        setSavingDomain(null);
      }
    },
    [data, mutate, scheduleQueueRefresh]
  );

  useEffect(() => {
    if (!hotkeysEnabled) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey ||
        savingDomain ||
        !selectedItem ||
        isTypingTarget(event.target)
      ) {
        return;
      }

      switch (event.key) {
        // y = approve LLM verdict (or trust if no verdict)
        case "y": {
          event.preventDefault();
          if (selectedItem.llmVerdict) {
            approveVerdict(selectedItem.domain);
          } else {
            applyRule(
              selectedItem.domain,
              { classification: null, is_excluded: false },
              `Trusted ${selectedItem.domain}`
            );
          }
          break;
        }
        // n = skip to next domain
        case "n": {
          event.preventDefault();
          const currentIndex = visibleItems.findIndex(
            (item) => item.domain === selectedItem.domain
          );
          const next = visibleItems[currentIndex + 1]?.domain ?? null;
          if (next) {
            setSelectedDomain(next);
          }
          break;
        }
        // Manual overrides still available
        case "1":
          event.preventDefault();
          applyRule(
            selectedItem.domain,
            { classification: null, is_excluded: false },
            `Trusted ${selectedItem.domain}`
          );
          break;
        case "2":
          event.preventDefault();
          applyRule(
            selectedItem.domain,
            { classification: "HR", is_excluded: true },
            `Marked ${selectedItem.domain} as HR/private`
          );
          break;
        case "3":
          event.preventDefault();
          applyRule(
            selectedItem.domain,
            { classification: "IT", is_excluded: true },
            `Marked ${selectedItem.domain} as IT/private`
          );
          break;
        case "4":
          event.preventDefault();
          applyRule(
            selectedItem.domain,
            { classification: "SPAM", is_excluded: true },
            `Blocked ${selectedItem.domain} as spam`
          );
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    applyRule,
    approveVerdict,
    hotkeysEnabled,
    savingDomain,
    selectedItem,
    visibleItems,
  ]);

  if (isLoading && !data) {
    return <PageLoading />;
  }

  if (error && !data) {
    return <PageError message={error.message} />;
  }

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        actions={
          <div className="flex gap-2">
            <Button
              disabled={classifying}
              onClick={runClassifyBatch}
              size="sm"
              variant="default"
            >
              {classifying ? "Classifying..." : "Classify Next 25"}
            </Button>
            <Button
              onClick={() => {
                clearQueuedRefresh();
                mutate().catch((refreshError) => {
                  console.error(
                    "Failed to refresh sender review queue:",
                    refreshError
                  );
                });
              }}
              size="sm"
              variant="outline"
            >
              <RefreshCw />
              Refresh
            </Button>
          </div>
        }
        breadcrumbs={[{ label: "Sender Review" }]}
        description="Review sender domains in a single lane and collapse email backlog with domain-wide rules."
        title="Sender Review"
      />

      <div className="flex-1 p-6 lg:p-8">
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            <StatCard
              accent
              label="Active unclassified emails"
              value={formatCount(stats?.activeUnclassifiedEmails ?? 0)}
            />
            <StatCard
              label="Domains needing review"
              value={formatCount(stats?.unreviewedDomains ?? 0)}
            />
            <StatCard
              label="Reviewed domains"
              value={formatCount(stats?.reviewedDomains ?? 0)}
            />
            <StatCard
              label="Private domains"
              value={formatCount(stats?.privateDomains ?? 0)}
            />
            <StatCard
              label="Spam domains"
              value={formatCount(stats?.spamDomains ?? 0)}
            />
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                  <Input
                    className="lg:w-[320px]"
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search domain, sender, or account"
                    value={search}
                  />

                  <Select
                    onValueChange={(value) =>
                      setStatus(value as SenderReviewStatus)
                    }
                    value={status}
                  >
                    <SelectTrigger className="min-w-[180px]" size="sm">
                      <SelectValue placeholder="Filter status" />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
                  <div>
                    Showing {formatCount(visibleItems.length)} of{" "}
                    {formatCount(data?.pagination.total ?? 0)} domains in this
                    lane
                  </div>
                  {status === "unreviewed" &&
                    visibleItems.length !== items.length && (
                      <Badge variant="secondary">
                        {formatCount(items.length - visibleItems.length)} hidden
                      </Badge>
                    )}
                  {hotkeysEnabled && (
                    <Badge variant="secondary">Shortcuts on</Badge>
                  )}
                  {error && data && (
                    <Badge variant="secondary">Refresh failed</Badge>
                  )}
                  {isValidating && (
                    <Badge variant="secondary">Updating...</Badge>
                  )}
                  <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5">
                    <Label
                      className="cursor-pointer text-foreground text-xs"
                      htmlFor="sender-review-shortcuts"
                    >
                      Shortcuts
                    </Label>
                    <Switch
                      checked={hotkeysEnabled}
                      id="sender-review-shortcuts"
                      onCheckedChange={setHotkeysEnabled}
                    />
                  </div>
                </div>
              </div>

              {hotkeysEnabled && (
                <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
                  <span>Shortcuts:</span>
                  <Kbd>y</Kbd>
                  <span>Approve verdict</span>
                  <Kbd>n</Kbd>
                  <span>Skip</span>
                  <span className="text-border">|</span>
                  <Kbd>1</Kbd>
                  <span>Trust</span>
                  <Kbd>2</Kbd>
                  <span>HR</span>
                  <Kbd>3</Kbd>
                  <span>IT</span>
                  <Kbd>4</Kbd>
                  <span>Spam</span>
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
            <ReviewQueueCard
              description="Top sender domains for the current lane."
              empty="No sender domains match the current filters."
              getKey={(item) => item.domain}
              items={visibleItems}
              renderItem={(item) => {
                const isSelected = item.domain === selectedDomain;
                return (
                  <button
                    className={`block w-full px-4 py-3 text-left transition-colors ${isSelected ? "bg-accent/60" : "hover:bg-accent/30"}`}
                    onClick={() => setSelectedDomain(item.domain)}
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-sm">
                          {item.domain}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-2">
                          <Badge
                            className={ruleBadgeClass(item)}
                            variant="outline"
                          >
                            {renderRuleLabel(item)}
                          </Badge>
                          {item.llmVerdict && (
                            <Badge
                              className={verdictBadgeClass(item.llmVerdict)}
                              variant="outline"
                            >
                              {verdictLabel(item.llmVerdict)}
                            </Badge>
                          )}
                          <Badge variant="outline">
                            {formatCount(item.emailCount)} emails
                          </Badge>
                        </div>
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {formatTimestamp(item.lastReceivedAt)}
                      </div>
                    </div>

                    <div className="mt-2 space-y-1 text-muted-foreground text-xs">
                      <div>
                        Latest: {item.samples[0]?.subject ?? "(no subject)"}
                      </div>
                      <div>
                        Sender:{" "}
                        {item.samples[0]?.senderEmail ??
                          item.samples[0]?.senderName ??
                          "unknown"}
                      </div>
                    </div>
                  </button>
                );
              }}
              title="Review Queue"
            />

            <Card className="overflow-hidden rounded-xl border border-border bg-card py-0">
              {selectedItem ? (
                <>
                  <CardHeader className="border-b py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">
                          {selectedItem.domain}
                        </CardTitle>
                        <CardDescription className="mt-1">
                          {formatCount(selectedItem.emailCount)} active emails,{" "}
                          {formatCount(selectedItem.senderCount)} unique senders
                        </CardDescription>
                      </div>
                      <Badge
                        className={ruleBadgeClass(selectedItem)}
                        variant="outline"
                      >
                        {renderRuleLabel(selectedItem)}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-6 py-6">
                    <div className="grid gap-3 md:grid-cols-3">
                      <StatCard
                        label="Linked accounts"
                        value={formatCount(selectedItem.linkedAccountCount)}
                      />
                      <StatCard
                        label="First seen"
                        value={formatTimestamp(selectedItem.firstReceivedAt)}
                      />
                      <StatCard
                        label="Last seen"
                        value={formatTimestamp(selectedItem.lastReceivedAt)}
                      />
                    </div>

                    {selectedItem.llmVerdict && (
                      <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <Badge
                              className={verdictBadgeClass(
                                selectedItem.llmVerdict
                              )}
                            >
                              {verdictLabel(selectedItem.llmVerdict)}
                            </Badge>
                            {selectedItem.llmVerdict.category && (
                              <span className="text-muted-foreground text-xs">
                                {selectedItem.llmVerdict.category}
                              </span>
                            )}
                            {selectedItem.llmVerdict.confidence != null && (
                              <span className="text-muted-foreground text-xs">
                                {Math.round(
                                  selectedItem.llmVerdict.confidence * 100
                                )}
                                %
                              </span>
                            )}
                          </div>
                          <Button
                            disabled={savingDomain === selectedItem.domain}
                            onClick={() => approveVerdict(selectedItem.domain)}
                            size="sm"
                            variant={
                              selectedItem.llmVerdict.isWorkRelated
                                ? "outline"
                                : "destructive"
                            }
                          >
                            {selectedItem.llmVerdict.isWorkRelated
                              ? "Approve (Trust)"
                              : "Approve (Exclude)"}
                          </Button>
                        </div>
                        {selectedItem.llmVerdict.reason && (
                          <p className="mt-2 text-muted-foreground text-xs">
                            {selectedItem.llmVerdict.reason}
                          </p>
                        )}
                        <div className="mt-4 rounded-lg border border-border/60 bg-background/80 p-3">
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground uppercase tracking-wide">
                            <span>LLM audit</span>
                            {isAuditLoading && (
                              <Badge variant="secondary">Loading…</Badge>
                            )}
                            {auditError && (
                              <Badge variant="secondary">
                                Audit unavailable
                              </Badge>
                            )}
                          </div>

                          {audit && (
                            <div className="mt-3 space-y-3">
                              <div className="grid gap-2 text-xs md:grid-cols-2 xl:grid-cols-4">
                                <div>
                                  <div className="text-muted-foreground">
                                    Provider
                                  </div>
                                  <div className="font-medium">
                                    {audit.provider ?? "—"}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-muted-foreground">
                                    Model
                                  </div>
                                  <div className="font-medium">
                                    {audit.model ?? "—"}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-muted-foreground">
                                    Prompt version
                                  </div>
                                  <div className="font-medium">
                                    {audit.promptVersion ?? "—"}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-muted-foreground">
                                    Runtime
                                  </div>
                                  <div className="font-medium">
                                    {typeof audit.processingTimeMs === "number"
                                      ? `${audit.processingTimeMs}ms`
                                      : "—"}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-muted-foreground">
                                    Input tokens
                                  </div>
                                  <div className="font-medium">
                                    {formatMaybeCount(audit.inputTokens)}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-muted-foreground">
                                    Output tokens
                                  </div>
                                  <div className="font-medium">
                                    {formatMaybeCount(audit.outputTokens)}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-muted-foreground">
                                    Total tokens
                                  </div>
                                  <div className="font-medium">
                                    {formatMaybeCount(audit.totalTokens)}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-muted-foreground">
                                    Prompt samples
                                  </div>
                                  <div className="font-medium">
                                    {formatMaybeCount(
                                      audit.promptInput?.samples?.length ?? null
                                    )}
                                  </div>
                                </div>
                              </div>

                              {audit.promptText && (
                                <div>
                                  <div className="mb-1 text-muted-foreground text-xs">
                                    Prompt
                                  </div>
                                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-border/60 bg-muted/40 p-3 text-[11px] leading-5">
                                    {audit.promptText}
                                  </pre>
                                </div>
                              )}

                              {audit.rawResult && (
                                <div>
                                  <div className="mb-1 text-muted-foreground text-xs">
                                    Raw result
                                  </div>
                                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-border/60 bg-muted/40 p-3 text-[11px] leading-5">
                                    {JSON.stringify(audit.rawResult, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <Button
                        disabled={savingDomain === selectedItem.domain}
                        onClick={() =>
                          applyRule(
                            selectedItem.domain,
                            { classification: null, is_excluded: false },
                            `Marked ${selectedItem.domain} as trusted`
                          )
                        }
                        size="sm"
                        variant="outline"
                      >
                        <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                        Trust Sender
                      </Button>
                      <Button
                        className="bg-pink-100 text-pink-900 hover:bg-pink-200"
                        disabled={savingDomain === selectedItem.domain}
                        onClick={() =>
                          applyRule(
                            selectedItem.domain,
                            { classification: "HR", is_excluded: true },
                            `Marked ${selectedItem.domain} as HR/private`
                          )
                        }
                        size="sm"
                        variant="outline"
                      >
                        HR Private
                      </Button>
                      <Button
                        className="bg-cyan-100 text-cyan-900 hover:bg-cyan-200"
                        disabled={savingDomain === selectedItem.domain}
                        onClick={() =>
                          applyRule(
                            selectedItem.domain,
                            { classification: "IT", is_excluded: true },
                            `Marked ${selectedItem.domain} as IT/private`
                          )
                        }
                        size="sm"
                        variant="outline"
                      >
                        IT Private
                      </Button>
                      <Button
                        disabled={savingDomain === selectedItem.domain}
                        onClick={() =>
                          applyRule(
                            selectedItem.domain,
                            { classification: "SPAM", is_excluded: true },
                            `Blocked ${selectedItem.domain} as spam`
                          )
                        }
                        size="sm"
                        variant="destructive"
                      >
                        <ShieldOff className="mr-1.5 h-3.5 w-3.5" />
                        Spam
                      </Button>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <UserRoundSearch className="h-4 w-4 text-muted-foreground" />
                        <h3 className="font-medium text-sm">Recent examples</h3>
                      </div>

                      <div className="space-y-3">
                        {selectedItem.samples.map((sample) => (
                          <div
                            className="rounded-xl border border-border/60 bg-background/70 p-4"
                            key={`${sample.emailId}-${sample.receivedAt}`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate font-medium text-sm">
                                  {sample.subject ?? "(no subject)"}
                                </div>
                                <div className="mt-1 text-muted-foreground text-xs">
                                  {sample.senderName
                                    ? `${sample.senderName} `
                                    : ""}
                                  &lt;{sample.senderEmail ?? "unknown"}&gt;
                                </div>
                              </div>
                              <div className="text-right text-muted-foreground text-xs">
                                <div>Email #{sample.emailId}</div>
                                <div>{formatTimestamp(sample.receivedAt)}</div>
                              </div>
                            </div>

                            {(sample.accountName || sample.accountDomain) && (
                              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                                {sample.accountName && (
                                  <Badge variant="outline">
                                    Account: {sample.accountName}
                                  </Badge>
                                )}
                                {sample.accountDomain && (
                                  <Badge variant="outline">
                                    Domain: {sample.accountDomain}
                                  </Badge>
                                )}
                                {sample.accountType && (
                                  <Badge variant="outline">
                                    Type: {sample.accountType}
                                  </Badge>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </>
              ) : (
                <div className="flex flex-1 items-center justify-center px-8 py-16 text-center text-muted-foreground text-sm">
                  Select a sender domain to review.
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
