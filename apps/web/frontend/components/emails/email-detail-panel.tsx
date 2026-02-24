/**
 * Email Detail Panel
 *
 * Slides in from the right when an email row is clicked.
 * Shows full email body (HTML or plain text), metadata, and actions.
 */

import type { Email } from "@lib/db/types";
import { Ban, ExternalLink, Mail, Paperclip, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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

interface EmailDetailPanelProps {
  emailId: number | null;
  onClose: () => void;
  onSpam?: (domain: string) => void;
  open: boolean;
}

interface EmailAttachmentItem {
  contentType: string | null;
  id: string; // "db:<pk>" or "graph:<graphAttachmentId>"
  name: string;
  size: number | null;
}

interface EmailAttachmentsResponse {
  attachments: EmailAttachmentItem[];
  source: "db" | "graph" | "none";
  unavailableReason?: string;
}

const EMAIL_VIEWER_CSS = `
  :root { color-scheme: light; }
  html, body { margin: 0; padding: 0; }
  body {
    padding: 14px 16px;
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
    font-size: 14px;
    line-height: 1.45;
    color: #0f172a;
    background: #ffffff;
  }
  * { box-sizing: border-box; }
  img { max-width: 100%; height: auto; }
  table { max-width: 100%; }
  pre { white-space: pre-wrap; word-break: break-word; }
  blockquote {
    margin: 0 0 0 12px;
    padding-left: 12px;
    border-left: 3px solid #e2e8f0;
  }
  hr { border: 0; border-top: 1px solid #e2e8f0; margin: 12px 0; }
  a { color: #0b5fff; }
`;

const HTML_HEAD_TAG_RE = /<head\b[^>]*>/i;
const HTML_HTML_TAG_RE = /<html\b[^>]*>/i;

function looksLikeHtml(raw: string): boolean {
  const s = raw.trim().slice(0, 2000).toLowerCase();
  if (!s) {
    return false;
  }
  return (
    s.includes("<html") ||
    s.includes("<body") ||
    s.includes("<div") ||
    s.includes("<p") ||
    s.includes("<table") ||
    s.includes("<br") ||
    s.includes("<span") ||
    s.includes("</")
  );
}

function buildEmailSrcDoc(rawHtml: string): string {
  const injected = `<base target="_blank" /><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><style>${EMAIL_VIEWER_CSS}</style>`;

  // If there's already a <head>, inject inside it.
  if (HTML_HEAD_TAG_RE.test(rawHtml)) {
    return rawHtml.replace(HTML_HEAD_TAG_RE, (m) => `${m}${injected}`);
  }

  // If there's an <html> but no <head>, add one.
  if (HTML_HTML_TAG_RE.test(rawHtml)) {
    return rawHtml.replace(
      HTML_HTML_TAG_RE,
      (m) => `${m}<head>${injected}</head>`
    );
  }

  // Otherwise treat as a fragment.
  return `<!doctype html><html><head>${injected}</head><body>${rawHtml}</body></html>`;
}

function buildSrcDocIfHtml(bodyHtml: string | null | undefined): string | null {
  if (!bodyHtml) {
    return null;
  }
  if (!looksLikeHtml(bodyHtml)) {
    return null;
  }
  return buildEmailSrcDoc(bodyHtml);
}

function handleIframeLoad(
  iframe: HTMLIFrameElement,
  setHeight: (h: number) => void
): void {
  const doc = iframe.contentDocument;
  if (!doc?.body) {
    return;
  }
  // Force links out of the sandbox so JS-enabled pages don't render
  // inside the iframe (which triggers "JavaScript disabled").
  for (const a of Array.from(doc.querySelectorAll("a[href]"))) {
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener noreferrer");
  }

  // Also intercept clicks to ensure the iframe never navigates.
  // (Some HTML email templates override target or use weird markup.)
  doc.addEventListener(
    "click",
    (ev) => {
      const t = ev.target as Element | null;
      const a = t?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) {
        return;
      }

      const href = a.getAttribute("href") ?? "";
      if (
        !href ||
        href.startsWith("#") ||
        href.toLowerCase().startsWith("javascript:")
      ) {
        return;
      }

      ev.preventDefault();
      ev.stopPropagation();

      const resolved = (() => {
        try {
          return new URL(href, doc.baseURI).toString();
        } catch {
          return href;
        }
      })();

      window.open(resolved, "_blank", "noopener,noreferrer");
    },
    { capture: true }
  );

  setHeight(Math.max(300, doc.body.scrollHeight + 32));
}

function AttachmentsSection({
  email,
  attachmentsData,
  attachmentsError,
  attachmentsLoading,
}: {
  email: Email;
  attachmentsData: EmailAttachmentsResponse | undefined;
  attachmentsError: Error | undefined;
  attachmentsLoading: boolean;
}) {
  const attachments = attachmentsData?.attachments ?? [];
  const unavailableReason = attachmentsData?.unavailableReason ?? null;

  const openUrl = (att: EmailAttachmentItem) =>
    `/api/emails/${email.id}/attachments/${encodeURIComponent(att.id)}/download?inline=1`;
  const downloadUrl = (att: EmailAttachmentItem) =>
    `/api/emails/${email.id}/attachments/${encodeURIComponent(att.id)}/download`;

  const header = (
    <div className="flex items-center gap-2 text-muted-foreground text-sm">
      <Paperclip className="h-3.5 w-3.5" />
      <span>Attachments</span>
    </div>
  );

  if (attachmentsLoading) {
    return (
      <div className="space-y-2">
        {header}
        <div className="text-muted-foreground text-sm">
          Loading attachments...
        </div>
      </div>
    );
  }

  if (attachmentsError) {
    return (
      <div className="space-y-2">
        {header}
        <div className="text-muted-foreground text-sm">
          Attachments unavailable ({attachmentsError.message})
        </div>
      </div>
    );
  }

  if (unavailableReason) {
    return (
      <div className="space-y-2">
        {header}
        <div className="text-muted-foreground text-sm">
          Attachments unavailable ({unavailableReason})
        </div>
      </div>
    );
  }

  if (attachments.length > 0) {
    return (
      <div className="space-y-2">
        {header}
        <div className="space-y-1">
          {attachments.map((att) => (
            <div
              className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/20 px-2 py-1.5"
              key={att.id}
            >
              <div className="min-w-0">
                <div className="truncate text-sm">{att.name}</div>
                {(att.contentType || att.size) && (
                  <div className="truncate text-muted-foreground text-xs">
                    {att.contentType ?? ""}
                    {att.contentType && att.size ? " • " : ""}
                    {att.size ? `${Math.round(att.size / 1024)} KB` : ""}
                  </div>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Button asChild size="sm" variant="outline">
                  <a
                    href={openUrl(att)}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    Open
                  </a>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <a href={downloadUrl(att)}>Download</a>
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (email.attachmentNames.length > 0) {
    return (
      <div className="space-y-2">
        {header}
        <div className="flex flex-wrap gap-2">
          {email.attachmentNames.map((name) => (
            <Badge className="gap-1 font-normal" key={name} variant="secondary">
              <Paperclip className="h-3 w-3" />
              {name}
            </Badge>
          ))}
        </div>
        <div className="text-muted-foreground text-sm">
          Attachment content is not available in the hub yet. Use "Open in
          Outlook" to access them.
        </div>
      </div>
    );
  }

  if (email.hasAttachments) {
    return (
      <div className="space-y-2">
        {header}
        <div className="text-muted-foreground text-sm">
          This email reports attachments, but none were indexed in the hub. Use
          "Open in Outlook" to access them.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {header}
      <div className="text-muted-foreground text-sm">No attachments.</div>
    </div>
  );
}

function EmailMetadataGrid({ email }: { email: Email }) {
  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
      <span className="text-muted-foreground">Date</span>
      <span>{formatDate(email.receivedAt)}</span>

      {email.toEmails.length > 0 && (
        <>
          <span className="text-muted-foreground">To</span>
          <span className="truncate">{email.toEmails.join(", ")}</span>
        </>
      )}

      {email.ccEmails.length > 0 && (
        <>
          <span className="text-muted-foreground">CC</span>
          <span className="truncate">{email.ccEmails.join(", ")}</span>
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
  );
}

const CLASSIFICATION_COLORS: Record<string, string> = {
  CONTRACT: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
  DUST_PERMIT:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  INVOICE:
    "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
  PAYMENT:
    "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  ESTIMATE:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  INSURANCE:
    "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  INTERNAL: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800/40 dark:text-zinc-400",
  HR: "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300",
  IT: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300",
  SCHEDULE: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  CHANGE_ORDER: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
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
  const spamDomain = email?.fromDomain ?? null;

  const attachmentsKey =
    emailId && open ? `/api/emails/${emailId}/attachments` : null;

  const {
    data: attachmentsData,
    error: attachmentsError,
    isLoading: attachmentsLoading,
  } = useSWR<EmailAttachmentsResponse>(attachmentsKey, fetcher);

  // Auto-resize iframe to content height
  const [iframeHeight, setIframeHeight] = useState(400);

  // Reset iframe height when switching emails; onLoad will then compute the final height.
  // biome-ignore lint/correctness/useExhaustiveDependencies: we intentionally reset only on emailId changes.
  useEffect(() => {
    setIframeHeight(400);
  }, [emailId]);

  const iframeSrcDoc = useMemo(
    () => buildSrcDocIfHtml(email?.bodyHtml),
    [email?.bodyHtml]
  );

  return (
    <Sheet onOpenChange={(isOpen) => !isOpen && onClose()} open={open}>
      <SheetContent
        className="w-full overflow-y-auto sm:max-w-2xl"
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
              <EmailMetadataGrid email={email} />

              {/* Recipients (dedup) */}
              {recipients.length > 1 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex items-center gap-1 text-muted-foreground text-sm">
                    <Users className="h-3.5 w-3.5" />
                    Received by {recipients.length} mailboxes:
                  </span>
                  {recipients.map((r) => (
                    <Badge
                      className="bg-indigo-100 font-normal text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
                      key={r.mailbox}
                      variant="outline"
                    >
                      {r.mailbox.split("@")[0]}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Attachments */}
              <AttachmentsSection
                attachmentsData={attachmentsData}
                attachmentsError={attachmentsError}
                attachmentsLoading={attachmentsLoading}
                email={email}
              />

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
                {onSpam && spamDomain && (
                  <Button
                    onClick={() => onSpam(spamDomain)}
                    size="sm"
                    variant="destructive"
                  >
                    <Ban className="mr-1.5 h-3.5 w-3.5" />
                    Block {spamDomain}
                  </Button>
                )}
              </div>
            </div>

            <Separator />

            {/* Email body */}
            <div className="flex-1 px-4 pb-4">
              {iframeSrcDoc ? (
                // biome-ignore lint/a11y/noNoninteractiveElementInteractions: iframe onLoad is used to tweak sandboxed HTML.
                <iframe
                  className="w-full rounded-lg border border-border bg-white"
                  onLoad={(e) =>
                    handleIframeLoad(e.currentTarget, setIframeHeight)
                  }
                  sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                  srcDoc={iframeSrcDoc}
                  style={{ height: iframeHeight }}
                  title="Email content"
                />
              ) : (
                <pre className="whitespace-pre-wrap rounded-lg border border-border bg-muted/30 p-4 text-sm">
                  {email.bodyFull ||
                    email.bodyHtml ||
                    email.bodyPreview ||
                    "(no content)"}
                </pre>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
