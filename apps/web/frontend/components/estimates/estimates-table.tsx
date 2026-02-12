import {
  Copy,
  FileText,
  Loader2,
  MoreHorizontal,
  Send,
  Trash2,
} from "lucide-react";
import { memo, useCallback, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/apps/web/frontend/components/ui/alert-dialog";
import { Badge } from "@/apps/web/frontend/components/ui/badge";
import { Button } from "@/apps/web/frontend/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/apps/web/frontend/components/ui/dropdown-menu";
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/apps/web/frontend/components/ui/table";
import { VirtualizedTable } from "@/apps/web/frontend/components/ui/virtualized-table";
import { formatCurrency, formatDate, getStatusColor } from "@/lib/utils";

interface EstimateVersionSummary {
  id: string;
  version_number: number;
  total: number;
  is_current: number;
  created_at: string;
}

export interface EstimateRowView {
  id: string;
  base_number: string;
  job_name: string;
  client_name: string | null;
  job_address: string | null;
  status: string;
  created_at: string;
  current_version: EstimateVersionSummary | null;
  takeoff_id: string | null;
}

interface EstimatesTableProps {
  estimates: EstimateRowView[];
}

function FadedText({ text }: { text: string }) {
  return (
    <div className="relative max-w-full overflow-hidden whitespace-nowrap">
      <span className="block truncate pr-8">{text}</span>
      <span className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-card to-transparent" />
    </div>
  );
}

const EstimateDataRow = memo(function EstimateDataRow({
  estimate,
  duplicating,
  onDuplicate,
  onDelete,
}: {
  estimate: EstimateRowView;
  duplicating: boolean;
  onDuplicate: (estimate: EstimateRowView) => void;
  onDelete: (estimate: EstimateRowView) => void;
}) {
  return (
    <TableRow
      className="group transition-colors hover:bg-primary/5"
      key={estimate.id}
    >
      <TableCell className="font-medium font-mono text-primary">
        <Link
          className="transition-colors hover:text-primary/80 hover:underline"
          to={`/estimates/${estimate.id}`}
        >
          {estimate.base_number}
        </Link>
      </TableCell>
      <TableCell>
        <Link
          className="font-medium transition-colors hover:text-primary hover:underline"
          to={`/estimates/${estimate.id}`}
        >
          <FadedText text={estimate.job_name} />
        </Link>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {estimate.client_name ? (
          <FadedText text={estimate.client_name} />
        ) : (
          <span className="text-muted-foreground/50 italic">No client</span>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {estimate.job_address ? (
          <FadedText text={estimate.job_address.replaceAll("\n", ", ")} />
        ) : (
          <span className="text-muted-foreground/50">-</span>
        )}
      </TableCell>
      <TableCell className="text-right font-mono font-semibold">
        {estimate.current_version
          ? formatCurrency(estimate.current_version.total)
          : "-"}
      </TableCell>
      <TableCell>
        <Badge
          className={`${getStatusColor(estimate.status)} font-medium`}
          variant="outline"
        >
          {estimate.status}
        </Badge>
      </TableCell>
      <TableCell>
        {estimate.takeoff_id ? (
          <Link
            className="inline-flex items-center gap-1.5 text-primary text-sm transition-colors hover:text-primary/80 hover:underline"
            to={`/takeoffs/${estimate.takeoff_id}`}
          >
            <FileText className="h-3.5 w-3.5" />
            <span>Takeoff</span>
          </Link>
        ) : (
          <span className="text-muted-foreground/60 text-sm">Manual</span>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground text-sm">
        {formatDate(estimate.created_at)}
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
              size="icon"
              variant="ghost"
            >
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">Actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem asChild>
              <Link to={`/estimates/${estimate.id}`}>
                <FileText className="mr-2 h-4 w-4" />
                Open
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
              <Send className="mr-2 h-4 w-4" />
              Send
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={duplicating}
              onClick={() => onDuplicate(estimate)}
            >
              {duplicating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Copy className="mr-2 h-4 w-4" />
              )}
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => onDelete(estimate)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
});

export function EstimatesTable({ estimates }: EstimatesTableProps) {
  const navigate = useNavigate();
  const [estimateToDelete, setEstimateToDelete] =
    useState<EstimateRowView | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  const handleDelete = useCallback(async () => {
    if (!estimateToDelete) {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/estimates/${estimateToDelete.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete estimate");
      }

      navigate(0);
    } catch (_error) {
      // intentionally silent; page state remains
    } finally {
      setIsDeleting(false);
      setEstimateToDelete(null);
    }
  }, [estimateToDelete, navigate]);

  const handleDuplicate = useCallback(
    async (estimate: EstimateRowView) => {
      setDuplicatingId(estimate.id);
      try {
        const response = await fetch(
          `/api/estimates/${estimate.id}/duplicate`,
          {
            method: "POST",
          }
        );

        if (!response.ok) {
          throw new Error("Failed to duplicate estimate");
        }

        const data = (await response.json()) as { id: string };
        navigate(`/estimates/${data.id}`);
      } catch (_error) {
        setDuplicatingId(null);
      }
    },
    [navigate]
  );

  return (
    <>
      <VirtualizedTable
        colSpan={9}
        empty="No estimates match your filters."
        header={
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="font-display font-medium text-foreground">
                Estimate #
              </TableHead>
              <TableHead className="font-display font-medium text-foreground">
                Job Name
              </TableHead>
              <TableHead className="font-display font-medium text-foreground">
                Client
              </TableHead>
              <TableHead className="font-display font-medium text-foreground">
                Address
              </TableHead>
              <TableHead className="text-right font-display font-medium text-foreground">
                Total
              </TableHead>
              <TableHead className="font-display font-medium text-foreground">
                Status
              </TableHead>
              <TableHead className="font-display font-medium text-foreground">
                Source
              </TableHead>
              <TableHead className="font-display font-medium text-foreground">
                Created
              </TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
        }
        overscan={10}
        renderRow={(estimate) => (
          <EstimateDataRow
            duplicating={duplicatingId === estimate.id}
            estimate={estimate}
            key={estimate.id}
            onDelete={setEstimateToDelete}
            onDuplicate={handleDuplicate}
          />
        )}
        rowHeight={38}
        rows={estimates}
        scrollMode="page"
        tableClassName="table-fixed"
      />

      <AlertDialog
        onOpenChange={(open) => !open && setEstimateToDelete(null)}
        open={!!estimateToDelete}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Estimate</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete estimate{" "}
              <span className="font-semibold">
                {estimateToDelete?.base_number}
              </span>
              {estimateToDelete?.job_name && (
                <> ({estimateToDelete.job_name})</>
              )}
              ? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
              onClick={handleDelete}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
