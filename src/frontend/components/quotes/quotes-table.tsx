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
} from "@/components/ui/alert-dialog";
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
import { formatCurrency, formatDate, getStatusColor } from "@/lib/utils";

// Summary version info (subset of full QuoteVersion for list display)
interface QuoteVersionSummary {
  id: string;
  version_number: number;
  total: number;
  is_current: number;
  created_at: string;
}

export interface QuoteWithVersion {
  id: string;
  base_number: string;
  job_name: string;
  client_name: string | null;
  status: string;
  created_at: string;
  current_version: QuoteVersionSummary | null;
  takeoff_id?: string | null;
  takeoff_name?: string | null;
}

interface QuotesTableProps {
  quotes: QuoteWithVersion[];
}

export function QuotesTable({ quotes }: QuotesTableProps) {
  const navigate = useNavigate();
  const [quoteToDelete, setQuoteToDelete] = useState<QuoteWithVersion | null>(
    null
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  const handleDelete = async () => {
    if (!quoteToDelete) {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/quotes/${quoteToDelete.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete quote");
      }

      // Refresh the page to reload data
      navigate(0);
    } catch (_error) {
      // Error handled silently
    } finally {
      setIsDeleting(false);
      setQuoteToDelete(null);
    }
  };

  const handleDuplicate = async (quote: QuoteWithVersion) => {
    setDuplicatingId(quote.id);
    try {
      const response = await fetch(`/api/quotes/${quote.id}/duplicate`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to duplicate quote");
      }

      const data = await response.json();
      navigate(`/quotes/${data.id}`);
    } catch (_error) {
      setDuplicatingId(null);
    }
  };

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="w-[120px] font-display font-medium text-foreground">
                Quote #
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
            {quotes.map((quote, index) => (
              <TableRow
                className="group transition-colors hover:bg-primary/5"
                key={quote.id}
                style={{ animationDelay: `${index * 30}ms` }}
              >
                <TableCell className="font-medium font-mono text-primary">
                  <Link
                    className="transition-colors hover:text-primary/80 hover:underline"
                    to={`/quotes/${quote.id}`}
                  >
                    {quote.base_number}
                  </Link>
                </TableCell>
                <TableCell>
                  <Link
                    className="font-medium transition-colors hover:text-primary hover:underline"
                    to={`/quotes/${quote.id}`}
                  >
                    {quote.job_name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {quote.client_name || (
                    <span className="text-muted-foreground/50 italic">
                      No client
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  {quote.takeoff_id ? (
                    <Link
                      className="inline-flex items-center gap-1.5 text-primary text-sm transition-colors hover:text-primary/80 hover:underline"
                      to={`/takeoffs/${quote.takeoff_id}`}
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
                  {quote.current_version
                    ? formatCurrency(quote.current_version.total)
                    : "-"}
                </TableCell>
                <TableCell>
                  <Badge
                    className={`${getStatusColor(quote.status)} font-medium`}
                    variant="outline"
                  >
                    {quote.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs">
                    v{quote.current_version?.version_number || 1}
                  </span>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {formatDate(quote.created_at)}
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
                        <Link to={`/quotes/${quote.id}`}>
                          <FileText className="mr-2 h-4 w-4" />
                          Open
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem disabled>
                        <Send className="mr-2 h-4 w-4" />
                        Send
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={duplicatingId === quote.id}
                        onClick={() => handleDuplicate(quote)}
                      >
                        {duplicatingId === quote.id ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Copy className="mr-2 h-4 w-4" />
                        )}
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setQuoteToDelete(quote)}
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
      </div>

      <AlertDialog
        onOpenChange={(open) => !open && setQuoteToDelete(null)}
        open={!!quoteToDelete}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Quote</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete quote{" "}
              <span className="font-semibold">
                {quoteToDelete?.base_number}
              </span>
              {quoteToDelete?.job_name && <> ({quoteToDelete.job_name})</>}?
              This action cannot be undone.
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
