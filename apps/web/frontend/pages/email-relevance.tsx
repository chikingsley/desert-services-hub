import { ExternalLink, RefreshCw, Sparkles } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { EmailBodyViewer } from "@/apps/web/frontend/components/emails/email-body-viewer";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/apps/web/frontend/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/apps/web/frontend/components/ui/tabs";
import { Textarea } from "@/apps/web/frontend/components/ui/textarea";
import { useDebouncedValue } from "@/apps/web/frontend/hooks/use-debounced-value";
import { fetcher } from "@/apps/web/frontend/lib/fetcher";

type ReviewStatus = "approved" | "needs_work" | "unreviewed";
type PredictedFilter = "all" | "failed" | "unrelated" | "work";
type RelevanceProvider = "auto" | "gemini" | "local" | "openrouter";

interface ReviewDraft {
  dirty: boolean;
  reviewNotes: string;
  reviewStatus: ReviewStatus;
}

interface RelevanceListItem {
  bodyPreview: string | null;
  confidence: number | null;
  createdAt: string;
  emailId: number;
  error: string | null;
  fromEmail: string | null;
  id: number;
  isObviouslyUnrelated: boolean | null;
  isWorkRelated: boolean | null;
  provider: string | null;
  reason: string | null;
  receivedAt: string;
  reviewStatus: string;
  runStatus: string;
  subject: string | null;
  updatedAt: string;
}

interface RelevanceStats {
  approved_count: number;
  failed_count: number;
  needs_work_count: number;
  predicted_unrelated_count: number;
  predicted_work_count: number;
  total_reviews: number;
  unreviewed_count: number;
}

interface RelevanceListResponse {
  items: RelevanceListItem[];
  requestId: string;
  stats: RelevanceStats;
}

interface RelevanceDetail {
  bodyHtml: string | null;
  bodyPreview: string | null;
  bodyText: string | null;
  category: string | null;
  confidence: number | null;
  createdAt: string;
  emailId: number;
  error: string | null;
  fromEmail: string | null;
  id: number;
  isObviouslyUnrelated: boolean | null;
  isWorkRelated: boolean | null;
  model: string | null;
  promptVersion: string;
  provider: string | null;
  rawResult: Record<string, unknown> | null;
  reason: string | null;
  receivedAt: string;
  reviewedAt: string | null;
  reviewNotes: string | null;
  reviewStatus: string;
  runStatus: string;
  subject: string | null;
  suggestedAction: string | null;
  updatedAt: string;
  webUrl: string | null;
}

interface RelevanceDetailResponse {
  item: RelevanceDetail;
  requestId: string;
}

interface RunSnapshot {
  currentEmailId: number | null;
  currentReviewId: number | null;
  currentSubject: string | null;
  error: string | null;
  failed: number;
  finishedAt: string | null;
  id: string;
  limitRequested: number;
  processed: number;
  provider: RelevanceProvider;
  results: Array<{
    emailId: number;
    error?: string;
    id?: number;
    status: "failed" | "success";
    subject: string | null;
  }>;
  startedAt: string;
  status: "completed" | "failed" | "running";
  succeeded: number;
  total: number;
}

interface RunResponse {
  requestId: string;
  run: RunSnapshot | null;
  started: boolean;
}

interface RunStatusResponse {
  run: RunSnapshot | null;
}

const REVIEW_STATUS_OPTIONS: Array<{
  label: string;
  value: ReviewStatus | "all";
}> = [
  { label: "Needs review", value: "unreviewed" },
  { label: "Approved", value: "approved" },
  { label: "Needs work", value: "needs_work" },
  { label: "All review states", value: "all" },
];

const PREDICTED_OPTIONS: Array<{ label: string; value: PredictedFilter }> = [
  { label: "All predictions", value: "all" },
  { label: "Predicted unrelated", value: "unrelated" },
  { label: "Predicted work-related", value: "work" },
  { label: "Failed runs", value: "failed" },
];

const PROVIDER_OPTIONS: Array<{
  description: string;
  label: string;
  value: RelevanceProvider;
}> = [
  {
    label: "OpenRouter",
    value: "openrouter",
    description: "Fastest supervised relevance lane right now.",
  },
  {
    label: "Local",
    value: "local",
    description:
      "Ministral local path. Cheaper, but currently slower and less stable.",
  },
  {
    label: "Auto",
    value: "auto",
    description: "Use backend provider order.",
  },
  {
    label: "Gemini",
    value: "gemini",
    description: "Pinned Gemini path for comparison.",
  },
];

function buildApiUrl(
  search: string,
  predicted: PredictedFilter,
  reviewStatus: ReviewStatus | "all"
): string {
  const params = new URLSearchParams();
  params.set("limit", "100");
  if (search.trim()) {
    params.set("q", search.trim());
  }
  if (predicted !== "all") {
    params.set("predicted", predicted);
  }
  if (reviewStatus !== "all") {
    params.set("reviewStatus", reviewStatus);
  }
  return `/api/emails/relevance-review?${params.toString()}`;
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  return new Date(value).toLocaleString();
}

function formatCount(value: number | null | undefined): string {
  return (value ?? 0).toLocaleString();
}

function formatConfidence(value: number | null): string {
  if (typeof value !== "number") {
    return "—";
  }
  return `${Math.round(value * 100)}%`;
}

function predictionLabel(item: {
  isObviouslyUnrelated: boolean | null;
  isWorkRelated: boolean | null;
  runStatus: string;
}): string {
  if (item.runStatus === "failed") {
    return "Failed";
  }
  if (item.isObviouslyUnrelated) {
    return "Unrelated";
  }
  if (item.isWorkRelated) {
    return "Work-related";
  }
  return "Ambiguous";
}

function predictionBadgeClass(item: {
  isObviouslyUnrelated: boolean | null;
  isWorkRelated: boolean | null;
  runStatus: string;
}): string {
  if (item.runStatus === "failed") {
    return "bg-red-100 text-red-800";
  }
  if (item.isObviouslyUnrelated) {
    return "bg-amber-100 text-amber-900";
  }
  if (item.isWorkRelated) {
    return "bg-emerald-100 text-emerald-800";
  }
  return "bg-slate-100 text-slate-800";
}

function reviewBadgeClass(status: string): string {
  switch (status) {
    case "approved":
      return "bg-emerald-100 text-emerald-800";
    case "needs_work":
      return "bg-amber-100 text-amber-900";
    default:
      return "bg-slate-100 text-slate-800";
  }
}

function normalizeReviewStatus(
  status: string | null | undefined
): ReviewStatus {
  if (status === "approved" || status === "needs_work") {
    return status;
  }

  return "unreviewed";
}

function formatEnumLabel(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }

  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function matchesReviewFilter(
  nextStatus: ReviewStatus,
  filter: ReviewStatus | "all"
): boolean {
  return filter === "all" || nextStatus === filter;
}

function prettyJson(value: unknown): string {
  if (!value) {
    return "{}";
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "{}";
  }
}

export function EmailRelevancePage() {
  const [search, setSearch] = useState("");
  const [predicted, setPredicted] = useState<PredictedFilter>("all");
  const [reviewStatusFilter, setReviewStatusFilter] = useState<
    ReviewStatus | "all"
  >("unreviewed");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [provider, setProvider] = useState<RelevanceProvider>("openrouter");
  const [batchLimit, setBatchLimit] = useState("10");
  const [runSubmitting, setRunSubmitting] = useState(false);
  const [savingReview, setSavingReview] = useState(false);
  const [draftsById, setDraftsById] = useState<Record<number, ReviewDraft>>({});
  const previousRunRef = useRef<RunSnapshot | null>(null);
  const debouncedSearch = useDebouncedValue(search, 300);

  const apiUrl = useMemo(
    () => buildApiUrl(debouncedSearch, predicted, reviewStatusFilter),
    [debouncedSearch, predicted, reviewStatusFilter]
  );

  const { data, error, isLoading, isValidating, mutate } =
    useSWR<RelevanceListResponse>(apiUrl, fetcher, {
      dedupingInterval: 5000,
      keepPreviousData: true,
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    });

  const { data: runStatusData, mutate: mutateRunStatus } =
    useSWR<RunStatusResponse>("/api/emails/relevance-review/run", fetcher, {
      dedupingInterval: 1000,
      keepPreviousData: true,
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    });

  const activeRun = runStatusData?.run ?? null;
  const isRunActive = activeRun?.status === "running";
  let runButtonLabel = "Run Next Batch";
  if (runSubmitting) {
    runButtonLabel = "Starting...";
  } else if (isRunActive) {
    runButtonLabel = "Run In Progress";
  }

  useEffect(() => {
    const previousRun = previousRunRef.current;
    previousRunRef.current = activeRun;

    if (!(previousRun && activeRun)) {
      return;
    }

    if (previousRun.id !== activeRun.id || previousRun.status !== "running") {
      return;
    }

    if (activeRun.status === "completed") {
      toast.success(
        `Run finished: ${activeRun.succeeded} succeeded, ${activeRun.failed} failed`
      );
      mutate().catch((refreshError) => {
        console.error(
          "Failed to refresh email relevance review after run completion:",
          refreshError
        );
      });
      return;
    }

    if (activeRun.status === "failed") {
      toast.error(activeRun.error ?? "Email relevance run failed");
    }
  }, [activeRun, mutate]);

  const items = data?.items ?? [];

  useEffect(() => {
    const firstId = items[0]?.id ?? null;
    if (!selectedId && firstId) {
      setSelectedId(firstId);
      return;
    }

    if (selectedId && !items.some((item) => item.id === selectedId)) {
      setSelectedId(firstId);
    }
  }, [items, selectedId]);

  const selectedItem = items.find((item) => item.id === selectedId) ?? null;

  const {
    data: detailData,
    error: detailError,
    isLoading: detailLoading,
    mutate: mutateDetail,
  } = useSWR<RelevanceDetailResponse>(
    selectedId ? `/api/emails/relevance-review/${selectedId}` : null,
    fetcher,
    {
      dedupingInterval: 5000,
      keepPreviousData: true,
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    }
  );

  const detail = detailData?.item ?? null;

  useEffect(() => {
    if (!isRunActive) {
      return;
    }

    const intervalId = window.setInterval(() => {
      Promise.allSettled([
        mutate(),
        mutateRunStatus(),
        selectedId ? mutateDetail() : Promise.resolve(),
      ]).then((results) => {
        for (const result of results) {
          if (result.status === "rejected") {
            console.error(
              "Failed to refresh email relevance review during active run:",
              result.reason
            );
          }
        }
      });
    }, 1200);

    return () => window.clearInterval(intervalId);
  }, [isRunActive, mutate, mutateDetail, mutateRunStatus, selectedId]);

  useEffect(() => {
    if (!detail) {
      return;
    }

    const nextStatus = normalizeReviewStatus(detail.reviewStatus);
    const nextNotes = detail.reviewNotes ?? "";

    setDraftsById((current) => {
      const existing = current[detail.id];
      if (existing?.dirty) {
        return current;
      }

      if (
        existing &&
        existing.reviewStatus === nextStatus &&
        existing.reviewNotes === nextNotes
      ) {
        return current;
      }

      return {
        ...current,
        [detail.id]: {
          dirty: false,
          reviewNotes: nextNotes,
          reviewStatus: nextStatus,
        },
      };
    });
  }, [detail]);

  const currentDraft = detail
    ? (draftsById[detail.id] ?? {
        dirty: false,
        reviewNotes: detail.reviewNotes ?? "",
        reviewStatus: normalizeReviewStatus(detail.reviewStatus),
      })
    : null;

  function setDraftReviewStatus(nextStatus: ReviewStatus) {
    if (!detail) {
      return;
    }

    setDraftsById((current) => {
      const base = current[detail.id] ?? {
        dirty: false,
        reviewNotes: detail.reviewNotes ?? "",
        reviewStatus: normalizeReviewStatus(detail.reviewStatus),
      };

      return {
        ...current,
        [detail.id]: {
          ...base,
          dirty: true,
          reviewStatus: nextStatus,
        },
      };
    });
  }

  function setDraftReviewNotes(nextNotes: string) {
    if (!detail) {
      return;
    }

    setDraftsById((current) => {
      const base = current[detail.id] ?? {
        dirty: false,
        reviewNotes: detail.reviewNotes ?? "",
        reviewStatus: normalizeReviewStatus(detail.reviewStatus),
      };

      return {
        ...current,
        [detail.id]: {
          ...base,
          dirty: true,
          reviewNotes: nextNotes,
        },
      };
    });
  }

  function getEffectiveReviewStatus(item: {
    id: number;
    reviewStatus: string;
  }) {
    return (
      draftsById[item.id]?.reviewStatus ??
      normalizeReviewStatus(item.reviewStatus)
    );
  }

  async function runBatch() {
    try {
      setRunSubmitting(true);
      const parsedLimit = Number.parseInt(batchLimit, 10);
      const limit =
        Number.isFinite(parsedLimit) && parsedLimit > 0
          ? Math.min(parsedLimit, 25)
          : 10;

      const response = await fetch("/api/emails/relevance-review/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit, provider }),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `HTTP ${response.status}`);
      }

      const result = (await response.json()) as RunResponse;
      if (!result.started) {
        toast.message("A relevance run is already in progress");
        await Promise.all([mutateRunStatus(), mutate()]);
        return;
      }

      if (!result.run || result.run.total === 0) {
        toast.message("No eligible emails found for this run");
        await Promise.all([mutateRunStatus(), mutate()]);
        return;
      }

      toast.success(
        `Started ${result.run.total} email${result.run.total === 1 ? "" : "s"} on ${result.run.provider}`
      );
      await Promise.all([mutateRunStatus(), mutate()]);
    } catch (runError) {
      toast.error(
        runError instanceof Error
          ? runError.message
          : "Failed to run relevance batch"
      );
    } finally {
      setRunSubmitting(false);
    }
  }

  async function saveReview() {
    if (!(detail && currentDraft)) {
      return;
    }

    try {
      setSavingReview(true);
      const response = await fetch(
        `/api/emails/relevance-review/${detail.id}/review`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reviewNotes: currentDraft.reviewNotes,
            reviewStatus: currentDraft.reviewStatus,
          }),
        }
      );

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `HTTP ${response.status}`);
      }

      const next = (await response.json()) as RelevanceDetailResponse;
      const nextStatus = normalizeReviewStatus(next.item.reviewStatus);
      const shouldKeepInLane = matchesReviewFilter(
        nextStatus,
        reviewStatusFilter
      );
      const currentIndex = items.findIndex((item) => item.id === detail.id);

      setDraftsById((current) => ({
        ...current,
        [next.item.id]: {
          dirty: false,
          reviewNotes: next.item.reviewNotes ?? "",
          reviewStatus: nextStatus,
        },
      }));

      if (!shouldKeepInLane) {
        setSelectedId(
          items[currentIndex + 1]?.id ?? items[currentIndex - 1]?.id ?? null
        );
      }

      toast.success("Review saved");
      await mutateDetail(next, { revalidate: false });
      await mutate(
        (current) => {
          if (!current) {
            return current;
          }

          const nextItems = current.items
            .map((item) =>
              item.id === next.item.id
                ? {
                    ...item,
                    reviewStatus: next.item.reviewStatus,
                  }
                : item
            )
            .filter((item) =>
              item.id === next.item.id ? shouldKeepInLane : true
            );

          return {
            ...current,
            items: nextItems,
          };
        },
        { revalidate: false }
      );

      mutate().catch((refreshError) => {
        console.error(
          "Failed to refresh email relevance review:",
          refreshError
        );
      });
    } catch (reviewError) {
      toast.error(
        reviewError instanceof Error
          ? reviewError.message
          : "Failed to save review"
      );
    } finally {
      setSavingReview(false);
    }
  }

  if (isLoading && !data) {
    return <PageLoading />;
  }

  if (error && !data) {
    return <PageError message={error.message} />;
  }

  const stats = data?.stats;
  let detailPanel: ReactNode;

  if (!selectedItem) {
    detailPanel = (
      <div className="flex flex-1 items-center justify-center px-8 py-16 text-center text-muted-foreground text-sm">
        Select an email relevance result to inspect.
      </div>
    );
  } else if (detailLoading && !detail) {
    detailPanel = (
      <div className="flex min-h-[560px] items-center justify-center text-muted-foreground text-sm">
        Loading email detail...
      </div>
    );
  } else if (detailError && !detail) {
    detailPanel = (
      <div className="flex min-h-[560px] items-center justify-center px-8 text-center text-muted-foreground text-sm">
        {detailError.message}
      </div>
    );
  } else if (detail) {
    detailPanel = (
      <>
        <CardHeader className="border-b py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="break-words text-base">
                {detail.subject ?? "(no subject)"}
              </CardTitle>
              <CardDescription className="mt-1 break-all">
                {detail.fromEmail ?? "unknown sender"} · received{" "}
                {formatTimestamp(detail.receivedAt)}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge className={predictionBadgeClass(detail)} variant="outline">
                {predictionLabel(detail)}
              </Badge>
              <Badge
                className={reviewBadgeClass(
                  currentDraft?.reviewStatus ?? detail.reviewStatus
                )}
                variant="outline"
              >
                {formatEnumLabel(
                  currentDraft?.reviewStatus ?? detail.reviewStatus
                )}
              </Badge>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6 py-6">
          <div className="grid gap-3 md:grid-cols-4">
            <StatCard
              label="Confidence"
              value={formatConfidence(detail.confidence)}
            />
            <StatCard label="Provider" value={detail.provider ?? "—"} />
            <StatCard label="Model" value={detail.model ?? "—"} />
            <StatCard
              label="Suggested action"
              value={formatEnumLabel(detail.suggestedAction)}
            />
          </div>

          <div className="space-y-3 rounded-xl border border-border/70 bg-background/70 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-medium text-sm">Review</div>
                <div className="text-muted-foreground text-xs">
                  {detail.reviewedAt
                    ? `Last reviewed ${formatTimestamp(detail.reviewedAt)}`
                    : "Not reviewed yet"}
                </div>
              </div>
              {detail.webUrl && (
                <Button asChild size="sm" variant="outline">
                  <a href={detail.webUrl} rel="noreferrer" target="_blank">
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                    Open in Outlook
                  </a>
                </Button>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => setDraftReviewStatus("approved")}
                size="sm"
                variant={
                  currentDraft?.reviewStatus === "approved"
                    ? "default"
                    : "outline"
                }
              >
                Approve
              </Button>
              <Button
                onClick={() => setDraftReviewStatus("needs_work")}
                size="sm"
                variant={
                  currentDraft?.reviewStatus === "needs_work"
                    ? "default"
                    : "outline"
                }
              >
                Needs Work
              </Button>
              <Button
                onClick={() => setDraftReviewStatus("unreviewed")}
                size="sm"
                variant={
                  currentDraft?.reviewStatus === "unreviewed"
                    ? "default"
                    : "outline"
                }
              >
                Reset
              </Button>
            </div>

            <Textarea
              className="min-h-[120px]"
              onChange={(event) => setDraftReviewNotes(event.target.value)}
              placeholder="Why you agree or disagree, prompt issues, edge cases, etc."
              value={currentDraft?.reviewNotes ?? ""}
            />

            <div className="flex justify-end">
              <Button
                disabled={savingReview || !currentDraft?.dirty}
                onClick={saveReview}
                size="sm"
              >
                {savingReview ? "Saving..." : "Save Review"}
              </Button>
            </div>
          </div>

          <Tabs defaultValue="email">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="email">Email</TabsTrigger>
              <TabsTrigger value="model">Model Output</TabsTrigger>
              <TabsTrigger value="raw">Raw JSON</TabsTrigger>
            </TabsList>

            <TabsContent className="mt-4" value="email">
              <div className="space-y-4">
                <div className="rounded-xl border border-border/70 bg-background/70 p-4">
                  <div className="font-medium text-sm">Reason</div>
                  <p className="mt-2 whitespace-pre-wrap text-sm">
                    {detail.reason ?? "—"}
                  </p>
                </div>

                <div className="rounded-xl border border-border/70 bg-background/70 p-4">
                  <div className="font-medium text-sm">Email body</div>
                  <div className="mt-2">
                    <EmailBodyViewer
                      bodyHtml={detail.bodyHtml}
                      bodyText={detail.bodyText ?? detail.bodyPreview ?? "—"}
                      title="Email relevance content"
                    />
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent className="mt-4" value="model">
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <StatCard
                    label="Prompt version"
                    value={detail.promptVersion}
                  />
                  <StatCard
                    label="Category"
                    value={formatEnumLabel(detail.category)}
                  />
                </div>

                <div className="rounded-xl border border-border/70 bg-background/70 p-4">
                  <div className="font-medium text-sm">Summary</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge
                      className={predictionBadgeClass(detail)}
                      variant="outline"
                    >
                      {predictionLabel(detail)}
                    </Badge>
                    <Badge variant="outline">
                      Confidence {formatConfidence(detail.confidence)}
                    </Badge>
                    <Badge variant="outline">
                      {formatEnumLabel(detail.suggestedAction)}
                    </Badge>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm">
                    {detail.reason ?? "—"}
                  </p>
                </div>

                {detail.error && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800 text-sm">
                    {detail.error}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent className="mt-4" value="raw">
              <div className="rounded-xl border border-border/70 bg-background/70 p-4">
                <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap break-words text-sm">
                  {prettyJson(detail.rawResult)}
                </pre>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </>
    );
  } else {
    detailPanel = (
      <div className="flex min-h-[560px] items-center justify-center px-8 text-center text-muted-foreground text-sm">
        Email relevance detail is not available.
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        actions={
          <div className="flex items-center gap-2">
            <Button
              onClick={() => {
                mutate().catch((refreshError) => {
                  console.error(
                    "Failed to refresh email relevance review:",
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
        breadcrumbs={[{ label: "Email Relevance" }]}
        description="Supervised content-based email relevance experiment lane. Run batches, inspect outputs, and approve before any inline rollout."
        title="Email Relevance"
      />

      <div className="flex-1 p-6 lg:p-8">
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <StatCard
              accent
              label="Total results"
              value={formatCount(stats?.total_reviews)}
            />
            <StatCard
              label="Needs review"
              value={formatCount(stats?.unreviewed_count)}
            />
            <StatCard
              label="Predicted unrelated"
              value={formatCount(stats?.predicted_unrelated_count)}
            />
            <StatCard
              label="Predicted work-related"
              value={formatCount(stats?.predicted_work_count)}
            />
            <StatCard
              label="Approved"
              value={formatCount(stats?.approved_count)}
            />
            <StatCard
              label="Needs work"
              value={formatCount(stats?.needs_work_count)}
            />
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                  <Input
                    className="lg:w-[320px]"
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search subject, sender, reason"
                    value={search}
                  />

                  <Select
                    onValueChange={(value) =>
                      setReviewStatusFilter(value as ReviewStatus | "all")
                    }
                    value={reviewStatusFilter}
                  >
                    <SelectTrigger className="min-w-[180px]" size="sm">
                      <SelectValue placeholder="Filter review status" />
                    </SelectTrigger>
                    <SelectContent>
                      {REVIEW_STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    onValueChange={(value) =>
                      setPredicted(value as PredictedFilter)
                    }
                    value={predicted}
                  >
                    <SelectTrigger className="min-w-[200px]" size="sm">
                      <SelectValue placeholder="Filter prediction" />
                    </SelectTrigger>
                    <SelectContent>
                      {PREDICTED_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
                  <div>Showing {formatCount(items.length)} results</div>
                  {isRunActive && (
                    <Badge variant="secondary">
                      Live run {formatCount(activeRun?.processed)}/
                      {formatCount(activeRun?.total)}
                    </Badge>
                  )}
                  {isValidating && (
                    <Badge variant="secondary">Updating...</Badge>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-background/70 p-3 lg:flex-row lg:items-end">
                <div className="grid flex-1 gap-3 md:grid-cols-[180px_180px_120px]">
                  <div className="space-y-1">
                    <div className="font-medium text-sm">Provider</div>
                    <Select
                      onValueChange={(value) =>
                        setProvider(value as RelevanceProvider)
                      }
                      value={provider}
                    >
                      <SelectTrigger size="sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PROVIDER_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="text-muted-foreground text-xs">
                      {
                        PROVIDER_OPTIONS.find(
                          (option) => option.value === provider
                        )?.description
                      }
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="font-medium text-sm">Run next batch</div>
                    <Input
                      inputMode="numeric"
                      onChange={(event) => setBatchLimit(event.target.value)}
                      value={batchLimit}
                    />
                    <div className="text-muted-foreground text-xs">
                      Max 25 per supervised run.
                    </div>
                    {isRunActive && (
                      <div className="rounded-md border border-border/70 bg-card/80 px-2.5 py-2 text-xs">
                        <div className="font-medium text-foreground">
                          Processing {formatCount(activeRun?.processed)} of{" "}
                          {formatCount(activeRun?.total)}
                        </div>
                        <div className="mt-1 break-words text-muted-foreground">
                          {activeRun?.currentSubject
                            ? `Current: ${activeRun.currentSubject}`
                            : "Preparing next email..."}
                        </div>
                      </div>
                    )}
                    {provider === "local" && (
                      <div className="text-muted-foreground text-xs">
                        Local runs are slower. New rows appear as each email
                        finishes.
                      </div>
                    )}
                  </div>
                </div>

                <Button
                  disabled={runSubmitting || isRunActive}
                  onClick={runBatch}
                  size="sm"
                >
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  {runButtonLabel}
                </Button>
              </div>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
            <ReviewQueueCard
              description="Persisted relevance results ready for human review."
              empty="No email relevance results match the current filters."
              getKey={(item) => item.id}
              items={items}
              renderItem={(item) => {
                const isSelected = item.id === selectedId;
                return (
                  <button
                    className={`block w-full px-4 py-3 text-left transition-colors ${isSelected ? "bg-accent/60" : "hover:bg-accent/30"}`}
                    onClick={() => setSelectedId(item.id)}
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="line-clamp-2 break-words font-medium text-sm">
                          {item.subject ?? "(no subject)"}
                        </div>
                        <div className="mt-1 break-all text-muted-foreground text-xs">
                          {item.fromEmail ?? "unknown sender"}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Badge
                            className={predictionBadgeClass(item)}
                            variant="outline"
                          >
                            {predictionLabel(item)}
                          </Badge>
                          <Badge
                            className={reviewBadgeClass(
                              getEffectiveReviewStatus(item)
                            )}
                            variant="outline"
                          >
                            {formatEnumLabel(getEffectiveReviewStatus(item))}
                          </Badge>
                          <Badge variant="outline">
                            {formatConfidence(item.confidence)}
                          </Badge>
                        </div>
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {formatTimestamp(item.receivedAt)}
                      </div>
                    </div>

                    <div className="mt-2 space-y-1 text-muted-foreground text-xs">
                      <div className="line-clamp-2">
                        {item.reason ?? item.error ?? item.bodyPreview ?? "—"}
                      </div>
                    </div>
                  </button>
                );
              }}
              title="Review Queue"
            />

            <Card className="overflow-hidden rounded-xl border border-border bg-card py-0">
              {detailPanel}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
