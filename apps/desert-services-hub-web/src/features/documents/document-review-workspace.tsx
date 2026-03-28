import { createSearchParams, Link, useSearchParams } from "react-router";

import type { DocumentReviewItem } from "@/features/documents/document-model";
import { formatDateTime, formatDisplay } from "@/lib/formatters";
import { cn } from "@/lib/utils";

type DocumentView = "all" | "failed" | "needs_review" | "project_linked";

interface DocumentReviewWorkspaceProps {
  items: DocumentReviewItem[];
}

const viewOptions: { label: string; value: DocumentView }[] = [
  { label: "All", value: "all" },
  { label: "Failed extraction", value: "failed" },
  { label: "Needs review", value: "needs_review" },
  { label: "Project linked", value: "project_linked" },
];

const getDocumentView = (value: string | null): DocumentView =>
  value === "failed" || value === "needs_review" || value === "project_linked"
    ? value
    : "all";

const filterDocuments = (
  items: DocumentReviewItem[],
  activeView: DocumentView
): DocumentReviewItem[] => {
  if (activeView === "failed") {
    return items.filter((item) => item.extractionStatus === "failed");
  }

  if (activeView === "needs_review") {
    return items.filter((item) => item.qaStatus !== "approved");
  }

  if (activeView === "project_linked") {
    return items.filter((item) => item.projectId !== null);
  }

  return items;
};

const getSummaryStats = (items: DocumentReviewItem[]) =>
  [
    {
      label: "Documents",
      value: String(items.length),
    },
    {
      label: "Failed extraction",
      value: String(
        items.filter((item) => item.extractionStatus === "failed").length
      ),
    },
    {
      label: "Needs review",
      value: String(
        items.filter((item) => item.qaStatus !== "approved").length
      ),
    },
    {
      label: "Linked to projects",
      value: String(items.filter((item) => item.projectId !== null).length),
    },
  ] as const;

const getSearchString = (
  searchParams: URLSearchParams,
  updates: Record<string, string | null>
): string => {
  const next = new URLSearchParams(searchParams);

  for (const [key, value] of Object.entries(updates)) {
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
  }

  return `?${createSearchParams(next).toString()}`;
};

const getStatusTone = (status: string): string => {
  if (status === "success") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "failed") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  if (status === "pending") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-border bg-muted text-muted-foreground";
};

const getQaTone = (status: DocumentReviewItem["qaStatus"]): string => {
  if (status === "approved") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "needs_work") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-border bg-muted text-muted-foreground";
};

const getProjectContextLabel = (item: DocumentReviewItem): string => {
  if (item.projectId === null) {
    return "Not linked yet";
  }

  return `#${item.projectId} • ${formatDisplay(item.projectName)}`;
};

const getEmailContextLabel = (item: DocumentReviewItem): string => {
  if (item.emailId === null) {
    return "No email context";
  }

  return `#${item.emailId}`;
};

export const DocumentReviewWorkspace = ({
  items,
}: DocumentReviewWorkspaceProps) => {
  const [searchParams] = useSearchParams();
  const activeView = getDocumentView(searchParams.get("view"));
  const filteredItems = filterDocuments(items, activeView);
  const selectedDocumentId = Number.parseInt(
    searchParams.get("document") ?? "",
    10
  );
  const selectedItem =
    filteredItems.find((item) => item.id === selectedDocumentId) ??
    filteredItems[0] ??
    null;
  const summaryStats = getSummaryStats(items);

  return (
    <div className="flex flex-1 flex-col gap-8">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryStats.map((stat) => (
          <article
            className="rounded-2xl border border-border bg-card p-5 shadow-md shadow-black/5"
            key={stat.label}
          >
            <p className="text-muted-foreground text-sm">{stat.label}</p>
            <p className="mt-3 font-heading font-semibold text-3xl tracking-tight">
              {stat.value}
            </p>
          </article>
        ))}
      </section>

      <section className="rounded-3xl border border-border bg-card p-6 shadow-md shadow-black/5 lg:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <p className="font-medium text-muted-foreground text-sm uppercase tracking-[0.2em]">
              Documents
            </p>
            <div>
              <h1 className="font-heading font-semibold text-4xl tracking-tight">
                Review queue
              </h1>
              <p className="mt-2 max-w-3xl text-muted-foreground">
                This sample queue is shaped from the real document review data
                model: extraction status, QA state, project linkage, email
                context, and rerun/preview affordances.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {viewOptions.map((option) => {
              const isActive = option.value === activeView;

              return (
                <Link
                  className={cn(
                    "rounded-full border px-3 py-2 font-medium text-sm transition-colors",
                    isActive
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-background text-foreground hover:bg-muted"
                  )}
                  key={option.value}
                  to={getSearchString(searchParams, {
                    document: selectedItem?.id ? String(selectedItem.id) : null,
                    view: option.value === "all" ? null : option.value,
                  })}
                >
                  {option.label}
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr,1.1fr]">
        <div className="space-y-4">
          {filteredItems.map((item) => {
            const isSelected = item.id === selectedItem?.id;

            return (
              <Link
                className={cn(
                  "block rounded-2xl border bg-card p-5 shadow-md shadow-black/5 transition-all",
                  isSelected
                    ? "border-foreground/60 ring-2 ring-foreground/10"
                    : "border-border hover:border-foreground/30"
                )}
                key={item.id}
                to={getSearchString(searchParams, {
                  document: String(item.id),
                })}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate font-heading font-semibold text-xl tracking-tight">
                      {item.fileName}
                    </p>
                    <p className="mt-1 text-muted-foreground text-sm">
                      {formatDisplay(item.projectName)}
                    </p>
                  </div>
                  <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-muted-foreground text-xs">
                    #{item.id}
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  <span
                    className={cn(
                      "rounded-full border px-2.5 py-1",
                      getStatusTone(item.extractionStatus)
                    )}
                  >
                    {item.extractionStatus}
                  </span>
                  <span
                    className={cn(
                      "rounded-full border px-2.5 py-1",
                      getQaTone(item.qaStatus)
                    )}
                  >
                    {item.qaStatus}
                  </span>
                  <span className="rounded-full border border-border px-2.5 py-1">
                    {item.documentType}
                  </span>
                  <span className="rounded-full border border-border px-2.5 py-1">
                    {item.source}
                  </span>
                </div>

                <p className="mt-4 text-muted-foreground text-sm leading-6">
                  {item.summary}
                </p>
              </Link>
            );
          })}
        </div>

        {selectedItem ? (
          <article className="rounded-2xl border border-border bg-card p-6 shadow-md shadow-black/5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-heading font-semibold text-3xl tracking-tight">
                  {selectedItem.fileName}
                </p>
                <p className="mt-1 text-muted-foreground">
                  {selectedItem.summary}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <span
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs",
                    getStatusTone(selectedItem.extractionStatus)
                  )}
                >
                  {selectedItem.extractionStatus}
                </span>
                <span
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs",
                    getQaTone(selectedItem.qaStatus)
                  )}
                >
                  {selectedItem.qaStatus}
                </span>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl bg-muted/50 p-4">
                <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
                  Project
                </p>
                <p className="mt-2 font-medium text-sm">
                  {getProjectContextLabel(selectedItem)}
                </p>
              </div>
              <div className="rounded-2xl bg-muted/50 p-4">
                <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
                  Email context
                </p>
                <p className="mt-2 font-medium text-sm">
                  {getEmailContextLabel(selectedItem)}
                </p>
                <p className="mt-1 text-muted-foreground text-sm">
                  {formatDisplay(selectedItem.emailSubject)}
                </p>
              </div>
              <div className="rounded-2xl bg-muted/50 p-4">
                <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
                  Timestamps
                </p>
                <p className="mt-2 font-medium text-sm">
                  Updated {formatDateTime(selectedItem.updatedAt)}
                </p>
                <p className="mt-1 text-muted-foreground text-sm">
                  Created {formatDateTime(selectedItem.createdAt)}
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-[0.95fr,1.05fr]">
              <div className="rounded-2xl border border-border bg-background p-4">
                <h2 className="font-heading font-semibold text-lg tracking-tight">
                  Review signals
                </h2>
                <ul className="mt-3 space-y-3">
                  {selectedItem.keySignals.map((signal) => (
                    <li
                      className="rounded-2xl bg-muted/50 px-4 py-3 text-sm leading-6"
                      key={signal}
                    >
                      {signal}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-2xl border border-border bg-background p-4">
                <h2 className="font-heading font-semibold text-lg tracking-tight">
                  Extracted fields
                </h2>
                <dl className="mt-3 space-y-3">
                  {selectedItem.extractedFields.map((field) => (
                    <div
                      className="rounded-2xl bg-muted/50 px-4 py-3"
                      key={`${selectedItem.id}-${field.label}`}
                    >
                      <dt className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
                        {field.label}
                      </dt>
                      <dd className="mt-2 text-sm">{field.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-dashed border-border bg-background px-4 py-4">
              <p className="font-medium text-sm">{selectedItem.previewLabel}</p>
              <p className="mt-2 text-muted-foreground text-sm">
                Preview:{" "}
                {selectedItem.canPreview ? "available" : "not available"} •
                Rerun: {selectedItem.canRerun ? "available" : "not available"}
              </p>
            </div>
          </article>
        ) : (
          <article className="rounded-2xl border border-dashed border-border bg-card p-6 text-muted-foreground shadow-md shadow-black/5">
            No documents matched the current view.
          </article>
        )}
      </section>
    </div>
  );
};
