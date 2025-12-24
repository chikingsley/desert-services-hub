import {
  type ColumnDef,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from "@tanstack/react-table";
import { ArrowUpDown, ChevronDown, Download, Eye, Trash2 } from "lucide-react";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";

export type QuoteTableRow = {
  id: string;
  estimate_number: string;
  revision_number: number;
  date: string;
  status: "draft" | "sent" | "accepted" | "declined";
  company_name: string | null;
  job_name: string | null;
  total: number;
};

type QuotesTableProps = {
  data: QuoteTableRow[];
  companies: string[];
  onView: (id: string) => void;
  onDownload: (id: string) => void;
  onDelete: (id: string) => void;
};

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-info text-info-foreground",
  accepted: "bg-success text-success-foreground",
  declined: "bg-destructive text-destructive-foreground",
};

export function QuotesTable({
  data,
  companies,
  onView,
  onDownload,
  onDelete,
}: QuotesTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState({});
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleDeleteClick = (id: string) => {
    setDeleteId(id);
  };

  const handleDeleteConfirm = () => {
    if (deleteId) {
      onDelete(deleteId);
      setDeleteId(null);
    }
  };

  const columns: ColumnDef<QuoteTableRow>[] = [
    {
      accessorKey: "estimate_number",
      header: ({ column }) => (
        <Button
          className="px-0 hover:bg-transparent"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          variant="ghost"
        >
          Estimate #
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <button
          className="font-medium text-primary hover:text-primary/80 hover:underline"
          onClick={() => onView(row.original.id)}
          type="button"
        >
          {row.getValue("estimate_number")}
        </button>
      ),
    },
    {
      accessorKey: "revision_number",
      header: "Rev",
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          R{row.getValue("revision_number")}
        </span>
      ),
    },
    {
      accessorKey: "date",
      header: ({ column }) => (
        <Button
          className="px-0 hover:bg-transparent"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          variant="ghost"
        >
          Date
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const date = new Date(row.getValue("date"));
        return date.toLocaleDateString();
      },
    },
    {
      accessorKey: "company_name",
      header: ({ column }) => (
        <Button
          className="px-0 hover:bg-transparent"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          variant="ghost"
        >
          Company
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => row.getValue("company_name") || "-",
      filterFn: (row, id, value) => {
        if (!value || value === "all") {
          return true;
        }
        return row.getValue(id) === value;
      },
    },
    {
      accessorKey: "job_name",
      header: "Job Name",
      cell: ({ row }) => {
        const name = row.getValue("job_name") as string | null;
        if (!name) {
          return "-";
        }
        return <span title={name}>{name}</span>;
      },
    },
    {
      accessorKey: "total",
      header: ({ column }) => (
        <Button
          className="px-0 hover:bg-transparent"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          variant="ghost"
        >
          Total
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => {
        const amount = Number.parseFloat(row.getValue("total"));
        return new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
        }).format(amount);
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = row.getValue("status") as string;
        return (
          <Badge className={`${statusColors[status]} capitalize`}>
            {status}
          </Badge>
        );
      },
      filterFn: (row, id, value) => {
        if (!value || value === "all") {
          return true;
        }
        return row.getValue(id) === value;
      },
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button
            onClick={() => onView(row.original.id)}
            size="sm"
            title="View"
            variant="ghost"
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            onClick={() => onDownload(row.original.id)}
            size="sm"
            title="Download PDF"
            variant="ghost"
          >
            <Download className="h-4 w-4" />
          </Button>
          <Button
            className="text-destructive hover:text-destructive/80"
            onClick={() => handleDeleteClick(row.original.id)}
            size="sm"
            title="Delete"
            variant="ghost"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  const table = useReactTable({
    data,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
  });

  return (
    <>
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Quote</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this quote? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDeleteConfirm}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="w-full space-y-4">
      {/* Filters Row */}
      <div className="flex flex-wrap items-center gap-4">
        <Input
          className="max-w-sm"
          onChange={(event) =>
            table
              .getColumn("estimate_number")
              ?.setFilterValue(event.target.value)
          }
          placeholder="Search quotes..."
          value={
            (table.getColumn("estimate_number")?.getFilterValue() as string) ??
            ""
          }
        />

        <Select
          onValueChange={(value) =>
            table.getColumn("company_name")?.setFilterValue(value)
          }
          value={
            (table.getColumn("company_name")?.getFilterValue() as string) ??
            "all"
          }
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Companies</SelectItem>
            {companies.map((company) => (
              <SelectItem key={company} value={company}>
                {company}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          onValueChange={(value) =>
            table.getColumn("status")?.setFilterValue(value)
          }
          value={
            (table.getColumn("status")?.getFilterValue() as string) ?? "all"
          }
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="accepted">Accepted</SelectItem>
            <SelectItem value="declined">Declined</SelectItem>
          </SelectContent>
        </Select>

        <DropdownMenu>
          <DropdownMenuTrigger className="ml-auto inline-flex h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-input bg-background px-4 py-2 font-medium text-sm hover:bg-accent hover:text-accent-foreground">
            Columns <ChevronDown className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {table
              .getAllColumns()
              .filter((column) => column.getCanHide())
              .map((column) => (
                <DropdownMenuCheckboxItem
                  checked={column.getIsVisible()}
                  className="capitalize"
                  key={column.id}
                  onCheckedChange={(value) => column.toggleVisibility(!!value)}
                >
                  {column.id}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  data-state={row.getIsSelected() && "selected"}
                  key={row.id}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  className="h-24 text-center text-muted-foreground"
                  colSpan={columns.length}
                >
                  No quotes found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-2">
        <div className="text-muted-foreground text-sm">
          {table.getFilteredRowModel().rows.length} quote(s) total
        </div>
        <div className="flex items-center gap-2">
          <Button
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
            size="sm"
            variant="outline"
          >
            Previous
          </Button>
          <span className="text-muted-foreground text-sm">
            Page {table.getState().pagination.pageIndex + 1} of{" "}
            {table.getPageCount()}
          </span>
          <Button
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
            size="sm"
            variant="outline"
          >
            Next
          </Button>
        </div>
      </div>
      </div>
    </>
  );
}
