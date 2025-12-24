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
import type { Quote, QuoteVersion } from "@/lib/types";
import { formatCurrency, formatDate, getStatusColor } from "@/lib/utils";

interface QuoteWithVersion extends Quote {
  current_version: QuoteVersion | null;
}

interface QuotesTableProps {
  quotes: QuoteWithVersion[];
}

export function QuotesTable({ quotes }: QuotesTableProps) {
  return (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[120px]">Quote #</TableHead>
            <TableHead>Job Name</TableHead>
            <TableHead>Client</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Version</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="w-[50px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {quotes.map((quote) => (
            <TableRow className="group" key={quote.id}>
              <TableCell className="font-medium font-mono">
                <Link className="hover:underline" href={`/quotes/${quote.id}`}>
                  {quote.base_number}
                </Link>
              </TableCell>
              <TableCell>
                <Link className="hover:underline" href={`/quotes/${quote.id}`}>
                  {quote.job_name}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {quote.client_name || "-"}
              </TableCell>
              <TableCell className="text-right font-mono">
                {quote.current_version
                  ? formatCurrency(quote.current_version.total)
                  : "-"}
              </TableCell>
              <TableCell>
                <Badge
                  className={getStatusColor(quote.status)}
                  variant="outline"
                >
                  {quote.status}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground">
                v{quote.current_version?.version_number || 1}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDate(quote.created_at)}
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      className="h-8 w-8 opacity-0 group-hover:opacity-100"
                      size="icon"
                      variant="ghost"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                      <span className="sr-only">Actions</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
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
