import {
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type PaginationState,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  FileText,
  Loader2,
  Monitor,
  MoreVertical,
  Play,
  RefreshCw,
  RotateCcw,
  Rows3,
  XCircle,
} from "lucide-react";
import type React from "react";
import { Fragment, useCallback, useState } from "react";
import { ReviseModal } from "@/components/revise-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { VncModal } from "@/components/vnc-modal";
import {
  cancelPermit,
  closePermit,
  renewPermit,
  revisePermit,
  startPermit,
} from "@/lib/api";
import {
  getAvailableActions,
  getDisplayStatus,
  type Permit,
  type PermitAction,
  type PermitApplication,
  versionTypeConfig,
} from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/utils";
import { columns } from "./columns";
import { DataTablePagination } from "./data-table-pagination";
import { DataTableViewOptions } from "./data-table-view-options";

// Action configuration - icons, labels, and groupings
const ACTION_CONFIG: Record<
  PermitAction,
  { icon: React.ReactNode; label: string }
> = {
  view_vnc: { icon: <Monitor className="h-4 w-4" />, label: "View Session" },
  open_vnc: { icon: <Monitor className="h-4 w-4" />, label: "Draw Map" },
  start: { icon: <Play className="h-4 w-4" />, label: "Start" },
  cancel: { icon: <XCircle className="h-4 w-4" />, label: "Cancel" },
  retry: { icon: <RotateCcw className="h-4 w-4" />, label: "Retry" },
  view_logs: { icon: <FileText className="h-4 w-4" />, label: "Logs" },
  revise: { icon: <FileText className="h-4 w-4" />, label: "Revise" },
  renew: { icon: <RefreshCw className="h-4 w-4" />, label: "Renew" },
  close: { icon: <XCircle className="h-4 w-4" />, label: "Close" },
};

// Action groupings for dropdown ordering
const MONITOR_ACTIONS: PermitAction[] = ["view_vnc", "open_vnc"];
const DESTRUCTIVE_ACTIONS: PermitAction[] = ["cancel", "close"];

type RowHeight = "short" | "medium";

const rowHeightStyles: Record<RowHeight, string> = {
  short: "[&_td]:py-1",
  medium: "[&_td]:py-2.5",
};

interface PermitsDataTableProps {
  data: Permit[];
  onRefresh?: () => void;
  toolbar?: React.ReactNode;
}

export function PermitsDataTable({
  data,
  onRefresh,
  toolbar,
}: PermitsDataTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({
    // Default: hide some columns for compact view
    submitted: false,
    issued: false,
    cost: false,
    invoice: false,
  });
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });
  const [rowHeight, setRowHeight] = useState<RowHeight>("short");

  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [selectedApp, setSelectedApp] = useState<PermitApplication | null>(
    null
  );
  const [vncModalOpen, setVncModalOpen] = useState(false);
  const [reviseModalOpen, setReviseModalOpen] = useState(false);
  const [reviseApp, setReviseApp] = useState<PermitApplication | null>(null);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      pagination,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  const toggleRow = (permitNumber: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(permitNumber)) {
        next.delete(permitNumber);
      } else {
        next.add(permitNumber);
      }
      return next;
    });
  };

  const openVncModal = useCallback((app: PermitApplication) => {
    setSelectedApp(app);
    setVncModalOpen(true);
  }, []);

  const openReviseModal = useCallback((app: PermitApplication) => {
    setReviseApp(app);
    setReviseModalOpen(true);
  }, []);

  const handleReviseSubmit = useCallback(
    async (permitId: string, revisionType: string, notes: string) => {
      await revisePermit(permitId, revisionType, notes);
      // Open VNC modal to show the browser session
      const app = reviseApp;
      if (app) {
        setSelectedApp(app);
        setVncModalOpen(true);
      }
      onRefresh?.();
    },
    [reviseApp, onRefresh]
  );

  const handleAction = useCallback(
    async (app: PermitApplication, action: PermitAction) => {
      switch (action) {
        case "view_vnc":
        case "open_vnc":
          openVncModal(app);
          break;
        case "start":
        case "retry":
          openVncModal(app);
          await startPermit(app.id);
          onRefresh?.();
          break;
        case "cancel":
          await cancelPermit(app.id);
          onRefresh?.();
          break;
        case "revise":
          openReviseModal(app);
          break;
        case "renew":
          openVncModal(app);
          await renewPermit(app.id, app.company);
          onRefresh?.();
          break;
        case "close":
          await closePermit(app.id);
          onRefresh?.();
          break;
        case "view_logs":
          // TODO: View logs
          console.log("View logs:", app.id);
          break;
        default:
          // Exhaustive check - TypeScript will error if a case is missing
          break;
      }
    },
    [onRefresh, openVncModal, openReviseModal]
  );

  // Render combined actions dropdown (includes monitor when available)
  const renderActions = (app: PermitApplication) => {
    const allActions = getAvailableActions(app);
    if (allActions.length === 0) {
      return null;
    }

    // Separate actions into groups
    const monitorActions = allActions.filter((a) =>
      MONITOR_ACTIONS.includes(a)
    );
    const regularActions = allActions.filter(
      (a) => !(MONITOR_ACTIONS.includes(a) || DESTRUCTIVE_ACTIONS.includes(a))
    );
    const destructiveActions = allActions.filter((a) =>
      DESTRUCTIVE_ACTIONS.includes(a)
    );

    return (
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button className="h-8 w-8" size="icon" variant="ghost">
              <MoreVertical className="h-4 w-4" />
              <span className="sr-only">Open actions menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {/* Monitor actions at top */}
            {monitorActions.map((action) => (
              <DropdownMenuItem
                className="gap-2"
                key={action}
                onClick={() => handleAction(app, action)}
              >
                {ACTION_CONFIG[action].icon}
                {ACTION_CONFIG[action].label}
              </DropdownMenuItem>
            ))}
            {monitorActions.length > 0 && regularActions.length > 0 && (
              <DropdownMenuSeparator />
            )}
            {/* Regular actions */}
            {regularActions.map((action) => (
              <DropdownMenuItem
                className="gap-2"
                key={action}
                onClick={() => handleAction(app, action)}
              >
                {ACTION_CONFIG[action].icon}
                {ACTION_CONFIG[action].label}
              </DropdownMenuItem>
            ))}
            {/* Destructive actions at bottom */}
            {destructiveActions.length > 0 &&
              (monitorActions.length > 0 || regularActions.length > 0) && (
                <DropdownMenuSeparator />
              )}
            {destructiveActions.map((action) => (
              <DropdownMenuItem
                className="gap-2 text-red-400 focus:text-red-400"
                key={action}
                onClick={() => handleAction(app, action)}
              >
                {ACTION_CONFIG[action].icon}
                {ACTION_CONFIG[action].label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  const renderStatus = (app: PermitApplication) => {
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
  };

  const renderVersionBadge = (app: PermitApplication) => {
    const config = versionTypeConfig[app.versionType];
    return <span className={`text-xs ${config.color}`}>{config.label}</span>;
  };

  return (
    <>
      {/* Toolbar - inline with search/filter */}
      <div className="mb-4 flex items-center justify-between gap-4">
        {toolbar}
        <div className="flex items-center gap-2">
          {/* Row height toggle */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="gap-1.5" size="sm" variant="outline">
                <Rows3 className="h-4 w-4" />
                <span className="capitalize">{rowHeight}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className={
                  rowHeight === "short" ? "bg-[--color-bg-tertiary]" : ""
                }
                onClick={() => setRowHeight("short")}
              >
                Short
              </DropdownMenuItem>
              <DropdownMenuItem
                className={
                  rowHeight === "medium" ? "bg-[--color-bg-tertiary]" : ""
                }
                onClick={() => setRowHeight("medium")}
              >
                Medium
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DataTableViewOptions table={table} />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-[--color-border] bg-[--color-bg-secondary]">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow className="hover:bg-transparent" key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  // Actions column - right aligned
                  if (header.id === "actions") {
                    return (
                      <TableHead className="w-12 text-right" key={header.id}>
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    );
                  }
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody className={rowHeightStyles[rowHeight]}>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => {
                const permit = row.original;
                const hasHistory = permit.history.length > 0;
                const rowKey = permit.permitNumber || permit.current.id;
                const isExpanded = expandedRows.has(rowKey);

                return (
                  <Fragment key={row.id}>
                    <TableRow>
                      {row.getVisibleCells().map((cell) => {
                        // Handle applicationNumber column with expand chevron
                        if (cell.column.id === "applicationNumber") {
                          const config =
                            versionTypeConfig[permit.current.versionType];
                          return (
                            <TableCell key={cell.id}>
                              <div className="flex items-center gap-2">
                                {hasHistory ? (
                                  <button
                                    className="rounded p-0.5 hover:bg-[--color-bg-tertiary]"
                                    onClick={() => toggleRow(rowKey)}
                                    type="button"
                                  >
                                    {isExpanded ? (
                                      <ChevronDown className="h-4 w-4 text-[--color-text-muted]" />
                                    ) : (
                                      <ChevronRight className="h-4 w-4 text-[--color-text-muted]" />
                                    )}
                                  </button>
                                ) : (
                                  <div className="w-5" />
                                )}
                                <div className="flex flex-col">
                                  <span className="font-mono text-[--color-text-primary]">
                                    {permit.current.applicationNumber}
                                  </span>
                                  <span className={`text-xs ${config.color}`}>
                                    {config.label}
                                  </span>
                                </div>
                              </div>
                            </TableCell>
                          );
                        }
                        // Handle actions column
                        if (cell.column.id === "actions") {
                          return (
                            <TableCell key={cell.id}>
                              {renderActions(permit.current)}
                            </TableCell>
                          );
                        }
                        // Regular cells
                        return (
                          <TableCell key={cell.id}>
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext()
                            )}
                          </TableCell>
                        );
                      })}
                    </TableRow>

                    {/* History rows (expanded) */}
                    {isExpanded &&
                      permit.history.map((historyApp) => (
                        <TableRow
                          className="bg-[--color-bg-primary]/50"
                          key={historyApp.id}
                        >
                          {row.getVisibleCells().map((cell) => {
                            if (cell.column.id === "applicationNumber") {
                              return (
                                <TableCell key={`${historyApp.id}-app`}>
                                  <div className="flex items-center gap-2">
                                    {/* Spacer for expand chevron alignment */}
                                    <div className="w-5" />
                                    <div className="flex flex-col border-[--color-border] border-l-2 pl-3">
                                      <span className="font-mono text-[--color-text-muted]">
                                        {historyApp.applicationNumber}
                                      </span>
                                      {renderVersionBadge(historyApp)}
                                    </div>
                                  </div>
                                </TableCell>
                              );
                            }
                            if (cell.column.id === "project") {
                              return (
                                <TableCell key={`${historyApp.id}-project`} />
                              );
                            }
                            if (cell.column.id === "company") {
                              return (
                                <TableCell key={`${historyApp.id}-company`} />
                              );
                            }
                            if (cell.column.id === "location") {
                              return (
                                <TableCell key={`${historyApp.id}-location`} />
                              );
                            }
                            if (cell.column.id === "submitted") {
                              return (
                                <TableCell key={`${historyApp.id}-submitted`}>
                                  <span className="font-mono text-[--color-text-muted] text-xs">
                                    {formatDate(historyApp.submittedAt)}
                                  </span>
                                </TableCell>
                              );
                            }
                            if (cell.column.id === "issued") {
                              return (
                                <TableCell key={`${historyApp.id}-issued`}>
                                  <span className="font-mono text-[--color-text-muted] text-xs">
                                    {formatDate(historyApp.effectiveAt)}
                                  </span>
                                </TableCell>
                              );
                            }
                            if (cell.column.id === "expires") {
                              return (
                                <TableCell key={`${historyApp.id}-expires`}>
                                  <span className="font-mono text-[--color-text-muted] text-xs">
                                    {formatDate(historyApp.expiresAt)}
                                  </span>
                                </TableCell>
                              );
                            }
                            if (cell.column.id === "status") {
                              return (
                                <TableCell key={`${historyApp.id}-status`}>
                                  {renderStatus(historyApp)}
                                </TableCell>
                              );
                            }
                            if (cell.column.id === "cost") {
                              return (
                                <TableCell key={`${historyApp.id}-cost`}>
                                  <span className="font-mono text-[--color-text-muted] text-xs">
                                    {formatCurrency(historyApp.cost)}
                                  </span>
                                </TableCell>
                              );
                            }
                            if (cell.column.id === "invoice") {
                              return (
                                <TableCell key={`${historyApp.id}-invoice`}>
                                  {historyApp.invoiceNumber ? (
                                    <span className="font-mono text-[--color-text-muted] text-xs">
                                      {historyApp.invoiceNumber}
                                    </span>
                                  ) : (
                                    <span className="text-[--color-text-muted] text-xs">
                                      —
                                    </span>
                                  )}
                                </TableCell>
                              );
                            }
                            if (cell.column.id === "actions") {
                              return (
                                <TableCell key={`${historyApp.id}-actions`}>
                                  {renderActions(historyApp)}
                                </TableCell>
                              );
                            }
                            return (
                              <TableCell
                                key={`${historyApp.id}-${cell.column.id}`}
                              />
                            );
                          })}
                        </TableRow>
                      ))}
                  </Fragment>
                );
              })
            ) : (
              <TableRow>
                <TableCell
                  className="h-32 text-center"
                  colSpan={table.getVisibleLeafColumns().length}
                >
                  <div className="flex flex-col items-center gap-2 text-[--color-text-muted]">
                    <FileText className="h-8 w-8 opacity-50" />
                    <span>No permits found</span>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <DataTablePagination table={table} />

      {/* VNC Modal */}
      <VncModal
        onOpenChange={setVncModalOpen}
        open={vncModalOpen}
        permit={selectedApp}
      />

      {/* Revise Modal */}
      <ReviseModal
        onOpenChange={setReviseModalOpen}
        onSubmit={handleReviseSubmit}
        open={reviseModalOpen}
        permit={reviseApp}
      />
    </>
  );
}
