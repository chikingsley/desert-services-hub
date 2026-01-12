"use client";

import { Copy, FileText, MoreHorizontal, Send, Trash2 } from "lucide-react";
import Link from "next/link";
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
import type { QuoteVersion } from "@/lib/types";
import { formatCurrency, formatDate, getStatusColor } from "@/lib/utils";

interface QuoteWithVersion {
  id: string;
  base_number: string;
  job_name: string;
  client_name: string | null;
  status: string;
  created_at: string;
  current_version: QuoteVersion | null;
  takeoff_id?: string | null;
  takeoff_name?: string | null;
}

interface QuotesTableProps {
  quotes: QuoteWithVersion[];
}

export function QuotesTable({ quotes }: QuotesTableProps) {
  return (
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
                  href={`/quotes/${quote.id}`}
                >
                  {quote.base_number}
                </Link>
              </TableCell>
              <TableCell>
                <Link
                  className="font-medium transition-colors hover:text-primary hover:underline"
                  href={`/quotes/${quote.id}`}
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
                    href={`/takeoffs/${quote.takeoff_id}`}
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
                      <Link href={`/quotes/${quote.id}`}>
                        <FileText className="mr-2 h-4 w-4" />
                        Open
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled>
                      <Send className="mr-2 h-4 w-4" />
                      Send
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled>
                      <Copy className="mr-2 h-4 w-4" />
                      Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive" disabled>
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
  );
}
