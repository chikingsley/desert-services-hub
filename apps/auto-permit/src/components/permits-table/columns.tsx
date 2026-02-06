import type { ColumnDef } from "@tanstack/react-table";
import { AlertCircle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getDisplayStatus, type Permit } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { DataTableColumnHeader } from "./data-table-column-header";

export const columns: ColumnDef<Permit>[] = [
  {
    id: "applicationNumber",
    accessorFn: (row) => row.current.applicationNumber,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Application #" />
    ),
    cell: () => null, // Handled in data-table.tsx to include expand chevron
    size: 150,
    minSize: 120,
    enableHiding: false,
  },
  {
    id: "project",
    accessorKey: "projectName",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Project" />
    ),
    cell: ({ row }) => {
      const permit = row.original;
      return (
        <span
          className="block truncate font-medium text-[--color-text-primary]"
          title={permit.projectName}
        >
          {permit.projectName || "—"}
        </span>
      );
    },
    size: 180,
    minSize: 100,
    enableHiding: false,
  },
  {
    id: "company",
    accessorKey: "company",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Company" />
    ),
    cell: ({ row }) => {
      const permit = row.original;
      return (
        <span
          className="block truncate text-[--color-text-secondary] text-sm"
          title={permit.company}
        >
          {permit.company || "—"}
        </span>
      );
    },
    size: 150,
    minSize: 80,
  },
  {
    id: "location",
    accessorKey: "address",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Location" />
    ),
    cell: ({ row }) => {
      const permit = row.original;
      return (
        <span
          className="block truncate text-[--color-text-secondary] text-sm"
          title={permit.address}
        >
          {permit.address || "—"}
        </span>
      );
    },
    size: 180,
    minSize: 100,
  },
  {
    id: "submitted",
    accessorFn: (row) => row.current.submittedAt,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Submitted" />
    ),
    cell: ({ row }) => {
      const permit = row.original;
      return (
        <span className="font-mono text-[--color-text-secondary] text-xs">
          {formatDate(permit.current.submittedAt)}
        </span>
      );
    },
    size: 90,
    minSize: 80,
  },
  {
    id: "issued",
    accessorFn: (row) => row.current.effectiveAt,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Issued" />
    ),
    cell: ({ row }) => {
      const permit = row.original;
      return (
        <span className="font-mono text-[--color-text-secondary] text-xs">
          {formatDate(permit.current.effectiveAt)}
        </span>
      );
    },
    size: 90,
    minSize: 80,
  },
  {
    id: "expires",
    accessorFn: (row) => row.current.expiresAt,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Expires" />
    ),
    cell: ({ row }) => {
      const expiresAt = row.original.current.expiresAt;
      if (!expiresAt) {
        return <span className="text-[--color-text-muted] text-xs">—</span>;
      }

      const MS_PER_DAY = 1000 * 60 * 60 * 24;
      const EXPIRY_WARNING_DAYS = 30;

      const expiresDate = new Date(expiresAt);
      const daysUntilExpiry = Math.ceil(
        (expiresDate.getTime() - Date.now()) / MS_PER_DAY
      );
      const isExpired = daysUntilExpiry <= 0;
      const isExpiringSoon =
        !isExpired && daysUntilExpiry <= EXPIRY_WARNING_DAYS;

      let colorClass = "text-[--color-text-secondary]";
      if (isExpired) {
        colorClass = "text-red-400";
      } else if (isExpiringSoon) {
        colorClass = "text-orange-400";
      }

      return (
        <span className={`font-mono text-xs ${colorClass}`}>
          {formatDate(expiresAt)}
          {isExpiringSoon && <span className="ml-1 text-orange-400">(!)</span>}
        </span>
      );
    },
    size: 100,
    minSize: 80,
  },
  {
    id: "status",
    accessorFn: (row) => row.current.permitStatus,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => {
      const permit = row.original;
      const app = permit.current;
      const status = getDisplayStatus(app);
      return (
        <div className="flex items-center gap-2">
          <Badge variant={status.variant}>
            {app.requestStatus === "running" && (
              <Loader2 className="h-3 w-3 animate-spin" />
            )}
            {app.requestStatus === "needs_map" && (
              <AlertCircle className="h-3 w-3" />
            )}
            {status.label}
          </Badge>
        </div>
      );
    },
    size: 120,
    minSize: 100,
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    },
  },
  {
    id: "cost",
    accessorFn: (row) => row.current.cost,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Cost" />
    ),
    cell: ({ row }) => {
      const permit = row.original;
      const cost = permit.current.cost;
      if (cost === undefined || cost === null) {
        return <span className="text-[--color-text-muted] text-xs">—</span>;
      }
      return (
        <span className="font-mono text-[--color-text-secondary] text-xs">
          ${cost.toLocaleString("en-US", { minimumFractionDigits: 2 })}
        </span>
      );
    },
    size: 90,
    minSize: 70,
  },
  {
    id: "invoice",
    accessorFn: (row) => row.current.invoiceNumber,
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Invoice" />
    ),
    cell: ({ row }) => {
      const permit = row.original;
      const invoice = permit.current.invoiceNumber;
      if (!invoice) {
        return <span className="text-[--color-text-muted] text-xs">—</span>;
      }
      return (
        <span className="font-mono text-[--color-text-secondary] text-xs">
          {invoice}
        </span>
      );
    },
    size: 100,
    minSize: 80,
  },
  {
    id: "actions",
    header: () => <span className="sr-only">Actions</span>,
    cell: () => null, // Handled separately for actions
    size: 50,
    minSize: 50,
    enableSorting: false,
    enableHiding: false,
    enableResizing: false,
  },
];
