/**
 * Contracts triage workspace
 * Route: /contracts
 */
import {
  AlertTriangle,
  Info,
  Loader2,
  RefreshCw,
  Search,
  XCircle,
} from "lucide-react";
import { startTransition, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import useSWR from "swr";
import { PageHeader } from "@/apps/web/frontend/components/page-header";
import {
  PageError,
  PageLoading,
} from "@/apps/web/frontend/components/page-loading";
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
import { fetcher } from "@/apps/web/frontend/lib/fetcher";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { formatCurrency } from "@/lib/utils";

interface ContractFromApi {
  awarded_value: number | null;
  bid_value: number | null;
  contract_status: string | null;
  contractor: string | null;
  dust_permit_status: string | null;
  estimate_number: string | null;
  id: number;
  location: string | null;
  name: string;
  noi_status: string | null;
  project_id: number | null;
  project_name: string | null;
  safety_status: string | null;
}

interface ContractsApiResponse {
  facets: {
    contractStatuses: Array<{ status: string; count: number }>;
  };
  items: ContractFromApi[];
  pagination: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
  summary: {
    totalValue: number;
  };
}

interface ReviewEntity {
  attributes: {
    severity?: "critical" | "warning" | "info";
    recommended_action?: string;
  };
  class: string;
  text: string;
}

interface ReviewDoc {
  critical_count: number;
  entities: ReviewEntity[];
  entity_count: number;
  file_name: string | null;
  id: number;
  info_count: number;
  project_id: number | null;
  warning_count: number;
}

interface ReviewApiResponse {
  items: ReviewDoc[];
  total: number;
}

interface ContractContextEstimate {
  bid_status: string | null;
  contractor: string | null;
  estimate_id: number;
  estimate_name: string;
  estimate_number: string | null;
  is_canonical: boolean;
  monday_item_id: string | null;
  source: string;
  updated_at: string;
}

interface ContractContextDocument {
  document_type: string | null;
  email_id: number | null;
  estimate_id: number | null;
  extraction_status: string | null;
  file_name: string | null;
  id: number;
  project_id: number | null;
  updated_at: string | null;
}

interface ContractContextEmail {
  from_email: string | null;
  id: number;
  linked_estimate_ids: number[];
  linked_to_selected_estimate: boolean;
  project_id: number | null;
  received_at: string | null;
  subject: string | null;
}

interface ContractContextResponse {
  documents: ContractContextDocument[];
  emails: ContractContextEmail[];
  estimate: {
    bid_status: string | null;
    contractor: string | null;
    estimate_number: string | null;
    id: number;
    monday_item_id: string | null;
    name: string;
    updated_at: string;
  };
  project: {
    contract_status: string | null;
    contractor: string | null;
    dust_permit_status: string | null;
    id: number;
    name: string;
    noi_status: string | null;
    safety_status: string | null;
    updated_at: string;
  } | null;
  projectEstimates: ContractContextEstimate[];
  summary: {
    documentCount: number;
    emailCount: number;
    estimateCount: number;
    linkedEmailCount: number;
  };
}

const SORT_OPTIONS = [
  { value: "updated_at.desc", label: "Recently updated" },
  { value: "total.desc", label: "Highest value" },
  { value: "contractor.asc", label: "Contractor A–Z" },
  { value: "name.asc", label: "Project A–Z" },
  { value: "contract_status.asc", label: "Status A–Z" },
] as const;

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

type WorkflowField = "contract" | "dust_permit" | "safety" | "noi";
type ActionTab =
  | "needs_action"
  | "contract"
  | "dust_permit"
  | "safety"
  | "noi"
  | "done";
type NormalizedContractStatus = "n_a" | "pending" | "negotiating" | "done";
type NormalizedDustStatus = "n_a" | "requested" | "submitted" | "done";
type NormalizedSafetyStatus = "n_a" | "requested" | "done";
type NormalizedNoiStatus = "requested" | "done";
type WorkflowSnapshot = {
  contract: NormalizedContractStatus;
  dust_permit: NormalizedDustStatus;
  noi: NormalizedNoiStatus;
  safety: NormalizedSafetyStatus;
};
type StatusUpdatePayload = {
  field: WorkflowField;
  status: string;
};

const ACTION_TAB_OPTIONS: Array<{ label: string; value: ActionTab }> = [
  { value: "needs_action", label: "Needs Action" },
  { value: "contract", label: "Contract" },
  { value: "dust_permit", label: "Dust Permit" },
  { value: "safety", label: "Safety" },
  { value: "noi", label: "NOI" },
  { value: "done", label: "Done" },
];

const WORKFLOW_FIELD_LABELS: Record<WorkflowField, string> = {
  contract: "Contract",
  dust_permit: "Dust Permit",
  safety: "Safety",
  noi: "NOI",
};

const WORKFLOW_FIELDS: WorkflowField[] = [
  "contract",
  "dust_permit",
  "safety",
  "noi",
];

const WORKFLOW_STATUS_OPTIONS: Record<
  WorkflowField,
  Array<{ label: string; value: string }>
> = {
  contract: [
    { value: "n_a", label: "N/A" },
    { value: "pending", label: "Pending" },
    { value: "negotiating", label: "Negotiating" },
    { value: "done", label: "Done" },
  ],
  dust_permit: [
    { value: "n_a", label: "N/A" },
    { value: "requested", label: "Requested" },
    { value: "submitted", label: "Submitted" },
    { value: "done", label: "Done" },
  ],
  safety: [
    { value: "n_a", label: "N/A" },
    { value: "requested", label: "Requested" },
    { value: "done", label: "Done" },
  ],
  noi: [
    { value: "requested", label: "Requested" },
    { value: "done", label: "Done" },
  ],
};

function normalizeContractStatus(
  status: string | null | undefined
): NormalizedContractStatus {
  const normalized = (status ?? "").trim().toLowerCase();
  if (
    normalized === "n/a" ||
    normalized === "na" ||
    normalized === "not needed" ||
    normalized === "no action"
  ) {
    return "n_a";
  }
  if (
    normalized === "done" ||
    normalized === "executed" ||
    normalized === "complete" ||
    normalized === "completed"
  ) {
    return "done";
  }
  if (
    normalized === "negotiating" ||
    normalized === "sent back" ||
    normalized === "awaiting counterparty" ||
    normalized === "triage in progress" ||
    normalized === "ready to send back"
  ) {
    return "negotiating";
  }
  if (
    normalized === "pending" ||
    normalized === "requested" ||
    normalized === "received" ||
    normalized === "need contract"
  ) {
    return "pending";
  }
  return "pending";
}

function normalizeDustStatus(
  status: string | null | undefined
): NormalizedDustStatus {
  const normalized = (status ?? "").trim().toLowerCase();
  if (
    normalized === "n/a" ||
    normalized === "na" ||
    normalized === "not needed" ||
    normalized === "no action"
  ) {
    return "n_a";
  }
  if (
    normalized === "done" ||
    normalized === "active" ||
    normalized === "issued" ||
    normalized === "complete" ||
    normalized === "completed"
  ) {
    return "done";
  }
  if (normalized === "submitted" || normalized === "filed") {
    return "submitted";
  }
  if (normalized === "requested" || normalized === "pending") {
    return "requested";
  }
  return "n_a";
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function formatDisplay(value: string | null | undefined): string {
  return value?.trim() || "—";
}

function normalizeSafetyStatus(
  status: string | null | undefined
): NormalizedSafetyStatus {
  const normalized = (status ?? "").trim().toLowerCase();
  if (
    normalized === "n/a" ||
    normalized === "na" ||
    normalized === "not needed" ||
    normalized === "no action"
  ) {
    return "n_a";
  }
  if (
    normalized === "done" ||
    normalized === "complete" ||
    normalized === "completed" ||
    normalized === "approved"
  ) {
    return "done";
  }
  if (
    normalized === "requested" ||
    normalized === "pending" ||
    normalized === "need safety"
  ) {
    return "requested";
  }
  return "n_a";
}

function normalizeNoiStatus(
  status: string | null | undefined
): NormalizedNoiStatus {
  const normalized = (status ?? "").trim().toLowerCase();
  if (
    normalized === "done" ||
    normalized === "submitted" ||
    normalized === "filed" ||
    normalized === "complete" ||
    normalized === "completed" ||
    normalized === "n/a" ||
    normalized === "na" ||
    normalized === "not needed"
  ) {
    return "done";
  }
  if (normalized === "requested" || normalized === "pending") {
    return "requested";
  }
  return "requested";
}

function getWorkflowSnapshotFromSource(params: {
  contractStatus: string | null | undefined;
  dustStatus: string | null | undefined;
  noiStatus: string | null | undefined;
  safetyStatus: string | null | undefined;
}): WorkflowSnapshot {
  return {
    contract: normalizeContractStatus(params.contractStatus),
    dust_permit: normalizeDustStatus(params.dustStatus),
    safety: normalizeSafetyStatus(params.safetyStatus),
    noi: normalizeNoiStatus(params.noiStatus),
  };
}

function needsActionByField(snapshot: WorkflowSnapshot, field: WorkflowField): boolean {
  if (field === "contract") {
    return snapshot.contract === "pending" || snapshot.contract === "negotiating";
  }
  if (field === "dust_permit") {
    return snapshot.dust_permit === "requested" || snapshot.dust_permit === "submitted";
  }
  if (field === "safety") {
    return snapshot.safety === "requested";
  }
  return snapshot.noi === "requested";
}

function hasNeedsAction(snapshot: WorkflowSnapshot): boolean {
  return WORKFLOW_FIELDS.some((field) => needsActionByField(snapshot, field));
}

function matchesActionTab(snapshot: WorkflowSnapshot, tab: ActionTab): boolean {
  if (tab === "needs_action") {
    return hasNeedsAction(snapshot);
  }
  if (tab === "done") {
    return !hasNeedsAction(snapshot);
  }
  return needsActionByField(snapshot, tab);
}

function getWorkflowStatusLabel(field: WorkflowField, value: string): string {
  return (
    WORKFLOW_STATUS_OPTIONS[field].find((option) => option.value === value)?.label ??
    value
  );
}

function extractRequestIdFromErrorMessage(message: string): string | null {
  const matched = message.match(/"requestId":"([^"]+)"/);
  return matched?.[1] ?? null;
}

function parseSelectedEstimateParam(raw: string | null): number | null {
  if (!raw) {
    return null;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function SeverityIcon({ severity }: { severity?: string }) {
  if (severity === "critical") {
    return <XCircle className="h-3 w-3 shrink-0 text-red-600" />;
  }
  if (severity === "warning") {
    return <AlertTriangle className="h-3 w-3 shrink-0 text-amber-600" />;
  }
  return <Info className="h-3 w-3 shrink-0 text-blue-600" />;
}

function EntityRow({ entity }: { entity: ReviewEntity }) {
  const sev = entity.attributes.severity;
  let colorClass = "border-blue-500/20 bg-blue-500/5";
  if (sev === "critical") {
    colorClass = "border-red-500/20 bg-red-500/5";
  } else if (sev === "warning") {
    colorClass = "border-amber-500/20 bg-amber-500/5";
  }

  return (
    <div className={`rounded-lg border p-2.5 text-xs ${colorClass}`}>
      <div className="mb-1 flex items-center gap-1.5">
        <SeverityIcon severity={sev} />
        <span className="font-medium text-muted-foreground">
          {CLASS_LABELS[entity.class] ?? entity.class}
        </span>
      </div>
      <blockquote className="mb-1 border-border border-l-2 pl-2 text-foreground/70 italic">
        &ldquo;{entity.text}&rdquo;
      </blockquote>
      {entity.attributes.recommended_action && (
        <p className="text-foreground/60">
          {entity.attributes.recommended_action}
        </p>
      )}
    </div>
  );
}

function ContractDetail({
  contract,
  context,
  isContextLoading,
  reviewDocs,
  pendingEmailId,
  pendingStatus,
  actionError,
  statusActionError,
  onLinkEmail,
  onSetWorkflowStatus,
  onUnlinkEmail,
}: {
  actionError: string | null;
  context: ContractContextResponse | undefined;
  contract: ContractFromApi;
  isContextLoading: boolean;
  onLinkEmail: (emailId: number) => Promise<void>;
  onSetWorkflowStatus: (payload: StatusUpdatePayload) => Promise<void>;
  onUnlinkEmail: (emailId: number) => Promise<void>;
  pendingEmailId: number | null;
  pendingStatus: { field: WorkflowField; status: string } | null;
  reviewDocs: ReviewDoc[];
  statusActionError: string | null;
}) {
  const [activeTab, setActiveTab] = useState("overview");
  const [manualEmailId, setManualEmailId] = useState("");

  useEffect(() => {
    setActiveTab("overview");
    setManualEmailId("");
  }, [contract.id]);

  const value = contract.awarded_value ?? contract.bid_value;
  const allEntities = reviewDocs.flatMap((d) => d.entities);
  const critical = allEntities.filter(
    (e) => e.attributes.severity === "critical"
  );
  const warnings = allEntities.filter(
    (e) => e.attributes.severity === "warning"
  );
  const info = allEntities.filter(
    (e) =>
      e.attributes.severity !== "critical" &&
      e.attributes.severity !== "warning"
  );

  const parsedManualEmailId = Number.parseInt(manualEmailId, 10);
  const canAddManualEmail =
    Number.isInteger(parsedManualEmailId) && parsedManualEmailId > 0;
  const workflowSnapshot = getWorkflowSnapshotFromSource({
    contractStatus: context?.project?.contract_status ?? contract.contract_status,
    dustStatus: context?.project?.dust_permit_status ?? contract.dust_permit_status,
    safetyStatus: context?.project?.safety_status ?? contract.safety_status,
    noiStatus: context?.project?.noi_status ?? contract.noi_status,
  });
  const hasProjectLink = !!context?.project;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-border/50 border-b px-5 py-4">
        <div className="font-semibold text-base leading-tight">
          {contract.name}
        </div>
        <div className="mt-0.5 text-muted-foreground text-sm">
          {contract.contractor || "Unknown contractor"}
        </div>
      </div>

      <div className="border-border/40 border-b px-5 py-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <div className="text-muted-foreground text-xs">Estimate</div>
            <div className="font-medium text-sm">
              #{contract.id} • {formatDisplay(contract.estimate_number)}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Project</div>
            <div className="font-medium text-sm">
              {context?.project
                ? `${context.project.id} • ${context.project.name}`
                : "Not linked"}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground text-xs">Value</div>
            <div className="font-medium text-sm">
              {value ? formatCurrency(value) : "—"}
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden p-5">
        <Tabs
          className="h-full min-h-0"
          onValueChange={setActiveTab}
          value={activeTab}
        >
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="estimates">
              Estimates ({context?.summary.estimateCount ?? 0})
            </TabsTrigger>
            <TabsTrigger value="documents">
              Documents ({context?.summary.documentCount ?? 0})
            </TabsTrigger>
            <TabsTrigger value="emails">
              Emails ({context?.summary.emailCount ?? 0})
            </TabsTrigger>
          </TabsList>

          <TabsContent
            className="min-h-0 overflow-y-auto pr-1"
            value="overview"
          >
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="mb-0.5 text-muted-foreground text-xs">
                    Location
                  </div>
                  <div className="font-medium text-sm">
                    {contract.location || "—"}
                  </div>
                </div>
                <div>
                  <div className="mb-0.5 text-muted-foreground text-xs">
                    Monday Estimate Item
                  </div>
                  <div className="font-medium text-sm">
                    {formatDisplay(context?.estimate.monday_item_id)}
                  </div>
                </div>
                <div>
                  <div className="mb-0.5 text-muted-foreground text-xs">
                    Bid Status
                  </div>
                  <div className="font-medium text-sm">
                    {formatDisplay(context?.estimate.bid_status)}
                  </div>
                </div>
                <div>
                  <div className="mb-0.5 text-muted-foreground text-xs">
                    Last Updated
                  </div>
                  <div className="font-medium text-sm">
                    {formatDateTime(context?.estimate.updated_at)}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <div className="mb-2 font-medium text-sm">Project Workflow</div>
                <div className="space-y-2.5">
                  {WORKFLOW_FIELDS.map((field) => {
                    const options = WORKFLOW_STATUS_OPTIONS[field];
                    const currentStatus = workflowSnapshot[field];
                    const currentLabel = getWorkflowStatusLabel(field, currentStatus);
                    return (
                      <div
                        className="rounded-md border border-border/60 bg-background/70 p-2.5"
                        key={field}
                      >
                        <div className="mb-1.5 flex items-center justify-between gap-2">
                          <span className="font-medium text-xs">
                            {WORKFLOW_FIELD_LABELS[field]}
                          </span>
                          <span className="text-muted-foreground text-xs">
                            Current: {currentLabel}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {options.map((option) => {
                            const isCurrent = currentStatus === option.value;
                            const isPending =
                              pendingStatus?.field === field &&
                              pendingStatus?.status === option.value;
                            return (
                              <Button
                                aria-pressed={isCurrent}
                                className="h-7 px-2 text-xs"
                                disabled={!hasProjectLink || pendingStatus !== null}
                                key={option.value}
                                onClick={() =>
                                  onSetWorkflowStatus({
                                    field,
                                    status: option.value,
                                  })
                                }
                                size="sm"
                                variant={isCurrent ? "default" : "outline"}
                              >
                                {isPending ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  option.label
                                )}
                              </Button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {!hasProjectLink && (
                  <p className="mt-2 text-muted-foreground text-xs">
                    Link this estimate to a project before setting workflow status.
                  </p>
                )}
                {statusActionError && (
                  <p className="mt-2 text-red-700 text-xs">{statusActionError}</p>
                )}
              </div>

              {isContextLoading && (
                <p className="text-muted-foreground text-xs">
                  Loading linked estimates, documents, and emails…
                </p>
              )}

              {allEntities.length > 0 && (
                <div className="space-y-3">
                  <div className="font-medium text-sm">Contract Issues</div>
                  {critical.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="font-medium text-red-700 text-xs">
                        Critical ({critical.length})
                      </div>
                      {critical.map((entity, index) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: entities have no stable id
                        <EntityRow entity={entity} key={index} />
                      ))}
                    </div>
                  )}
                  {warnings.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="font-medium text-amber-700 text-xs">
                        Warnings ({warnings.length})
                      </div>
                      {warnings.map((entity, index) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: entities have no stable id
                        <EntityRow entity={entity} key={index} />
                      ))}
                    </div>
                  )}
                  {info.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="font-medium text-blue-700 text-xs">
                        Informational ({info.length})
                      </div>
                      {info.map((entity, index) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: entities have no stable id
                        <EntityRow entity={entity} key={index} />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {allEntities.length === 0 && contract.project_id && (
                <p className="text-muted-foreground text-xs">
                  No contract issues analyzed yet.
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent
            className="min-h-0 overflow-y-auto pr-1"
            value="estimates"
          >
            <div className="space-y-2">
              {context?.projectEstimates.map((estimate) => (
                <div
                  className={`rounded-lg border p-3 ${
                    estimate.estimate_id === contract.id
                      ? "border-primary/40 bg-primary/5"
                      : "border-border"
                  }`}
                  key={estimate.estimate_id}
                >
                  <div className="mb-1 flex items-center gap-2">
                    <span className="font-medium text-sm">
                      {estimate.estimate_name}
                    </span>
                    {estimate.is_canonical && (
                      <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-700 text-xs">
                        Canonical
                      </span>
                    )}
                    {estimate.estimate_id === contract.id && (
                      <span className="rounded bg-primary/15 px-1.5 py-0.5 text-primary text-xs">
                        Selected
                      </span>
                    )}
                  </div>
                  <div className="grid gap-2 text-xs sm:grid-cols-2">
                    <div>
                      #{estimate.estimate_id} •{" "}
                      {formatDisplay(estimate.estimate_number)}
                    </div>
                    <div>Status: {formatDisplay(estimate.bid_status)}</div>
                    <div>Contractor: {formatDisplay(estimate.contractor)}</div>
                    <div>Monday: {formatDisplay(estimate.monday_item_id)}</div>
                    <div>Source: {estimate.source}</div>
                    <div>Updated: {formatDateTime(estimate.updated_at)}</div>
                  </div>
                </div>
              ))}

              {!context?.projectEstimates.length && (
                <p className="text-muted-foreground text-sm">
                  No estimates linked.
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent
            className="min-h-0 overflow-y-auto pr-1"
            value="documents"
          >
            <div className="space-y-2">
              {context?.documents.map((doc) => (
                <div
                  className="rounded-lg border border-border p-3"
                  key={doc.id}
                >
                  <div className="truncate font-medium text-sm">
                    {doc.file_name || `Document ${doc.id}`}
                  </div>
                  <div className="mt-1 grid gap-2 text-muted-foreground text-xs sm:grid-cols-2">
                    <div>
                      Type: {formatDisplay(doc.document_type)} • Status:{" "}
                      {formatDisplay(doc.extraction_status)}
                    </div>
                    <div>Updated: {formatDateTime(doc.updated_at)}</div>
                    <div>
                      Email #{doc.email_id ?? "—"} • Estimate #
                      {doc.estimate_id ?? "—"}
                    </div>
                    <div>Project #{doc.project_id ?? "—"}</div>
                  </div>
                </div>
              ))}

              {!context?.documents.length && (
                <p className="text-muted-foreground text-sm">
                  No documents found for this context.
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent className="min-h-0 overflow-y-auto pr-1" value="emails">
            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-muted/20 p-3">
                <div className="mb-2 font-medium text-sm">
                  Attach Email by ID
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    className="h-8 w-[160px]"
                    onChange={(event) => setManualEmailId(event.target.value)}
                    placeholder="Email ID"
                    value={manualEmailId}
                  />
                  <Button
                    className="h-8"
                    disabled={!canAddManualEmail || pendingEmailId !== null}
                    onClick={() => onLinkEmail(parsedManualEmailId)}
                    size="sm"
                    variant="default"
                  >
                    {pendingEmailId === parsedManualEmailId ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      "Attach"
                    )}
                  </Button>
                  <span className="text-muted-foreground text-xs">
                    Use this when a relevant email is missing from the list.
                  </span>
                </div>
                {actionError && (
                  <p className="mt-2 text-red-700 text-xs">{actionError}</p>
                )}
              </div>

              {context?.emails.map((email) => {
                const isPending = pendingEmailId === email.id;
                const linkButtonLabel = email.linked_to_selected_estimate
                  ? "Unlink"
                  : "Link";
                return (
                  <div
                    className="rounded-lg border border-border p-3"
                    key={email.id}
                  >
                    <div className="mb-1 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium text-sm">
                          {email.subject || "(No subject)"}
                        </div>
                        <div className="truncate text-muted-foreground text-xs">
                          #{email.id} • {formatDisplay(email.from_email)} •{" "}
                          {formatDateTime(email.received_at)}
                        </div>
                      </div>
                      <Button
                        className="h-7 px-2.5 text-xs"
                        disabled={isPending}
                        onClick={() =>
                          email.linked_to_selected_estimate
                            ? onUnlinkEmail(email.id)
                            : onLinkEmail(email.id)
                        }
                        size="sm"
                        variant={
                          email.linked_to_selected_estimate
                            ? "outline"
                            : "default"
                        }
                      >
                        {isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          linkButtonLabel
                        )}
                      </Button>
                    </div>

                    <div className="flex flex-wrap gap-1.5 text-xs">
                      <span
                        className={`rounded px-1.5 py-0.5 ${
                          email.linked_to_selected_estimate
                            ? "bg-emerald-500/10 text-emerald-700"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {email.linked_to_selected_estimate
                          ? `Linked to estimate #${contract.id}`
                          : `Not linked to estimate #${contract.id}`}
                      </span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                        Project #{email.project_id ?? "—"}
                      </span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                        All estimate links:{" "}
                        {email.linked_estimate_ids.length > 0
                          ? email.linked_estimate_ids.join(", ")
                          : "none"}
                      </span>
                    </div>
                  </div>
                );
              })}

              {!context?.emails.length && (
                <p className="text-muted-foreground text-sm">
                  No emails found for this context.
                </p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export function ContractsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const sort = searchParams.get("sort") || "updated_at.desc";
  const tabParam = searchParams.get("tab");
  const selectedParamId = parseSelectedEstimateParam(searchParams.get("selected"));
  const actionTab = ACTION_TAB_OPTIONS.some((tab) => tab.value === tabParam)
    ? (tabParam as ActionTab)
    : "needs_action";
  const [searchInput, setSearchInput] = useState(searchParams.get("q") || "");
  const debouncedSearch = useDebouncedValue(searchInput, 250);
  const [selectedId, setSelectedId] = useState<number | null>(selectedParamId);
  const [pendingEmailId, setPendingEmailId] = useState<number | null>(null);
  const [pendingStatusAction, setPendingStatusAction] = useState<{
    estimateId: number;
    field: WorkflowField;
    status: string;
  } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [statusActionError, setStatusActionError] = useState<string | null>(
    null
  );

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", "1");
    params.set("perPage", "50");
    params.set("includeMeta", "0");
    params.set("sort", sort);
    const q = debouncedSearch.trim();
    if (q) {
      params.set("q", q);
    }
    return params.toString();
  }, [sort, debouncedSearch]);

  const { data, error, isLoading, isValidating, mutate } =
    useSWR<ContractsApiResponse>(`/api/contracts?${query}`, fetcher, {
      dedupingInterval: 10_000,
      errorRetryCount: 2,
      errorRetryInterval: 2000,
      keepPreviousData: true,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    });

  const items = data?.items ?? [];
  const statusCounts = useMemo<Record<ActionTab, number>>(() => {
    const counts: Record<ActionTab, number> = {
      needs_action: 0,
      contract: 0,
      dust_permit: 0,
      safety: 0,
      noi: 0,
      done: 0,
    };

    for (const item of items) {
      const snapshot = getWorkflowSnapshotFromSource({
        contractStatus: item.contract_status,
        dustStatus: item.dust_permit_status,
        safetyStatus: item.safety_status,
        noiStatus: item.noi_status,
      });
      if (hasNeedsAction(snapshot)) {
        counts.needs_action += 1;
      } else {
        counts.done += 1;
      }
      if (needsActionByField(snapshot, "contract")) {
        counts.contract += 1;
      }
      if (needsActionByField(snapshot, "dust_permit")) {
        counts.dust_permit += 1;
      }
      if (needsActionByField(snapshot, "safety")) {
        counts.safety += 1;
      }
      if (needsActionByField(snapshot, "noi")) {
        counts.noi += 1;
      }
    }

    return counts;
  }, [items]);

  const filteredItems = useMemo(
    () => {
      return items.filter((item) => {
        const snapshot = getWorkflowSnapshotFromSource({
          contractStatus: item.contract_status,
          dustStatus: item.dust_permit_status,
          safetyStatus: item.safety_status,
          noiStatus: item.noi_status,
        });
        return matchesActionTab(snapshot, actionTab);
      });
    },
    [actionTab, items]
  );

  const selectedItem = filteredItems.find((item) => item.id === selectedId) ?? null;
  const debouncedSelectedId = useDebouncedValue(selectedItem?.id ?? null, 120);
  const debouncedSelectedItem =
    filteredItems.find((item) => item.id === debouncedSelectedId) ?? null;
  const pendingStatus =
    selectedItem && pendingStatusAction?.estimateId === selectedItem.id
      ? {
          field: pendingStatusAction.field,
          status: pendingStatusAction.status,
        }
      : null;

  const { data: reviewData } = useSWR<ReviewApiResponse>(
    debouncedSelectedItem?.project_id
      ? `/api/contracts/review?projectId=${debouncedSelectedItem.project_id}`
      : null,
    fetcher,
    {
      dedupingInterval: 10_000,
      errorRetryCount: 1,
      errorRetryInterval: 3000,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );

  const {
    data: contextData,
    error: contextError,
    isLoading: isContextLoading,
    isValidating: isContextValidating,
    mutate: mutateContext,
  } = useSWR<ContractContextResponse>(
    debouncedSelectedId ? `/api/contracts/${debouncedSelectedId}/context` : null,
    fetcher,
    {
      dedupingInterval: 8_000,
      keepPreviousData: true,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );

  useEffect(() => {
    if (selectedParamId !== selectedId) {
      setSelectedId(selectedParamId);
    }
  }, [selectedParamId, selectedId]);

  useEffect(() => {
    setPendingEmailId(null);
    setActionError(null);
    setStatusActionError(null);
    setPendingStatusAction((active) => {
      if (!active) {
        return null;
      }
      if (active.estimateId === selectedItem?.id) {
        return active;
      }
      return null;
    });
  }, [selectedItem?.id]);

  useEffect(() => {
    if (!selectedItem) {
      return;
    }
    const row = document.getElementById(`contract-row-${selectedItem.id}`);
    row?.scrollIntoView({ block: "nearest" });
  }, [selectedItem?.id]);

  const reviewDocsForSelected = useMemo(() => {
    if (!reviewData?.items) {
      return [];
    }
    return reviewData.items;
  }, [reviewData]);
  const contextRequestId = contextError
    ? extractRequestIdFromErrorMessage(contextError.message)
    : null;

  const setSort = (value: string) => {
    startTransition(() => {
      const params = new URLSearchParams(searchParams);
      params.set("sort", value);
      setSearchParams(params);
    });
  };

  const setActionTab = (value: ActionTab) => {
    startTransition(() => {
      const params = new URLSearchParams(searchParams);
      if (value === "needs_action") {
        params.delete("tab");
      } else {
        params.set("tab", value);
      }
      setSearchParams(params);
    });
  };

  const setSelectedEstimate = (estimateId: number) => {
    setSelectedId(estimateId);
    startTransition(() => {
      const params = new URLSearchParams(searchParams);
      params.set("selected", String(estimateId));
      setSearchParams(params);
    });
  };

  const mutateSelectedData = async () => {
    await Promise.all([mutateContext(), mutate()]);
  };

  const linkEmailToSelectedEstimate = async (emailId: number) => {
    if (!selectedItem) {
      return;
    }

    setPendingEmailId(emailId);
    setActionError(null);
    try {
      const response = await fetch(
        `/api/contracts/${selectedItem.id}/email-links`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email_id: emailId }),
        }
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error || "Failed to link email");
      }
      await mutateSelectedData();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setPendingEmailId(null);
    }
  };

  const unlinkEmailFromSelectedEstimate = async (emailId: number) => {
    if (!selectedItem) {
      return;
    }

    setPendingEmailId(emailId);
    setActionError(null);
    try {
      const response = await fetch(
        `/api/contracts/${selectedItem.id}/email-links/${emailId}`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error || "Failed to unlink email");
      }
      await mutateSelectedData();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setPendingEmailId(null);
    }
  };

  const setWorkflowStatusForSelected = async ({
    field,
    status,
  }: StatusUpdatePayload) => {
    if (!selectedItem) {
      return;
    }

    const currentWorkflow = getWorkflowSnapshotFromSource({
      contractStatus:
        contextData?.project?.contract_status ?? selectedItem.contract_status,
      dustStatus:
        contextData?.project?.dust_permit_status ??
        selectedItem.dust_permit_status,
      safetyStatus: contextData?.project?.safety_status ?? selectedItem.safety_status,
      noiStatus: contextData?.project?.noi_status ?? selectedItem.noi_status,
    });
    if (currentWorkflow[field] === status) {
      setStatusActionError(null);
      return;
    }

    const estimateId = selectedItem.id;

    setPendingStatusAction({ estimateId, field, status });
    setStatusActionError(null);
    try {
      const response = await fetch(`/api/contracts/${estimateId}/status`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ field, status }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error || "Failed to update project status");
      }
      await mutateSelectedData();
    } catch (error) {
      setStatusActionError(
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      setPendingStatusAction((active) => {
        if (
          active &&
          active.estimateId === estimateId &&
          active.field === field &&
          active.status === status
        ) {
          return null;
        }
        return active;
      });
    }
  };

  const isInitialLoading = isLoading && !data;

  return (
    <div className="flex flex-1 flex-col">
      <PageHeader
        actions={
          <Button
            onClick={() => mutateSelectedData()}
            size="sm"
            variant="outline"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        }
        breadcrumbs={[{ label: "Projects" }]}
        title="Projects"
      />

      {error && <PageError message={error.message} />}
      {!error && isInitialLoading && <PageLoading />}

      {data && (
        <div className="flex flex-1 overflow-hidden px-6 pb-5 pt-1 lg:px-8 lg:pb-6 lg:pt-2">
          <div className="grid h-full min-h-0 w-full gap-4 lg:grid-cols-[380px_minmax(0,1fr)] lg:items-start">
            <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <div className="border-border/50 border-b px-2.5 py-2">
                <div className="flex flex-wrap gap-1">
                  {ACTION_TAB_OPTIONS.map((tab) => {
                    const isActive = actionTab === tab.value;
                    return (
                      <button
                        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors ${
                          isActive
                            ? "border-primary/40 bg-primary/10 text-primary"
                            : "border-border bg-background text-muted-foreground hover:bg-muted/50"
                        }`}
                        key={tab.value}
                        onClick={() => setActionTab(tab.value)}
                        type="button"
                      >
                        <span>{tab.label}</span>
                        <span
                          className={`rounded px-1.5 py-0.5 ${
                            isActive
                              ? "bg-primary/20 text-primary"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {statusCounts[tab.value]}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-2 border-border/50 border-b px-3 py-2.5">
                <div className="relative flex-1">
                  <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="h-8 pl-8 text-sm"
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder="Search…"
                    value={searchInput}
                  />
                </div>
                <Select onValueChange={setSort} value={sort}>
                  <SelectTrigger className="h-8 w-[130px] text-xs" size="sm">
                    <SelectValue placeholder="Sort" />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map((option) => (
                      <SelectItem
                        className="text-xs"
                        key={option.value}
                        value={option.value}
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(isValidating || isContextValidating) && (
                  <span className="text-muted-foreground/60 text-xs">
                    Updating…
                  </span>
                )}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                {filteredItems.map((item) => {
                  const isSelected = selectedItem?.id === item.id;
                  const isLinked = !!item.project_name;
                  const snapshot = getWorkflowSnapshotFromSource({
                    contractStatus: item.contract_status,
                    dustStatus: item.dust_permit_status,
                    safetyStatus: item.safety_status,
                    noiStatus: item.noi_status,
                  });
                  return (
                    <button
                      className={`w-full border-border/40 border-b px-4 py-3 text-left transition-colors hover:bg-muted/40 ${
                        isSelected ? "bg-primary/5" : ""
                      }`}
                      id={`contract-row-${item.id}`}
                      key={item.id}
                      onClick={() => setSelectedEstimate(item.id)}
                      type="button"
                    >
                      <div className="mb-0.5 truncate font-medium text-sm">
                        {item.name}
                      </div>
                      <div className="mb-1.5 truncate text-muted-foreground text-xs">
                        {item.contractor || "Unknown"} •{" "}
                        {item.estimate_number || "No #"}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-xs ${
                            isLinked
                              ? "bg-emerald-500/10 text-emerald-700"
                              : "bg-amber-500/10 text-amber-700"
                          }`}
                        >
                          {isLinked ? item.project_name : "Unlinked"}
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
                        <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                          C: {getWorkflowStatusLabel("contract", snapshot.contract)}
                        </span>
                        <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                          D: {getWorkflowStatusLabel("dust_permit", snapshot.dust_permit)}
                        </span>
                        <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                          S: {getWorkflowStatusLabel("safety", snapshot.safety)}
                        </span>
                        <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                          NOI: {getWorkflowStatusLabel("noi", snapshot.noi)}
                        </span>
                      </div>
                    </button>
                  );
                })}

                {filteredItems.length === 0 && (
                  <div className="p-6 text-center text-muted-foreground text-sm">
                    {debouncedSearch
                      ? "No projects match your search in this tab."
                      : "No projects in this tab."}
                  </div>
                )}
              </div>
            </div>

            <div className="h-full min-h-0 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              {(() => {
                if (!selectedItem) {
                  return (
                    <div className="p-6 text-muted-foreground text-sm">
                      Select a project estimate.
                    </div>
                  );
                }
                if (contextError) {
                  return (
                    <div className="p-6 text-red-700 text-sm">
                      Failed to load project context.
                      {contextRequestId ? (
                        <div className="mt-1 text-red-700/80 text-xs">
                          Reference: {contextRequestId}
                        </div>
                      ) : null}
                    </div>
                  );
                }
                return (
                  <ContractDetail
                    actionError={actionError}
                    context={contextData}
                    contract={selectedItem}
                    isContextLoading={isContextLoading}
                    onLinkEmail={linkEmailToSelectedEstimate}
                    onSetWorkflowStatus={setWorkflowStatusForSelected}
                    onUnlinkEmail={unlinkEmailFromSelectedEstimate}
                    pendingEmailId={pendingEmailId}
                    pendingStatus={pendingStatus}
                    reviewDocs={reviewDocsForSelected}
                    statusActionError={statusActionError}
                  />
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
