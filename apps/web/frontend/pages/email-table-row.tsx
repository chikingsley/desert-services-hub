import { Ban, MoreHorizontal, Paperclip, Tag, Users } from "lucide-react";
import { Badge } from "@/apps/web/frontend/components/ui/badge";
import { Button } from "@/apps/web/frontend/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/apps/web/frontend/components/ui/dropdown-menu";
import { TableCell, TableRow } from "@/apps/web/frontend/components/ui/table";
import { formatDate } from "@/lib/utils";
import {
  CLASSIFICATION_COLORS,
  CLASSIFY_OPTIONS,
  type EmailWithDedup,
} from "./emails-helpers";

interface EmailTableRowProps {
  email: EmailWithDedup;
  onClassifyDomain: (domain: string, classification: string) => void;
  onClassifyEmail: (
    emailId: number,
    opts: { classification?: string | null; isExcluded?: boolean }
  ) => void;
  onRowClick: (emailId: number) => void;
  onSpam: (domain: string) => void;
}

export function EmailTableRow({
  email,
  onRowClick,
  onClassifyEmail,
  onClassifyDomain,
  onSpam,
}: EmailTableRowProps) {
  const fromDomain = email.fromDomain;

  return (
    <TableRow
      className="group cursor-pointer transition-colors hover:bg-primary/5"
      onClick={() => onRowClick(email.id)}
    >
      <TableCell>
        <div className="max-w-[220px]">
          <div className="flex items-center gap-1.5">
            <span className="truncate font-medium text-sm">
              {email.fromName || email.fromEmail || "—"}
            </span>
            {email.recipientCount > 1 && (
              <Badge
                className="shrink-0 gap-0.5 bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
                variant="outline"
              >
                <Users className="h-3 w-3" />
                {email.recipientCount}
              </Badge>
            )}
          </div>
          {email.fromName && email.fromEmail && (
            <div className="truncate text-muted-foreground text-xs">
              {email.fromEmail}
            </div>
          )}
        </div>
      </TableCell>
      <TableCell>
        <div className="max-w-[400px] truncate">
          {email.subject || "(no subject)"}
        </div>
        {email.bodyPreview && (
          <div className="mt-0.5 max-w-[400px] truncate text-muted-foreground text-xs">
            {email.bodyPreview.slice(0, 100)}
          </div>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap text-muted-foreground text-sm">
        {formatDate(email.receivedAt)}
      </TableCell>
      <TableCell>
        {(email.classification || email.isExcluded) && (
          <Badge
            className={
              CLASSIFICATION_COLORS[email.classification || "SPAM"] ||
              "bg-muted text-muted-foreground"
            }
            variant="outline"
          >
            {(email.classification || "SPAM").replace(/_/g, " ")}
          </Badge>
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          {email.hasAttachments && (
            <Paperclip className="h-4 w-4 text-muted-foreground" />
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                className="h-7 w-7 opacity-0 group-hover:opacity-100"
                onClick={(e) => e.stopPropagation()}
                size="icon"
                variant="ghost"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              onClick={(e) => e.stopPropagation()}
            >
              <DropdownMenuLabel className="text-xs">
                This email only
              </DropdownMenuLabel>
              {CLASSIFY_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={`single-${opt.value}`}
                  onClick={() =>
                    onClassifyEmail(email.id, {
                      classification: opt.value,
                      isExcluded: false,
                    })
                  }
                >
                  <Tag className="mr-2 h-3.5 w-3.5" />
                  {opt.label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem
                onClick={() =>
                  onClassifyEmail(email.id, {
                    classification: null,
                    isExcluded: false,
                  })
                }
              >
                <Tag className="mr-2 h-3.5 w-3.5" />
                Clear classification
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onClick={() =>
                  onClassifyEmail(email.id, {
                    classification: "SPAM",
                    isExcluded: true,
                  })
                }
              >
                <Ban className="mr-2 h-3.5 w-3.5" />
                Mark as spam (email only)
              </DropdownMenuItem>

              {fromDomain && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs">
                    Domain rule ({fromDomain})
                  </DropdownMenuLabel>
                  {CLASSIFY_OPTIONS.map((opt) => (
                    <DropdownMenuItem
                      key={`domain-${opt.value}`}
                      onClick={() => onClassifyDomain(fromDomain, opt.value)}
                    >
                      <Tag className="mr-2 h-3.5 w-3.5" />
                      {opt.label}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => onSpam(fromDomain)}
                  >
                    <Ban className="mr-2 h-3.5 w-3.5" />
                    Block {fromDomain}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  );
}
