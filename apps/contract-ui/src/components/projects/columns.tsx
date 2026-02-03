import type { ColumnDef } from "@tanstack/react-table";
import {
  ArrowUpDown,
  CheckCircle2,
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

export const columns: ColumnDef<Project>[] = [
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
];
