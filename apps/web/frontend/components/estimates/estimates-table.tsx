import {
  Copy,
  FileText,
  Loader2,
  MoreHorizontal,
  Send,
  Trash2,
} from "lucide-react";
import { useState } from "react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/apps/web/frontend/components/ui/table";
import { formatCurrency, formatDate, getStatusColor } from "@/lib/utils";

// Summary version info (subset of full EstimateVersion for list display)
interface EstimateVersionSummary {
  id: string;
  version_number: number;
  total: number;
  is_current: number;
  created_at: string;
}

export interface EstimateWithVersion {
  id: string;
  base_number: string;
  job_name: string;
  client_name: string | null;
  status: string;
  created_at: string;
  current_version: EstimateVersionSummary | null;
  takeoff_id?: string | null;
  takeoff_name?: string | null;
}

interface EstimatesTableProps {
  estimates: EstimateWithVersion[];
}

export function EstimatesTable({ estimates }: EstimatesTableProps) {
  const navigate = useNavigate();
  const [estimateToDelete, setEstimateToDelete] =
    useState<EstimateWithVersion | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  const handleDelete = async () => {
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

      // Refresh the page to reload data
      navigate(0);
    } catch (_error) {
      // Error handled silently
    } finally {
      setIsDeleting(false);
      setEstimateToDelete(null);
    }
  };

  const handleDuplicate = async (estimate: EstimateWithVersion) => {
    setDuplicatingId(estimate.id);
    try {
      const response = await fetch(`/api/estimates/${estimate.id}/duplicate`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to duplicate estimate");
      }

      const data = (await response.json()) as { id: string };
      navigate(`/estimates/${data.id}`);
    } catch (_error) {
      setDuplicatingId(null);
    }
  };

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30 hover:bg-muted/30">
            <TableHead className="w-[120px] font-display font-medium text-foreground">
              Estimate #
            </TableHead>
            <TableHead className="font-display font-medium text-foreground">
              Job Name
            </TableHead>
            <TableHead className="font-display font-medium text-foreground">
              Client
            </TableHead>
            <TableHead className="font-display font-medium text-foreground">
              Source
            </TableHead>
            <TableHead className="text-right font-display font-medium text-foreground">
              Total
            </TableHead>
            <TableHead className="font-display font-medium text-foreground">
              Status
            </TableHead>
            <TableHead className="font-display font-medium text-foreground">
              Version
            </TableHead>
            <TableHead className="font-display font-medium text-foreground">
              Created
            </TableHead>
            <TableHead className="w-[50px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {estimates.map((estimate, index) => (
            <TableRow
              className="group transition-colors hover:bg-primary/5"
              key={estimate.id}
              style={{ animationDelay: `${index * 15}ms` }}
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
                  {estimate.job_name}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {estimate.client_name || (
                  <span className="text-muted-foreground/50 italic">
                    No client
                  </span>
                )}
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
                  <span className="text-muted-foreground/50 text-sm">
                    Manual
                  </span>
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
                <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs">
                  v{estimate.current_version?.version_number || 1}
                </span>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {formatDate(estimate.created_at)}
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      className="h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100"
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
                      disabled={duplicatingId === estimate.id}
                      onClick={() => handleDuplicate(estimate)}
                    >
                      {duplicatingId === estimate.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Copy className="mr-2 h-4 w-4" />
                      )}
                      Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => setEstimateToDelete(estimate)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

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
