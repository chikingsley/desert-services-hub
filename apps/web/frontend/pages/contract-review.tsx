/**
 * Contract Review Workspace
 * Route: /contracts/review
 *
 * Shows contract documents that have been analyzed by langextract NER,
 * with entity severity breakdown and expandable entity details.
 */
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Info,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import useSWR from "swr";
import { PageHeader } from "@/apps/web/frontend/components/page-header";
import {
  PageError,
  PageLoading,
} from "@/apps/web/frontend/components/page-loading";
import { Badge } from "@/apps/web/frontend/components/ui/badge";
import { Button } from "@/apps/web/frontend/components/ui/button";
import { fetcher } from "@/apps/web/frontend/lib/fetcher";

interface Entity {
  class: string;
  text: string;
  attributes: {
    severity?: "critical" | "warning" | "info";
    recommended_action?: string;
  };
  start: number | null;
  end: number | null;
}

interface ReviewDoc {
  id: number;
  file_name: string | null;
  document_type: string | null;
  project_id: number | null;
  project_name: string | null;
  entity_count: number;
  critical_count: number;
  warning_count: number;
  info_count: number;
  model: string | null;
  entities: Entity[];
  updated_at: string;
}

interface ReviewApiResponse {
  items: ReviewDoc[];
  total: number;
}

const CLASS_LABELS: Record<string, string> = {
  scope_creep: "Scope Creep",
  mobilization_trap: "Mobilization Trap",
  inapplicable_section: "Inapplicable Section",
  overbroad_language: "Overbroad Language",
  noi_not_filing: "NOI / Not Filing",
  record_retention: "Record Retention",
  inspection_terms: "Inspection Terms",
  payment_terms: "Payment Terms",
  liability_language: "Liability Language",
  company_name_issue: "Company Name Issue",
  missing_quantity: "Missing Quantity",
};

function severityBadge(severity: string | undefined) {
  if (severity === "critical") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 font-medium text-red-700 text-xs">
        <XCircle className="h-3 w-3" />
        Critical
      </span>
    );
  }
  if (severity === "warning") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 font-medium text-amber-700 text-xs">
        <AlertTriangle className="h-3 w-3" />
        Warning
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 font-medium text-blue-700 text-xs">
      <Info className="h-3 w-3" />
      Info
    </span>
  );
}

function EntityCard({ entity }: { entity: Entity }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            {severityBadge(entity.attributes.severity)}
            <span className="text-muted-foreground text-xs">
              {CLASS_LABELS[entity.class] ?? entity.class}
            </span>
          </div>
          <blockquote className="mb-2 border-border border-l-2 pl-2 text-muted-foreground text-xs italic">
            &ldquo;{entity.text}&rdquo;
          </blockquote>
          {entity.attributes.recommended_action && (
            <p className="text-foreground/80 text-xs">
              {entity.attributes.recommended_action}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ReviewDocRow({ doc }: { doc: ReviewDoc }) {
  const [expanded, setExpanded] = useState(false);

  const criticalEntities = doc.entities.filter(
    (e) => e.attributes.severity === "critical"
  );
  const warningEntities = doc.entities.filter(
    (e) => e.attributes.severity === "warning"
  );
  const infoEntities = doc.entities.filter(
    (e) => e.attributes.severity === "info" || !e.attributes.severity
  );

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <button
        className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-muted/30"
        onClick={() => setExpanded((prev) => !prev)}
        type="button"
      >
        <span className="text-muted-foreground">
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate font-medium">
              {doc.file_name ?? `Document #${doc.id}`}
            </span>
            <Badge className="shrink-0" variant="outline">
              {doc.document_type ?? "contract"}
            </Badge>
            {doc.project_name && (
              <span className="truncate text-muted-foreground text-sm">
                {doc.project_name}
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {doc.critical_count > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 font-medium text-red-700 text-xs">
              <XCircle className="h-3 w-3" />
              {doc.critical_count}
            </span>
          )}
          {doc.warning_count > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 font-medium text-amber-700 text-xs">
              <AlertTriangle className="h-3 w-3" />
              {doc.warning_count}
            </span>
          )}
          {doc.info_count > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 font-medium text-blue-700 text-xs">
              <Info className="h-3 w-3" />
              {doc.info_count}
            </span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-border border-t p-4">
          {criticalEntities.length > 0 && (
            <section className="mb-4">
              <h3 className="mb-2 font-semibold text-red-700 text-sm">
                Critical Issues ({criticalEntities.length})
              </h3>
              <div className="flex flex-col gap-2">
                {criticalEntities.map((entity, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: entities have no stable id
                  <EntityCard entity={entity} key={i} />
                ))}
              </div>
            </section>
          )}

          {warningEntities.length > 0 && (
            <section className="mb-4">
              <h3 className="mb-2 font-semibold text-amber-700 text-sm">
                Warnings ({warningEntities.length})
              </h3>
              <div className="flex flex-col gap-2">
                {warningEntities.map((entity, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: entities have no stable id
                  <EntityCard entity={entity} key={i} />
                ))}
              </div>
            </section>
          )}

          {infoEntities.length > 0 && (
            <section>
              <h3 className="mb-2 font-semibold text-blue-700 text-sm">
                Informational ({infoEntities.length})
              </h3>
              <div className="flex flex-col gap-2">
                {infoEntities.map((entity, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: entities have no stable id
                  <EntityCard entity={entity} key={i} />
                ))}
              </div>
            </section>
          )}

          <p className="mt-3 text-muted-foreground text-xs">
            Analyzed by {doc.model ?? "langextract"} · {doc.entity_count}{" "}
            entities total
          </p>
        </div>
      )}
    </div>
  );
}

export function ContractReviewPage() {
  const { data, error, isLoading, isValidating, mutate } =
    useSWR<ReviewApiResponse>("/api/contracts/review", fetcher, {
      revalidateOnFocus: false,
    });

  const isInitialLoading = isLoading && !data;

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        actions={
          <Button onClick={() => mutate()} size="sm" variant="outline">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        }
        breadcrumbs={[
          { label: "Contracts", href: "/contracts" },
          { label: "Review" },
        ]}
        title="Contract Review"
      />

      {error && <PageError message={error.message} />}
      {!error && isInitialLoading && <PageLoading />}

      {data && (
        <div className="flex-1 p-6 lg:p-8">
          <div className="page-transition flex flex-col gap-3">
            <p className="text-muted-foreground text-sm">
              {data.total} contracts analyzed
              {isValidating ? " (updating...)" : ""}. Sorted by critical issues.
            </p>
            {data.items.map((doc) => (
              <ReviewDocRow doc={doc} key={doc.id} />
            ))}
            {data.total === 0 && (
              <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground">
                No contracts have been analyzed yet. Run{" "}
                <code className="text-xs">just langextract-backfill --all</code>{" "}
                to process contract documents.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
