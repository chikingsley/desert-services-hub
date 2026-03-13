import { Copy, Download, Eye, RefreshCw, RotateCcw } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
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

interface ReviewStats {
  attachments_failed: number;
  attachments_pending: number;
  parsed_success: number;
  total_documents: number;
  with_clean_markdown: number;
  with_extracted_text: number;
  with_raw_extraction: number;
}

interface ReviewItem {
  clean_markdown_length: number;
  created_at: string;
  document_type: string | null;
  email_id: number | null;
  email_subject: string | null;
  extracted_at: string | null;
  extracted_text_length: number;
  extraction_error: string | null;
  extraction_status: string | null;
  file_name: string | null;
  from_email: string | null;
  has_clean_markdown: boolean;
  has_extracted_text: boolean;
  has_raw_extraction: boolean;
  id: number;
  model: string | null;
  processing_time_ms: number | null;
  project_id: number | null;
  project_name: string | null;
  qa_status: string | null;
  reviewed_at: string | null;
  source: string | null;
  summary: string | null;
  updated_at: string;
}

interface ReviewListResponse {
  items: ReviewItem[];
  requestId: string;
  stats: ReviewStats;
}

type PreviewKind = "image" | "none" | "other" | "pdf";

interface ReviewDetail {
  can_preview: boolean;
  can_rerun: boolean;
  clean_markdown: string | null;
  content_type: string | null;
  created_at: string;
  document_type: string | null;
  download_url: string | null;
  email_id: number | null;
  email_subject: string | null;
  extracted_at: string | null;
  extracted_text: string | null;
  extraction_attempts: number | null;
  extraction_error: string | null;
  extraction_metadata_json: string | null;
  extraction_method: string | null;
  extraction_profile: string;
  extraction_status: string | null;
  file_name: string | null;
  file_path: string | null;
  file_size: number | null;
  forwarder_email: string | null;
  from_email: string | null;
  id: number;
  local_path: string | null;
  mailbox_email: string | null;
  message_id: string | null;
  model: string | null;
  original_from: string | null;
  original_subject: string | null;
  outlook_attachment_id: string | null;
  page_count: number | null;
  preview_kind: PreviewKind;
  preview_url: string | null;
  processing_time_ms: number | null;
  project_id: number | null;
  project_name: string | null;
  qa_notes: string | null;
  qa_status: string | null;
  reviewed_at: string | null;
  sharepoint_path: string | null;
  sharepoint_url: string | null;
  source: string | null;
  storage_path: string | null;
  structured_output_json: string | null;
  structured_output_key: string | null;
  structured_output_label: string;
  summary: string | null;
  updated_at: string;
}

interface ReviewDetailResponse {
  item: ReviewDetail;
  requestId: string;
}

type ExtractionMode = "full" | "native" | "ocr";
type AnalysisProfile = "auto" | "estimate" | "noi";
type ReviewQaStatus = "all" | "approved" | "needs_work" | "unreviewed";

interface ReviewRerunResponse {
  analysisProfile: AnalysisProfile;
  extractionMode: ExtractionMode;
  failed: number;
  requestId: string;
  results: Array<{
    documentType: string | null;
    error?: string;
    id: number;
    status: "failed" | "success";
    summary: string | null;
  }>;
  succeeded: number;
}

const STATUS_OPTIONS = [
  { label: "All statuses", value: "all" },
  { label: "Success", value: "success" },
  { label: "Pending", value: "pending" },
  { label: "Failed", value: "failed" },
  { label: "Deduped", value: "deduped" },
  { label: "Skipped", value: "skipped" },
] as const;

const SOURCE_OPTIONS = [
  { label: "Parsed outputs", value: "parsed" },
  { label: "All sources", value: "all" },
  { label: "Email attachments", value: "email_attachment" },
  { label: "Monday assets", value: "monday_asset" },
] as const;

const DOC_TYPE_OPTIONS = [
  { label: "All document types", value: "all" },
  { label: "Estimate", value: "estimate" },
  { label: "NOI certificate", value: "noi_certificate" },
  { label: "Contract", value: "contract" },
  { label: "Subcontract", value: "subcontract" },
  { label: "Purchase order", value: "purchase_order" },
  { label: "Work order", value: "work_order" },
  { label: "SWPPP plan", value: "swppp_plan" },
  { label: "Unknown", value: "unknown" },
] as const;

const REVIEW_STATUS_OPTIONS = [
  { label: "All review states", value: "all" },
  { label: "Needs review", value: "unreviewed" },
  { label: "Approved", value: "approved" },
  { label: "Needs work", value: "needs_work" },
] as const;

const EXTRACTION_MODE_OPTIONS: Array<{
  description: string;
  label: string;
  value: ExtractionMode;
}> = [
  {
    label: "Native",
    value: "native",
    description: "Fastest. Reuses text layer when available.",
  },
  {
    label: "OCR",
    value: "ocr",
    description: "Force OCR for scanned or image-heavy files.",
  },
  {
    label: "Full",
    value: "full",
    description: "Best quality. Reconciles text + OCR.",
  },
] as const;

const ANALYSIS_PROFILE_OPTIONS: Array<{
  description: string;
  label: string;
  value: AnalysisProfile;
}> = [
  {
    label: "Auto",
    value: "auto",
    description: "Generic document analysis only.",
  },
  {
    label: "Estimate",
    value: "estimate",
    description: "Adds estimate-specific structured extraction.",
  },
  {
    label: "NOI",
    value: "noi",
    description: "Adds NOI-specific structured extraction.",
  },
] as const;

const RERUN_COUNT_OPTIONS = ["1", "5", "10", "25"] as const;

const QUICK_QA_LANES = [
  { label: "All Docs", value: "all" },
  { label: "Estimate QA", value: "estimate" },
  { label: "NOI QA", value: "noi_certificate" },
] as const;

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "—";
  }
  return new Date(value).toLocaleString();
}

function formatNumber(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return "—";
  }
  return value.toLocaleString();
}

function formatLabel(value: string | null): string {
  if (!value) {
    return "—";
  }
  return value.replaceAll("_", " ");
}

function formatTitleLabel(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatTextPreview(value: string | null, fallback = "—"): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    return fallback;
  }
  if (trimmed.length <= 140) {
    return trimmed;
  }
  return `${trimmed.slice(0, 137)}...`;
}

function parseJsonValue(value: string | null): unknown {
  let current: unknown = value?.trim() ?? null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (typeof current !== "string") {
      return current;
    }

    const trimmed = current.trim();
    if (!trimmed) {
      return null;
    }

    try {
      current = JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }

  return current;
}

function isRecord(
  value: unknown
): value is Record<
  string,
  boolean | null | number | string | unknown[] | Record<string, unknown>
> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatStructuredPrimitive(value: unknown): string {
  if (value === null || value === undefined) {
    return "—";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value.toLocaleString() : String(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || "—";
  }

  return JSON.stringify(value);
}

function structuredArrayKey(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value);
}

function statusBadge(status: string | null) {
  switch (status) {
    case "success":
      return (
        <Badge className="bg-emerald-500/10 text-emerald-600" variant="outline">
          Success
        </Badge>
      );
    case "failed":
      return (
        <Badge className="bg-red-500/10 text-red-600" variant="outline">
          Failed
        </Badge>
      );
    case "pending":
      return (
        <Badge className="bg-amber-500/10 text-amber-600" variant="outline">
          Pending
        </Badge>
      );
    case "deduped":
      return (
        <Badge className="bg-blue-500/10 text-blue-600" variant="outline">
          Deduped
        </Badge>
      );
    case "skipped":
      return <Badge variant="secondary">Skipped</Badge>;
    default:
      return <Badge variant="outline">{status ?? "unknown"}</Badge>;
  }
}

function analysisModeBadge(model: string | null) {
  if (!model) {
    return null;
  }

  if (model === "text-only") {
    return (
      <Badge className="bg-sky-500/10 text-sky-700" variant="outline">
        Text-only
      </Badge>
    );
  }

  return (
    <Badge className="bg-violet-500/10 text-violet-700" variant="outline">
      LLM
    </Badge>
  );
}

function reviewBadge(status: string | null) {
  switch (status) {
    case "approved":
      return (
        <Badge className="bg-emerald-500/10 text-emerald-700" variant="outline">
          Approved
        </Badge>
      );
    case "needs_work":
      return (
        <Badge className="bg-amber-500/10 text-amber-700" variant="outline">
          Needs Work
        </Badge>
      );
    default:
      return (
        <Badge className="bg-slate-500/10 text-slate-700" variant="outline">
          Needs Review
        </Badge>
      );
  }
}

function StructuredNode({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return (
      <div className="text-muted-foreground text-sm">
        No structured output stored.
      </div>
    );
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <div className="text-muted-foreground text-sm">No items.</div>;
    }

    const primitivesOnly = value.every(
      (item) => !(Array.isArray(item) || isRecord(item))
    );
    if (primitivesOnly) {
      return (
        <div className="flex flex-wrap gap-2">
          {value.map((item, index) => (
            <Badge key={`${index}-${String(item)}`} variant="secondary">
              {formatStructuredPrimitive(item)}
            </Badge>
          ))}
        </div>
      );
    }

    return (
      <div className="space-y-3">
        {value.map((item, index) => (
          <div
            className="rounded-lg border border-border/60 bg-background/50 p-3"
            key={structuredArrayKey(item)}
          >
            <div className="mb-2 text-muted-foreground text-xs">
              Item {index + 1}
            </div>
            <StructuredNode value={item} />
          </div>
        ))}
      </div>
    );
  }

  if (!isRecord(value)) {
    return (
      <div className="whitespace-pre-wrap break-words text-sm">
        {formatStructuredPrimitive(value)}
      </div>
    );
  }

  const entries = Object.entries(value);
  if (entries.length === 0) {
    return (
      <div className="text-muted-foreground text-sm">No structured fields.</div>
    );
  }

  const primitiveEntries = entries.filter(
    ([, entryValue]) => !(Array.isArray(entryValue) || isRecord(entryValue))
  );
  const complexEntries = entries.filter(
    ([, entryValue]) => Array.isArray(entryValue) || isRecord(entryValue)
  );

  return (
    <div className="space-y-4">
      {primitiveEntries.length > 0 && (
        <dl className="grid gap-x-6 gap-y-3 md:grid-cols-2">
          {primitiveEntries.map(([key, entryValue]) => (
            <div key={key}>
              <dt className="text-muted-foreground text-xs">
                {formatTitleLabel(key)}
              </dt>
              <dd className="mt-1 whitespace-pre-wrap break-words text-sm">
                {formatStructuredPrimitive(entryValue)}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {complexEntries.map(([key, entryValue]) => (
        <div className="space-y-2" key={key}>
          <div className="text-muted-foreground text-xs">
            {formatTitleLabel(key)}
          </div>
          <div className="rounded-lg border border-border/60 bg-background/50 p-3">
            <StructuredNode value={entryValue} />
          </div>
        </div>
      ))}
    </div>
  );
}

function StructuredOutputPanel({ detail }: { detail: ReviewDetail }) {
  const parsed = parseJsonValue(detail.structured_output_json);
  const hasStructured =
    parsed !== null &&
    parsed !== undefined &&
    (!(typeof parsed === "string") || parsed.trim().length > 0);

  if (!hasStructured) {
    return (
      <div className="rounded-lg border border-border/60 bg-background/50 p-4 text-muted-foreground text-sm">
        No structured output stored.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border/60 bg-background/50 p-4">
        <StructuredNode value={parsed} />
      </div>

      <div className="rounded-lg border border-border/60 bg-background/50 p-4">
        <div className="mb-2 text-muted-foreground text-xs">Raw JSON</div>
        <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap break-words font-mono text-xs">
          {detail.structured_output_json?.trim() ||
            "No structured output stored."}
        </pre>
      </div>
    </div>
  );
}

function PageArtifactsPanel({ detail }: { detail: ReviewDetail }) {
  const metadata = parseJsonValue(detail.extraction_metadata_json);
  const pageArtifacts =
    isRecord(metadata) && metadata.page_artifacts
      ? metadata.page_artifacts
      : null;
  const tables =
    isRecord(metadata) && Array.isArray(metadata.tables) ? metadata.tables : [];
  const elements =
    isRecord(metadata) && Array.isArray(metadata.elements)
      ? metadata.elements
      : [];

  let pageCount = detail.page_count ?? 0;
  if (
    isRecord(pageArtifacts) &&
    typeof pageArtifacts.total_count === "number"
  ) {
    pageCount = pageArtifacts.total_count;
  } else if (Array.isArray(pageArtifacts)) {
    pageCount = pageArtifacts.length;
  } else if (isRecord(pageArtifacts) && Array.isArray(pageArtifacts.pages)) {
    pageCount = pageArtifacts.pages.length;
  }

  if (!(pageArtifacts || tables.length > 0 || elements.length > 0)) {
    return (
      <div className="rounded-lg border border-border/60 bg-background/50 p-4 text-muted-foreground text-sm">
        No page artifacts stored for this document yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-border/60 bg-background/50 p-3">
          <div className="text-muted-foreground text-xs">Pages</div>
          <div className="mt-1 text-sm">{formatNumber(pageCount)}</div>
        </div>
        <div className="rounded-lg border border-border/60 bg-background/50 p-3">
          <div className="text-muted-foreground text-xs">Tables</div>
          <div className="mt-1 text-sm">{formatNumber(tables.length)}</div>
        </div>
        <div className="rounded-lg border border-border/60 bg-background/50 p-3">
          <div className="text-muted-foreground text-xs">OCR Elements</div>
          <div className="mt-1 text-sm">{formatNumber(elements.length)}</div>
        </div>
      </div>

      {pageArtifacts && (
        <div className="rounded-lg border border-border/60 bg-background/50 p-4">
          <div className="mb-2 text-muted-foreground text-xs">
            Page Artifacts
          </div>
          <StructuredNode value={pageArtifacts} />
        </div>
      )}

      {tables.length > 0 && (
        <div className="rounded-lg border border-border/60 bg-background/50 p-4">
          <div className="mb-2 text-muted-foreground text-xs">Tables</div>
          <StructuredNode value={tables} />
        </div>
      )}

      {elements.length > 0 && (
        <div className="rounded-lg border border-border/60 bg-background/50 p-4">
          <div className="mb-2 text-muted-foreground text-xs">
            OCR Elements (first 50)
          </div>
          <StructuredNode value={elements.slice(0, 50)} />
        </div>
      )}
    </div>
  );
}

async function copyText(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    toast.error(`Copy failed: ${message}`);
  }
}

function DocumentPreviewPanel({
  detail,
  embedded = false,
  isLoading,
}: {
  detail: ReviewDetail | undefined;
  embedded?: boolean;
  isLoading: boolean;
}) {
  if (isLoading && !detail) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-muted-foreground text-sm">
        Loading document preview...
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="rounded-xl border border-border border-dashed bg-card/50 p-8 text-center text-muted-foreground text-sm">
        Select a document to compare the source file against its analysis.
      </div>
    );
  }

  const previewUrl = detail.preview_url;
  const downloadUrl = detail.download_url;
  let previewContent: ReactNode;

  if (!(detail.can_preview && previewUrl)) {
    previewContent = (
      <div className="flex h-full min-h-[680px] items-center justify-center rounded-lg border border-border border-dashed bg-background/60 p-8 text-center text-muted-foreground text-sm">
        Preview is not available for this document yet. Rerun can still work
        when the source file is recoverable, but old parsed rows may not have a
        stored local file.
      </div>
    );
  } else if (detail.preview_kind === "image") {
    previewContent = (
      <div className="flex h-full items-start justify-center overflow-auto rounded-lg border border-border bg-background p-2">
        <img
          alt={detail.file_name ?? `Document ${detail.id}`}
          className="h-auto max-w-full rounded"
          height={1600}
          src={previewUrl}
          width={1200}
        />
      </div>
    );
  } else if (detail.preview_kind === "pdf") {
    previewContent = (
      <iframe
        className="h-[700px] w-full rounded-lg border border-border bg-background"
        src={`${previewUrl}#toolbar=0&navpanes=0`}
        title={detail.file_name ?? `Document ${detail.id}`}
      />
    );
  } else {
    previewContent = (
      <div className="flex h-full min-h-[680px] items-center justify-center rounded-lg border border-border bg-background/80 p-8 text-center text-muted-foreground text-sm">
        Browser preview is not supported for this file type.
      </div>
    );
  }

  if (embedded) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border/60 bg-background/50 p-4">
          <div>
            <div className="font-medium text-sm">Original Document</div>
            <p className="text-muted-foreground text-sm">
              Compare the source file against the extracted artifacts.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {previewUrl && (
              <Button asChild size="sm" variant="outline">
                <a href={previewUrl} rel="noreferrer" target="_blank">
                  <Eye />
                  Open
                </a>
              </Button>
            )}
            {downloadUrl && (
              <Button asChild size="sm" variant="outline">
                <a href={downloadUrl}>
                  <Download />
                  Download
                </a>
              </Button>
            )}
          </div>
        </div>

        <div className="min-h-[720px] rounded-lg bg-muted/20 p-3">
          {previewContent}
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-medium text-base">Original Document</h2>
            <p className="text-muted-foreground text-sm">
              Flip between the source file and the extracted artifacts.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {previewUrl && (
              <Button asChild size="sm" variant="outline">
                <a href={previewUrl} rel="noreferrer" target="_blank">
                  <Eye />
                  Open
                </a>
              </Button>
            )}
            {downloadUrl && (
              <Button asChild size="sm" variant="outline">
                <a href={downloadUrl}>
                  <Download />
                  Download
                </a>
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="min-h-[720px] bg-muted/20 p-3">{previewContent}</div>
    </div>
  );
}

function ArtifactPanel({
  detail,
  isLoading,
  onReviewNotesChange,
  onReviewStatusChange,
  onSaveReview,
  reviewNotes,
  reviewSaving,
  reviewStatus,
}: {
  detail: ReviewDetail | undefined;
  isLoading: boolean;
  onReviewNotesChange: (value: string) => void;
  onReviewStatusChange: (value: Exclude<ReviewQaStatus, "all">) => void;
  onSaveReview: () => Promise<void>;
  reviewNotes: string;
  reviewSaving: boolean;
  reviewStatus: Exclude<ReviewQaStatus, "all">;
}) {
  if (isLoading && !detail) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-muted-foreground text-sm">
        Loading analysis artifacts...
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="rounded-xl border border-border border-dashed bg-card/50 p-8 text-center text-muted-foreground text-sm">
        Select a document to inspect summary, clean markdown, structured output,
        and raw text.
      </div>
    );
  }

  const hasStructured = Boolean(detail.structured_output_json?.trim());
  const hasText = Boolean(detail.extracted_text?.trim());
  const hasMarkdown = Boolean(detail.clean_markdown?.trim());
  const currentReviewStatus =
    detail.qa_status === "approved" || detail.qa_status === "needs_work"
      ? detail.qa_status
      : "unreviewed";
  const reviewDirty =
    currentReviewStatus !== reviewStatus ||
    (detail.qa_notes ?? "") !== reviewNotes;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-medium text-base">
                {detail.file_name ?? `Document #${detail.id}`}
              </h2>
              {statusBadge(detail.extraction_status)}
              <Badge variant="outline">
                {formatLabel(detail.document_type)}
              </Badge>
              {analysisModeBadge(detail.model)}
              {reviewBadge(detail.qa_status)}
            </div>
            <p className="text-muted-foreground text-sm">
              {detail.structured_output_label} · {detail.extraction_profile} ·{" "}
              {detail.model ?? "—"} · {formatNumber(detail.processing_time_ms)}{" "}
              ms
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {hasMarkdown && (
              <Button
                onClick={() =>
                  copyText(detail.clean_markdown ?? "", "Clean markdown")
                }
                size="sm"
                variant="outline"
              >
                <Copy />
                Copy Markdown
              </Button>
            )}
            {hasStructured && (
              <Button
                onClick={() =>
                  copyText(
                    detail.structured_output_json ?? "",
                    detail.structured_output_label
                  )
                }
                size="sm"
                variant="outline"
              >
                <Copy />
                Copy JSON
              </Button>
            )}
            {hasText && (
              <Button
                onClick={() =>
                  copyText(detail.extracted_text ?? "", "Raw extracted text")
                }
                size="sm"
                variant="outline"
              >
                <Copy />
                Copy Text
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4 p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-border/60 bg-background/50 p-3">
            <div className="text-muted-foreground text-xs">Project</div>
            <div className="mt-1 text-sm">
              {detail.project_name ??
                (detail.project_id ? `#${detail.project_id}` : "—")}
            </div>
          </div>
          <div className="rounded-lg border border-border/60 bg-background/50 p-3">
            <div className="text-muted-foreground text-xs">Email</div>
            <div className="mt-1 text-sm">{detail.email_subject ?? "—"}</div>
            <div className="text-muted-foreground text-xs">
              {detail.from_email ?? detail.mailbox_email ?? ""}
            </div>
          </div>
          <div className="rounded-lg border border-border/60 bg-background/50 p-3">
            <div className="text-muted-foreground text-xs">Extraction</div>
            <div className="mt-1 text-sm">
              {detail.extraction_method ?? "—"} ·{" "}
              {formatNumber(detail.page_count)}
              {detail.page_count === 1 ? " page" : " pages"}
            </div>
            <div className="text-muted-foreground text-xs">
              Attempts: {formatNumber(detail.extraction_attempts)}
            </div>
          </div>
          <div className="rounded-lg border border-border/60 bg-background/50 p-3">
            <div className="text-muted-foreground text-xs">Timestamps</div>
            <div className="mt-1 text-sm">
              Extracted: {formatTimestamp(detail.extracted_at)}
            </div>
            <div className="text-muted-foreground text-xs">
              Updated: {formatTimestamp(detail.updated_at)}
            </div>
          </div>
        </div>

        {detail.extraction_error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
            <div className="font-medium text-red-600 text-sm">
              Extraction Error
            </div>
            <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-red-700 text-xs">
              {detail.extraction_error}
            </pre>
          </div>
        )}

        <div className="rounded-lg border border-border/60 bg-background/50 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="font-medium text-sm">Review</div>
              <p className="text-muted-foreground text-sm">
                Save human QA status and notes for this document.
              </p>
              <div className="mt-2 text-muted-foreground text-xs">
                {detail.reviewed_at
                  ? `Last reviewed ${formatTimestamp(detail.reviewed_at)}`
                  : "Not reviewed yet"}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => onReviewStatusChange("approved")}
                size="sm"
                variant={reviewStatus === "approved" ? "default" : "outline"}
              >
                Approve
              </Button>
              <Button
                onClick={() => onReviewStatusChange("needs_work")}
                size="sm"
                variant={reviewStatus === "needs_work" ? "default" : "outline"}
              >
                Needs Work
              </Button>
              <Button
                onClick={() => onReviewStatusChange("unreviewed")}
                size="sm"
                variant={reviewStatus === "unreviewed" ? "default" : "outline"}
              >
                Reset
              </Button>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <Textarea
              onChange={(event) => onReviewNotesChange(event.target.value)}
              placeholder="Notes about missing fields, OCR issues, project linkage, or what to improve on rerun..."
              rows={4}
              value={reviewNotes}
            />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-muted-foreground text-xs">
                `Rerun This Doc` runs immediately for the selected document.
              </div>
              <Button
                disabled={!reviewDirty || reviewSaving}
                onClick={async () => {
                  await onSaveReview();
                }}
                size="sm"
              >
                {reviewSaving ? "Saving..." : "Save Review"}
              </Button>
            </div>
          </div>
        </div>

        <Tabs className="min-h-[520px]" defaultValue="summary">
          <TabsList>
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="original">Original</TabsTrigger>
            <TabsTrigger value="markdown">Clean Markdown</TabsTrigger>
            <TabsTrigger value="structured">
              {detail.structured_output_label}
            </TabsTrigger>
            <TabsTrigger value="text">Raw Text</TabsTrigger>
            <TabsTrigger value="artifacts">Page Artifacts</TabsTrigger>
            <TabsTrigger value="meta">Metadata</TabsTrigger>
          </TabsList>

          <TabsContent value="summary">
            <div className="rounded-lg border border-border/60 bg-background/50 p-4">
              <pre className="whitespace-pre-wrap break-words font-sans text-sm">
                {detail.summary?.trim() || "No summary stored."}
              </pre>
            </div>
          </TabsContent>

          <TabsContent value="original">
            <DocumentPreviewPanel detail={detail} embedded isLoading={false} />
          </TabsContent>

          <TabsContent value="markdown">
            <div className="rounded-lg border border-border/60 bg-background/50 p-4">
              <pre className="max-h-[620px] overflow-auto whitespace-pre-wrap break-words font-mono text-xs">
                {detail.clean_markdown?.trim() ||
                  "No clean markdown artifact stored yet."}
              </pre>
            </div>
          </TabsContent>

          <TabsContent value="structured">
            <StructuredOutputPanel detail={detail} />
          </TabsContent>

          <TabsContent value="text">
            <div className="rounded-lg border border-border/60 bg-background/50 p-4">
              <pre className="max-h-[620px] overflow-auto whitespace-pre-wrap break-words font-mono text-xs">
                {detail.extracted_text?.trim() ||
                  "No raw extracted text stored."}
              </pre>
            </div>
          </TabsContent>

          <TabsContent value="artifacts">
            <PageArtifactsPanel detail={detail} />
          </TabsContent>

          <TabsContent value="meta">
            <div className="space-y-4">
              <div className="rounded-lg border border-border/60 bg-background/50 p-4">
                <dl className="grid gap-x-6 gap-y-3 md:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground text-xs">
                      Document ID
                    </dt>
                    <dd className="text-sm">{detail.id}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">Source</dt>
                    <dd className="text-sm">{formatLabel(detail.source)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">File path</dt>
                    <dd className="break-all text-sm">
                      {detail.file_path ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">
                      Local path
                    </dt>
                    <dd className="break-all text-sm">
                      {detail.local_path ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">
                      Storage path
                    </dt>
                    <dd className="break-all text-sm">
                      {detail.storage_path ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">
                      SharePoint path
                    </dt>
                    <dd className="break-all text-sm">
                      {detail.sharepoint_path ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">
                      SharePoint URL
                    </dt>
                    <dd className="break-all text-sm">
                      {detail.sharepoint_url ? (
                        <a
                          className="text-primary underline-offset-4 hover:underline"
                          href={detail.sharepoint_url}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {detail.sharepoint_url}
                        </a>
                      ) : (
                        "—"
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">File size</dt>
                    <dd className="text-sm">
                      {formatNumber(detail.file_size)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">
                      Original subject
                    </dt>
                    <dd className="text-sm">
                      {detail.original_subject ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">
                      Original from
                    </dt>
                    <dd className="text-sm">{detail.original_from ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">Forwarder</dt>
                    <dd className="text-sm">{detail.forwarder_email ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">Created</dt>
                    <dd className="text-sm">
                      {formatTimestamp(detail.created_at)}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-lg border border-border/60 bg-background/50 p-4">
                <div className="mb-2 text-muted-foreground text-xs">
                  Extraction metadata
                </div>
                <pre className="max-h-[320px] overflow-auto whitespace-pre-wrap break-words font-mono text-xs">
                  {detail.extraction_metadata_json?.trim() ||
                    "No extraction metadata stored."}
                </pre>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export function DocumentsPage() {
  const [searchInput, setSearchInput] = useState("");
  const [status, setStatus] = useState("success");
  const [source, setSource] = useState("parsed");
  const [docType, setDocType] = useState("all");
  const [reviewFilter, setReviewFilter] = useState<ReviewQaStatus>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [rerunCount, setRerunCount] = useState("5");
  const [extractionMode, setExtractionMode] =
    useState<ExtractionMode>("native");
  const [analysisProfile, setAnalysisProfile] =
    useState<AnalysisProfile>("auto");
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewStatus, setReviewStatus] =
    useState<Exclude<ReviewQaStatus, "all">>("unreviewed");
  const [rerunning, setRerunning] = useState(false);
  const debouncedQuery = useDebouncedValue(searchInput, 300);
  const searchPending = searchInput !== debouncedQuery;

  const listUrl =
    `/api/documents/review?status=${encodeURIComponent(status)}` +
    `&source=${encodeURIComponent(source)}` +
    `&docType=${encodeURIComponent(docType)}` +
    `&reviewStatus=${encodeURIComponent(reviewFilter)}` +
    `&limit=100&q=${encodeURIComponent(debouncedQuery)}`;
  const { data, error, isLoading, mutate } = useSWR<ReviewListResponse>(
    listUrl,
    fetcher,
    {
      dedupingInterval: 5000,
      keepPreviousData: true,
      revalidateOnFocus: false,
    }
  );

  const detailUrl = selectedId ? `/api/documents/review/${selectedId}` : null;
  const {
    data: detailData,
    error: detailError,
    isLoading: detailLoading,
    mutate: mutateDetail,
  } = useSWR<ReviewDetailResponse>(detailUrl, fetcher, {
    dedupingInterval: 5000,
    keepPreviousData: true,
    revalidateOnFocus: false,
  });
  const detail = detailData?.item;

  useEffect(() => {
    const items = data?.items ?? [];
    if (items.length === 0) {
      if (selectedId !== null) {
        setSelectedId(null);
      }
      return;
    }

    if (selectedId === null || !items.some((item) => item.id === selectedId)) {
      setSelectedId(items[0]?.id ?? null);
    }
  }, [data, selectedId]);

  useEffect(() => {
    if (selectedId === null) {
      setReviewStatus("unreviewed");
      setReviewNotes("");
      return;
    }

    const nextStatus =
      detail?.qa_status === "approved" || detail?.qa_status === "needs_work"
        ? detail.qa_status
        : "unreviewed";
    setReviewStatus(nextStatus);
    setReviewNotes(detail?.qa_notes ?? "");
  }, [detail?.qa_notes, detail?.qa_status, selectedId]);

  const runRerun = async (ids: number[], label: string) => {
    if (ids.length === 0) {
      toast.error("No parsed documents selected for rerun");
      return;
    }

    setRerunning(true);
    try {
      const response = await fetch("/api/documents/review/rerun", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ids,
          extractionMode,
          analysisProfile,
        }),
      });

      const payload = (await response.json()) as ReviewRerunResponse & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Rerun failed");
      }

      const failedSamples = payload.results
        .filter((result) => result.status === "failed")
        .slice(0, 3)
        .map((result) => `#${result.id}: ${result.error ?? "failed"}`);

      toast.success(
        `${label}: ${payload.succeeded} succeeded, ${payload.failed} failed`
      );
      if (failedSamples.length > 0) {
        toast.message("Rerun failures", {
          description: failedSamples.join(" · "),
        });
      }

      await Promise.all([mutate(), mutateDetail()]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Rerun failed: ${message}`);
    } finally {
      setRerunning(false);
    }
  };

  const saveReview = async () => {
    if (!detail) {
      return;
    }

    setReviewSaving(true);
    try {
      const response = await fetch(
        `/api/documents/review/${detail.id}/review`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            qaNotes: reviewNotes,
            qaStatus: reviewStatus,
          }),
        }
      );

      const payload = (await response.json()) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Save failed");
      }

      toast.success("Review saved");
      await Promise.all([mutate(), mutateDetail()]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Save failed: ${message}`);
    } finally {
      setReviewSaving(false);
    }
  };

  if (error && !data) {
    return <PageError message="Failed to load document review data" />;
  }

  if (isLoading || !data) {
    return <PageLoading />;
  }

  const batchIds = (data.items ?? [])
    .filter((item) => item.source === "parsed")
    .slice(0, Number.parseInt(rerunCount, 10) || 5)
    .map((item) => item.id);
  const selectedCanRerun = detail?.can_rerun ?? false;

  const applyQuickLane = (value: (typeof QUICK_QA_LANES)[number]["value"]) => {
    setDocType(value);

    if (value === "estimate") {
      setStatus("success");
      setSource("parsed");
      setReviewFilter("unreviewed");
      setAnalysisProfile("estimate");
      return;
    }

    if (value === "noi_certificate") {
      setStatus("success");
      setSource("parsed");
      setReviewFilter("unreviewed");
      setAnalysisProfile("noi");
      return;
    }

    setReviewFilter("all");
  };

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        actions={
          <Button
            onClick={async () => {
              await Promise.all([mutate(), mutateDetail()]);
            }}
            size="sm"
            variant="outline"
          >
            <RefreshCw />
            Refresh
          </Button>
        }
        breadcrumbs={[{ label: "Documents" }]}
        description="Review source files against clean markdown, raw text, and structured output"
        title="Documents"
      />

      <div className="flex-1 p-6 lg:p-8">
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-7">
            <StatCard
              label="Parsed Success"
              value={data.stats.parsed_success.toLocaleString()}
            />
            <StatCard
              label="Attachment Pending"
              value={data.stats.attachments_pending.toLocaleString()}
            />
            <StatCard
              label="Attachment Failed"
              value={data.stats.attachments_failed.toLocaleString()}
            />
            <StatCard
              accent
              label="Structured Output"
              value={data.stats.with_raw_extraction.toLocaleString()}
            />
            <StatCard
              label="Raw Text"
              value={data.stats.with_extracted_text.toLocaleString()}
            />
            <StatCard
              label="Clean Markdown"
              value={data.stats.with_clean_markdown.toLocaleString()}
            />
            <StatCard
              label="Total Documents"
              value={data.stats.total_documents.toLocaleString()}
            />
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex flex-col gap-4">
              {(error || detailError) && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-amber-700 text-sm">
                  Live refresh failed. Showing the last successful document
                  review data.
                </div>
              )}

              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                  <Input
                    className="lg:w-[320px]"
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder="Search file, summary, project, email..."
                    value={searchInput}
                  />

                  <div className="flex flex-wrap gap-2">
                    <Select onValueChange={setStatus} value={status}>
                      <SelectTrigger className="min-w-[150px]" size="sm">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select onValueChange={setSource} value={source}>
                      <SelectTrigger className="min-w-[170px]" size="sm">
                        <SelectValue placeholder="Source" />
                      </SelectTrigger>
                      <SelectContent>
                        {SOURCE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select onValueChange={setDocType} value={docType}>
                      <SelectTrigger className="min-w-[180px]" size="sm">
                        <SelectValue placeholder="Document type" />
                      </SelectTrigger>
                      <SelectContent>
                        {DOC_TYPE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      onValueChange={(value) =>
                        setReviewFilter(value as ReviewQaStatus)
                      }
                      value={reviewFilter}
                    >
                      <SelectTrigger className="min-w-[170px]" size="sm">
                        <SelectValue placeholder="Review state" />
                      </SelectTrigger>
                      <SelectContent>
                        {REVIEW_STATUS_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
                  <div>
                    {data.items.length.toLocaleString()} documents in current
                    view
                  </div>
                  {searchPending && (
                    <Badge variant="secondary">Updating search...</Badge>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground text-xs">
                  Quick lanes
                </span>
                {QUICK_QA_LANES.map((lane) => (
                  <Button
                    key={lane.value}
                    onClick={() => applyQuickLane(lane.value)}
                    size="sm"
                    variant={docType === lane.value ? "default" : "outline"}
                  >
                    {lane.label}
                  </Button>
                ))}
              </div>

              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="grid gap-2 text-muted-foreground text-xs lg:grid-cols-2">
                  <div>
                    Mode:{" "}
                    {
                      EXTRACTION_MODE_OPTIONS.find(
                        (option) => option.value === extractionMode
                      )?.description
                    }
                  </div>
                  <div>
                    Profile:{" "}
                    {
                      ANALYSIS_PROFILE_OPTIONS.find(
                        (option) => option.value === analysisProfile
                      )?.description
                    }
                  </div>
                </div>

                <div className="flex flex-col gap-3 xl:items-end">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[180px_180px_110px_auto_auto]">
                    <Select
                      onValueChange={(value) =>
                        setExtractionMode(value as ExtractionMode)
                      }
                      value={extractionMode}
                    >
                      <SelectTrigger size="sm">
                        <SelectValue placeholder="Extraction mode" />
                      </SelectTrigger>
                      <SelectContent>
                        {EXTRACTION_MODE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      onValueChange={(value) =>
                        setAnalysisProfile(value as AnalysisProfile)
                      }
                      value={analysisProfile}
                    >
                      <SelectTrigger size="sm">
                        <SelectValue placeholder="Analysis profile" />
                      </SelectTrigger>
                      <SelectContent>
                        {ANALYSIS_PROFILE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select onValueChange={setRerunCount} value={rerunCount}>
                      <SelectTrigger className="min-w-[110px]" size="sm">
                        <SelectValue placeholder="Count" />
                      </SelectTrigger>
                      <SelectContent>
                        {RERUN_COUNT_OPTIONS.map((option) => (
                          <SelectItem key={option} value={option}>
                            First {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Button
                      disabled={rerunning || !selectedId || !selectedCanRerun}
                      onClick={() =>
                        selectedId
                          ? runRerun([selectedId], "Priority rerun")
                          : null
                      }
                      size="sm"
                      variant="outline"
                    >
                      <RotateCcw />
                      Rerun This Doc
                    </Button>

                    <Button
                      disabled={rerunning || batchIds.length === 0}
                      onClick={() =>
                        runRerun(batchIds, `First ${batchIds.length}`)
                      }
                      size="sm"
                    >
                      <RotateCcw />
                      Rerun Top {batchIds.length}
                    </Button>
                  </div>

                  <div className="text-muted-foreground text-xs">
                    Selected reruns execute immediately for the current
                    document.
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
            <ReviewQueueCard
              description="Filter to `estimate` when you want a tight QA lane."
              empty="No documents match the current filters."
              getKey={(item) => item.id}
              items={data.items}
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
                        <div className="truncate font-medium text-sm">
                          {item.file_name ?? `Document #${item.id}`}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {statusBadge(item.extraction_status)}
                          <Badge variant="outline">
                            {formatLabel(item.document_type)}
                          </Badge>
                          {analysisModeBadge(item.model)}
                          {reviewBadge(item.qa_status)}
                          {item.has_clean_markdown && (
                            <Badge variant="secondary">MD</Badge>
                          )}
                          {item.has_extracted_text && (
                            <Badge variant="secondary">Text</Badge>
                          )}
                        </div>
                      </div>
                      <div className="text-muted-foreground text-xs">
                        #{item.id}
                      </div>
                    </div>

                    <div className="mt-2 space-y-1 text-muted-foreground text-xs">
                      <div>
                        {formatTextPreview(
                          item.project_name,
                          "No project link"
                        )}
                      </div>
                      <div>
                        {formatTextPreview(
                          item.email_subject,
                          "No email context"
                        )}
                      </div>
                      <div>
                        {formatTextPreview(item.summary, "No summary stored")}
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-3 text-muted-foreground text-xs">
                      <span>{formatTimestamp(item.extracted_at)}</span>
                      <span>{formatNumber(item.processing_time_ms)} ms</span>
                      <span>{formatNumber(item.clean_markdown_length)} md</span>
                      <span>
                        {formatNumber(item.extracted_text_length)} text
                      </span>
                    </div>
                  </button>
                );
              }}
              title="Review Queue"
            />

            <ArtifactPanel
              detail={detail}
              isLoading={detailLoading}
              onReviewNotesChange={setReviewNotes}
              onReviewStatusChange={setReviewStatus}
              onSaveReview={saveReview}
              reviewNotes={reviewNotes}
              reviewSaving={reviewSaving}
              reviewStatus={reviewStatus}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
