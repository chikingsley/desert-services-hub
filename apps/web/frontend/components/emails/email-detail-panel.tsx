/**
 * Email Detail Panel
 *
 * Slides in from the right when an email row is clicked.
 * Shows full email body (HTML or plain text), metadata, and actions.
 */
import {
  Ban,
  ExternalLink,
  Mail,
  Paperclip,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { Badge } from "@/apps/web/frontend/components/ui/badge";
import { Button } from "@/apps/web/frontend/components/ui/button";
import { Separator } from "@/apps/web/frontend/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/apps/web/frontend/components/ui/sheet";
import { Skeleton } from "@/apps/web/frontend/components/ui/skeleton";
import { fetcher } from "@/apps/web/frontend/lib/fetcher";
import { formatDate } from "@/lib/utils";
import type { Email } from "@lib/db/types";

interface EmailDetailPanelProps {
  emailId: number | null;
  open: boolean;
  onClose: () => void;
  onSpam?: (domain: string) => void;
}

const CLASSIFICATION_COLORS: Record<string, string> = {
  CONTRACT: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
  DUST_PERMIT:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  INVOICE:
    "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
  ESTIMATE:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  INSURANCE:
    "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  INTERNAL: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800/40 dark:text-zinc-400",
  SCHEDULE: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  CHANGE_ORDER:
    "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  VENDOR: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",
  SWPPP: "bg-lime-100 text-lime-800 dark:bg-lime-900/40 dark:text-lime-300",
  SPAM: "bg-zinc-100 text-zinc-400 dark:bg-zinc-800/20 dark:text-zinc-500",
  UNKNOWN: "bg-muted text-muted-foreground",
};

export function EmailDetailPanel({
  emailId,
  open,
  onClose,
  onSpam,
}: EmailDetailPanelProps) {
  const { data, isLoading } = useSWR<{
    email: Email;
    recipients: { mailbox: string; receivedAt: string }[];
  }>(emailId && open ? `/api/emails/${emailId}` : null, fetcher);

  const email = data?.email;
  const recipients = data?.recipients ?? [];

  // Auto-resize iframe to content height
  const [iframeHeight, setIframeHeight] = useState(400);

  useEffect(() => {
    setIframeHeight(400);
  }, [emailId]);

  return (
    <Sheet onOpenChange={(isOpen) => !isOpen && onClose()} open={open}>
      <SheetContent
        className="w-full sm:max-w-2xl overflow-y-auto"
        side="right"
      >
        {isLoading && (
          <SheetHeader>
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <div className="mt-4 space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </SheetHeader>
        )}

        {email && (
          <>
            <SheetHeader className="pr-8">
              <SheetTitle className="text-lg leading-tight">
                {email.subject || "(no subject)"}
              </SheetTitle>
              <SheetDescription className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5" />
                <span>
                  {email.fromName ? `${email.fromName} ` : ""}
                  &lt;{email.fromEmail}&gt;
                </span>
              </SheetDescription>
            </SheetHeader>

            {/* Metadata */}
            <div className="space-y-3 px-4">
              <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                <span className="text-muted-foreground">Date</span>
                <span>{formatDate(email.receivedAt)}</span>

                {email.toEmails.length > 0 && (
                  <>
                    <span className="text-muted-foreground">To</span>
                    <span className="truncate">
                      {email.toEmails.join(", ")}
                    </span>
                  </>
                )}

                {email.ccEmails.length > 0 && (
                  <>
                    <span className="text-muted-foreground">CC</span>
                    <span className="truncate">
                      {email.ccEmails.join(", ")}
                    </span>
                  </>
                )}

                {email.classification && (
                  <>
                    <span className="text-muted-foreground">Type</span>
                    <span>
                      <Badge
                        className={
                          CLASSIFICATION_COLORS[email.classification] ||
                          "bg-muted text-muted-foreground"
                        }
                        variant="outline"
                      >
                        {email.classification.replace(/_/g, " ")}
                      </Badge>
                    </span>
                  </>
                )}

                {email.projectName && (
                  <>
                    <span className="text-muted-foreground">Project</span>
                    <span>{email.projectName}</span>
                  </>
                )}

                {email.contractorName && (
                  <>
                    <span className="text-muted-foreground">Contractor</span>
                    <span>{email.contractorName}</span>
                  </>
                )}
              </div>

              {/* Recipients (dedup) */}
              {recipients.length > 1 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground text-sm flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    Received by {recipients.length} mailboxes:
                  </span>
                  {recipients.map((r) => (
                    <Badge
                      className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 font-normal"
                      key={r.mailbox}
                      variant="outline"
                    >
                      {r.mailbox.split("@")[0]}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Attachments */}
              {email.hasAttachments && email.attachmentNames.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {email.attachmentNames.map((name) => (
                    <Badge
                      className="gap-1 font-normal"
                      key={name}
                      variant="secondary"
                    >
                      <Paperclip className="h-3 w-3" />
                      {name}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                {email.webUrl && (
                  <Button asChild size="sm" variant="outline">
                    <a
                      href={email.webUrl}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                      Open in Outlook
                    </a>
                  </Button>
                )}
                {onSpam && email.fromDomain && (
                  <Button
                    onClick={() => onSpam(email.fromDomain!)}
                    size="sm"
                    variant="destructive"
                  >
                    <Ban className="mr-1.5 h-3.5 w-3.5" />
                    Block {email.fromDomain}
                  </Button>
                )}
              </div>
            </div>

            <Separator />

            {/* Email body */}
            <div className="flex-1 px-4 pb-4">
              {email.bodyHtml ? (
                <iframe
                  className="w-full rounded-lg border border-border bg-white"
                  onLoad={(e) => {
                    const doc = (e.target as HTMLIFrameElement).contentDocument;
                    if (doc?.body) {
                      setIframeHeight(
                        Math.max(300, doc.body.scrollHeight + 32)
                      );
                    }
                  }}
                  sandbox="allow-same-origin"
                  srcDoc={email.bodyHtml}
                  style={{ height: iframeHeight }}
                  title="Email content"
                />
              ) : (
                <pre className="whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-4 text-sm">
                  {email.bodyFull || email.bodyPreview || "(no content)"}
                </pre>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
