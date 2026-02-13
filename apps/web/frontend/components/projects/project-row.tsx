import { AlertTriangle } from "lucide-react";
import { StatusBadge } from "@/apps/web/frontend/components/status-badge";
import { Badge } from "@/apps/web/frontend/components/ui/badge";
import { TableCell, TableRow } from "@/apps/web/frontend/components/ui/table";

export interface ProjectRowData {
  id: number;
  name: string;
  contractor: string | null;
  address: string | null;
  location_city: string | null;
  contract_status: string;
  dust_permit_status: string;
  noi_status: string;
  swppp_status: string;
  signs_status: string;
  document_count: number;
  email_count: number;
  account_name: string | null;
  contract_packet_status: string | null;
  contract_packet_type: string | null;
  contract_packet_owner: string | null;
  contract_packet_next_action: string | null;
  contract_packet_received_at: string | null;
  contract_packet_sent_back_at: string | null;
  contract_packet_executed_at: string | null;
  contract_packet_minutes_since_received: number | null;
  contract_packet_is_sla_breached: boolean;
  contract_packet_document_count: number;
}

interface ActionPill {
  key: string;
  label: string;
  className: string;
}

interface IntakeLane {
  key: "work_auth_direct" | "work_auth_waiting_contract" | "contract_packet";
  label: string;
  className: string;
}

const ACTION_BADGE_LIMIT = 3;

export function packetLabel(value: string | null): string {
  if (!value) {
    return "Unknown";
  }
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatSla(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes)) {
    return "";
  }
  if (minutes < 120) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function normalizeStatus(value: string | null): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, "_");
}

function contractWorkflowStatus(project: ProjectRowData): string {
  if (project.contract_packet_status) {
    return packetLabel(project.contract_packet_status);
  }
  return project.contract_status || "Pending";
}

function intakeLaneForProject(project: ProjectRowData): IntakeLane {
  const packetStatus = normalizeStatus(project.contract_packet_status);

  if (packetStatus === "requested") {
    return {
      key: "work_auth_waiting_contract",
      label: "Work Auth (Awaiting Contract)",
      className:
        "border-amber-500/25 bg-amber-500/10 text-amber-700 whitespace-nowrap",
    };
  }

  if (packetStatus) {
    return {
      key: "contract_packet",
      label: "Contract Packet",
      className:
        "border-sky-500/25 bg-sky-500/10 text-sky-700 whitespace-nowrap",
    };
  }

  return {
    key: "work_auth_direct",
    label: "Work Auth (Direct)",
    className:
      "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 whitespace-nowrap",
  };
}

function primaryOperationalAction(
  project: ProjectRowData,
  lane: IntakeLane
): string | null {
  const packetStatus = normalizeStatus(project.contract_packet_status);
  const nextAction = project.contract_packet_next_action?.trim() || "";

  if (lane.key === "work_auth_direct") {
    return "Add job to QuickBooks and capture payment details";
  }

  if (lane.key === "work_auth_waiting_contract") {
    return "Capture work auth and request final contract packet";
  }

  if (
    packetStatus === "sent_back" ||
    packetStatus === "awaiting_counterparty"
  ) {
    return "Follow up for counterparty signature";
  }

  if (packetStatus === "executed") {
    return "Archive executed packet and close admin tasks";
  }

  if (
    nextAction &&
    nextAction !== "Request contract packet from counterparty"
  ) {
    return nextAction;
  }

  return "Review packet and classify required docs";
}

function pushUniqueAction(
  pills: ActionPill[],
  seen: Set<string>,
  key: string,
  label: string,
  className: string
): void {
  const normalizedLabel = label.trim();
  if (!normalizedLabel || seen.has(normalizedLabel)) {
    return;
  }
  seen.add(normalizedLabel);
  pills.push({ key, label: normalizedLabel, className });
}

function buildOperationalActionPills(project: ProjectRowData): ActionPill[] {
  const lane = intakeLaneForProject(project);
  const pills: ActionPill[] = [];
  const seen = new Set<string>();

  const primary = primaryOperationalAction(project, lane);
  if (primary) {
    pushUniqueAction(
      pills,
      seen,
      "primary",
      primary,
      project.contract_packet_is_sla_breached
        ? "border-destructive/30 bg-destructive/10 text-destructive whitespace-nowrap"
        : "border-primary/25 bg-primary/10 text-primary whitespace-nowrap"
    );
  }

  const dustStatus = normalizeStatus(project.dust_permit_status);
  if (dustStatus === "issued") {
    pushUniqueAction(
      pills,
      seen,
      "dust-issued",
      "Send dust permit issued notifications",
      "border-amber-500/25 bg-amber-500/10 text-amber-700 whitespace-nowrap"
    );
  } else if (
    dustStatus === "requested" ||
    dustStatus === "pending" ||
    dustStatus === "filed"
  ) {
    pushUniqueAction(
      pills,
      seen,
      "dust-file",
      "File dust permit and confirm submission",
      "border-amber-500/25 bg-amber-500/10 text-amber-700 whitespace-nowrap"
    );
  }

  const noiStatus = normalizeStatus(project.noi_status);
  if (noiStatus === "requested" || noiStatus === "pending") {
    pushUniqueAction(
      pills,
      seen,
      "noi",
      "File NOI",
      "border-cyan-500/25 bg-cyan-500/10 text-cyan-700 whitespace-nowrap"
    );
  }

  const swpppStatus = normalizeStatus(project.swppp_status);
  if (swpppStatus === "requested" || swpppStatus === "pending") {
    pushUniqueAction(
      pills,
      seen,
      "swppp",
      "Finish SWPPP narrative",
      "border-fuchsia-500/25 bg-fuchsia-500/10 text-fuchsia-700 whitespace-nowrap"
    );
  }

  const signsStatus = normalizeStatus(project.signs_status);
  if (signsStatus === "requested" || signsStatus === "pending") {
    pushUniqueAction(
      pills,
      seen,
      "signs-order",
      "Order signs",
      "border-violet-500/25 bg-violet-500/10 text-violet-700 whitespace-nowrap"
    );
  } else if (signsStatus === "ordered") {
    pushUniqueAction(
      pills,
      seen,
      "signs-track",
      "Track sign delivery",
      "border-violet-500/25 bg-violet-500/10 text-violet-700 whitespace-nowrap"
    );
  }

  return pills;
}

export function ProjectRow({ project }: { project: ProjectRowData }) {
  const lane = intakeLaneForProject(project);
  const contractStatus = contractWorkflowStatus(project);
  const slaLabel = formatSla(project.contract_packet_minutes_since_received);
  const contractorLabel = project.contractor || project.account_name || "-";
  const actionPills = buildOperationalActionPills(project);
  const visiblePills = actionPills.slice(0, ACTION_BADGE_LIMIT);
  const overflowCount = Math.max(0, actionPills.length - ACTION_BADGE_LIMIT);

  return (
    <TableRow className="transition-colors hover:bg-primary/5" key={project.id}>
      <TableCell className="min-w-[320px]">
        <div className="truncate font-medium text-base">{project.name}</div>
        <div className="truncate text-muted-foreground text-xs">
          {contractorLabel}
        </div>
      </TableCell>
      <TableCell className="min-w-[260px]">
        <div className="flex items-center gap-2">
          <StatusBadge status={contractStatus} />
          <Badge className={lane.className} variant="outline">
            {lane.label}
          </Badge>
          {project.contract_packet_is_sla_breached ? (
            <span className="inline-flex items-center gap-1 rounded bg-destructive px-1.5 py-0.5 font-semibold text-[10px] text-destructive-foreground uppercase tracking-wide">
              <AlertTriangle className="h-3 w-3" />
              SLA {slaLabel || "Late"}
            </span>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="min-w-[420px]">
        {visiblePills.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {visiblePills.map((pill) => (
              <Badge
                className={pill.className}
                key={pill.key}
                title={pill.label}
                variant="outline"
              >
                {pill.label}
              </Badge>
            ))}
            {overflowCount > 0 ? (
              <Badge
                className="border-muted-foreground/20 bg-muted text-muted-foreground whitespace-nowrap"
                variant="outline"
              >
                +{overflowCount} more
              </Badge>
            ) : null}
          </div>
        ) : (
          <span className="text-muted-foreground text-xs">No queued ops</span>
        )}
      </TableCell>
      <TableCell className="w-[56px] px-2 text-center text-muted-foreground text-xs tabular-nums">
        {project.document_count || 0}
      </TableCell>
      <TableCell className="w-[56px] px-2 text-center text-muted-foreground text-xs tabular-nums">
        {project.email_count || 0}
      </TableCell>
    </TableRow>
  );
}
