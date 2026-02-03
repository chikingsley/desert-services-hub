import type { ColumnDef } from "@tanstack/react-table";
import {
  ArrowUpDown,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  ExternalLink,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type Project = {
  id: number;
  name: string;
  status: string;
  contractor: string | null;
  awarded_value: number | null;
  estimate_count: number;
  monday_url: string | null;
  // Tracking fields
  tracking_id: number | null;
  has_contract: number;
  contract_signed: number;
  needs_dust_permit: number;
  dust_permit_filed: number;
  needs_noi: number;
  noi_filed: number;
  needs_swppp: number;
  swppp_plan_received: number;
  needs_grading_drainage: number;
  grading_drainage_received: number;
  certified_payroll_required: number;
  insurance_verified: number;
};

function formatCurrency(value: number | null): string {
  if (value === null || value === undefined) {
    return "-";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export const statuses = [
  { value: "active", label: "Active", icon: CheckCircle2 },
  { value: "open", label: "Open", icon: Circle },
  { value: "lost", label: "Lost", icon: XCircle },
];

function statusLabel(status: string) {
  return statuses.find((s) => s.value === status)?.label ?? "Open";
}

function statusClass(status: string) {
  switch (status) {
    case "active":
      return "border-emerald-200 bg-emerald-100 text-emerald-900";
    case "lost":
      return "border-red-200 bg-red-100 text-red-900";
    default:
      return "border-amber-200 bg-amber-100 text-amber-900";
  }
}

// Checklist item pill component
type PillState = "done" | "pending" | "none";

function ChecklistPill({
  label,
  state,
}: {
  label: string;
  state: PillState;
}) {
  if (state === "none") return null;

  const classes =
    state === "done"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-amber-200 bg-amber-50 text-amber-700";

  const icon = state === "done" ? "✓" : "○";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
        classes
      )}
    >
      <span className="text-[10px]">{icon}</span>
      {label}
    </span>
  );
}

// Get checklist items for a project row
function getChecklistItems(row: Project) {
  const items: { label: string; state: PillState }[] = [];

  // Contract - always show for active projects
  if (row.status === "active") {
    if (row.contract_signed) {
      items.push({ label: "Contract", state: "done" });
    } else if (row.has_contract) {
      items.push({ label: "Contract", state: "pending" });
    } else {
      items.push({ label: "Contract", state: "pending" });
    }
  }

  // Dust Permit - only if needed
  if (row.needs_dust_permit) {
    items.push({
      label: "Dust",
      state: row.dust_permit_filed ? "done" : "pending",
    });
  }

  // NOI - only if needed
  if (row.needs_noi) {
    items.push({
      label: "NOI",
      state: row.noi_filed ? "done" : "pending",
    });
  }

  // SWPPP - only if needed
  if (row.needs_swppp) {
    items.push({
      label: "SWPPP",
      state: row.swppp_plan_received ? "done" : "pending",
    });
  }

  // Certified Payroll - only if required
  if (row.certified_payroll_required) {
    items.push({ label: "Cert Pay", state: "pending" });
  }

  // Insurance - only show if verified
  if (row.insurance_verified) {
    items.push({ label: "Insurance", state: "done" });
  }

  return items;
}

// Filter options for checklist items
export const checklistFilters = [
  { value: "missing_contract", label: "Missing Contract" },
  { value: "needs_dust", label: "Needs Dust Permit" },
  { value: "needs_noi", label: "Needs NOI" },
  { value: "needs_swppp", label: "Needs SWPPP" },
  { value: "certified_payroll", label: "Certified Payroll" },
  { value: "unverified_insurance", label: "Unverified Insurance" },
];

export const columns: ColumnDef<Project>[] = [
  // Expand/collapse column
  {
    id: "expand",
    header: () => null,
    cell: ({ row }) => {
      if (!row.getCanExpand()) {
        return null;
      }
      return (
        <Button
          className="h-6 w-6 p-0"
          onClick={(e) => {
            e.stopPropagation();
            row.toggleExpanded();
          }}
          variant="ghost"
        >
          {row.getIsExpanded() ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </Button>
      );
    },
    size: 40,
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <Button
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        variant="ghost"
      >
        Status
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => {
      const status = row.getValue("status") as string;
      return (
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2 py-0.5 font-medium text-xs",
            statusClass(status)
          )}
        >
          {statusLabel(status)}
        </span>
      );
    },
    filterFn: (row, id, value: string[]) => {
      return value.includes(row.getValue(id));
    },
  },
  {
    accessorKey: "name",
    header: ({ column }) => (
      <Button
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        variant="ghost"
      >
        Project
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => {
      const name = row.getValue("name") as string;
      const url = row.original.monday_url;
      return (
        <div className="flex items-center gap-2">
          <span className="font-medium" title={name}>
            {name}
          </span>
          {url && (
            <a
              className="flex-shrink-0 text-muted-foreground hover:text-foreground"
              href={url}
              onClick={(e) => e.stopPropagation()}
              rel="noopener noreferrer"
              target="_blank"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      );
    },
  },
  {
    accessorKey: "contractor",
    header: ({ column }) => (
      <Button
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        variant="ghost"
      >
        Contractor
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => {
      const contractor = row.getValue("contractor") as string | null;
      return (
        <span title={contractor ?? ""}>
          {contractor ?? <span className="text-muted-foreground">-</span>}
        </span>
      );
    },
  },
  {
    accessorKey: "awarded_value",
    header: ({ column }) => (
      <Button
        onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        variant="ghost"
      >
        Value
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => {
      const value = row.getValue("awarded_value") as number | null;
      return (
        <div className="text-right tabular-nums">{formatCurrency(value)}</div>
      );
    },
  },
  // Checklist pills column
  {
    id: "checklist",
    header: "Checklist",
    cell: ({ row }) => {
      const items = getChecklistItems(row.original);
      if (items.length === 0) {
        return <span className="text-muted-foreground text-xs">-</span>;
      }
      return (
        <div className="flex flex-wrap gap-1">
          {items.map((item) => (
            <ChecklistPill
              key={item.label}
              label={item.label}
              state={item.state}
            />
          ))}
        </div>
      );
    },
    // Custom filter function for checklist items
    filterFn: (row, _id, value: string[]) => {
      if (!value || value.length === 0) return true;

      const data = row.original;

      for (const filter of value) {
        switch (filter) {
          case "missing_contract":
            if (data.status === "active" && !data.contract_signed) return true;
            break;
          case "needs_dust":
            if (data.needs_dust_permit && !data.dust_permit_filed) return true;
            break;
          case "needs_noi":
            if (data.needs_noi && !data.noi_filed) return true;
            break;
          case "needs_swppp":
            if (data.needs_swppp && !data.swppp_plan_received) return true;
            break;
          case "certified_payroll":
            if (data.certified_payroll_required) return true;
            break;
          case "unverified_insurance":
            if (data.status === "active" && !data.insurance_verified)
              return true;
            break;
        }
      }
      return false;
    },
  },
];
