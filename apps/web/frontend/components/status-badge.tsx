/**
 * Reusable status badge for contract, permit, and compliance statuses.
 */
import { Badge } from "@/apps/web/frontend/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_COLORS: Record<string, string> = {
  // Contract statuses
  Pending:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  Received: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
  "Sent Back":
    "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  Executed:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  Requested:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  "Triage In Progress":
    "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
  "Ready To Send Back":
    "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  "Awaiting Counterparty":
    "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300",
  "On Hold": "bg-zinc-100 text-zinc-700 dark:bg-zinc-800/40 dark:text-zinc-300",

  // Permit statuses
  Active:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  Closed: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800/40 dark:text-zinc-400",
  Superseded:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  Rejected: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  Submitted: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  "Pending Payment":
    "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",

  // Dust permit project statuses
  Issued:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  Filed: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  "Pending Award":
    "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
  "Not Needed":
    "bg-zinc-50 text-zinc-400 dark:bg-zinc-800/20 dark:text-zinc-500",

  // Bid statuses
  Won: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  "Bid Sent": "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
  Lost: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  New: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
};

interface StatusBadgeProps {
  className?: string;
  status: string | null | undefined;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const label = status || "Unknown";
  const colorClass = STATUS_COLORS[label] || "bg-muted text-muted-foreground";

  return (
    <Badge
      className={cn(colorClass, "font-medium", className)}
      variant="outline"
    >
      {label}
    </Badge>
  );
}
