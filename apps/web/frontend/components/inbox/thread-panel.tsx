/**
 * Thread Panel
 *
 * Slide-in panel showing a full email conversation.
 * Fetches all messages in a thread and renders them chronologically.
 */

import type { Email } from "@lib/db/types";
import { ExternalLink, Mail, Paperclip, Reply } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { ComposeModal } from "@/apps/web/frontend/components/inbox/compose-modal";
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

interface ThreadEmail extends Email {
  mailboxDisplayName: string | null;
  mailboxEmail: string;
}

interface ThreadResponse {
  classification: string | null;
  conversationId: string;
  emails: ThreadEmail[];
  mailboxes: { id: number; email: string; displayName: string | null }[];
  messageCount: number;
  projectId: number | null;
  subject: string | null;
}

interface ThreadPanelProps {
  conversationId: string | null;
  onClose: () => void;
  open: boolean;
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
};

const HTML_HEAD_TAG_RE = /<head\b[^>]*>/i;
const HTML_HTML_TAG_RE = /<html\b[^>]*>/i;

const EMAIL_VIEWER_CSS = `
  :root { color-scheme: light; }
  html, body { margin: 0; padding: 0; }
  body {
    padding: 12px 14px;
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
    font-size: 13px;
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

  if (HTML_HEAD_TAG_RE.test(rawHtml)) {
    return rawHtml.replace(HTML_HEAD_TAG_RE, (m) => `${m}${injected}`);
  }
  if (HTML_HTML_TAG_RE.test(rawHtml)) {
    return rawHtml.replace(
      HTML_HTML_TAG_RE,
      (m) => `${m}<head>${injected}</head>`
    );
  }
  return `<!doctype html><html><head>${injected}</head><body>${rawHtml}</body></html>`;
}

function handleIframeLoad(
  iframe: HTMLIFrameElement,
  setHeight: (h: number) => void
): void {
  const doc = iframe.contentDocument;
  if (!doc?.body) {
    return;
  }
  for (const a of Array.from(doc.querySelectorAll("a[href]"))) {
    a.setAttribute("target", "_blank");
    a.setAttribute("rel", "noopener noreferrer");
  }
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
  setHeight(Math.max(100, doc.body.scrollHeight + 16));
}

function MessageCard({ email }: { email: ThreadEmail }) {
  const [iframeHeight, setIframeHeight] = useState(200);

  const srcDoc = useMemo(() => {
    if (email.bodyHtml && looksLikeHtml(email.bodyHtml)) {
      return buildEmailSrcDoc(email.bodyHtml);
    }
    return null;
  }, [email.bodyHtml]);

  const senderLabel = email.fromName
    ? `${email.fromName} <${email.fromEmail}>`
    : (email.fromEmail ?? "Unknown");

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Message header */}
      <div className="flex items-start justify-between gap-2 border-border border-b p-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate font-medium text-sm">{senderLabel}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-muted-foreground text-xs">
            <span>{formatDate(email.receivedAt)}</span>
            <span>via {email.mailboxEmail.split("@")[0]}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {email.hasAttachments && (
            <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          {email.webUrl && (
            <Button asChild className="h-6 px-2" size="sm" variant="ghost">
              <a href={email.webUrl} rel="noopener noreferrer" target="_blank">
                <ExternalLink className="h-3 w-3" />
              </a>
            </Button>
          )}
        </div>
      </div>

      {/* Message body */}
      <div className="p-3">
        {srcDoc ? (
          // biome-ignore lint/a11y/noNoninteractiveElementInteractions: iframe onLoad is used to tweak sandboxed HTML.
          <iframe
            className="w-full rounded border border-border bg-white"
            onLoad={(e) => handleIframeLoad(e.currentTarget, setIframeHeight)}
            sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
            srcDoc={srcDoc}
            style={{ height: iframeHeight }}
            title={`Email from ${email.fromEmail}`}
          />
        ) : (
          <pre className="whitespace-pre-wrap text-sm">
            {email.bodyFull || email.bodyPreview || "(no content)"}
          </pre>
        )}
      </div>
    </div>
  );
}

/** Writable mailboxes that can create drafts via app auth. */
const WRITABLE_MAILBOX_SET = new Set([
  "chi@desertservices.net",
  "contracts@desertservices.net",
  "dustpermits@desertservices.net",
]);

export function ThreadPanel({
  conversationId,
  open,
  onClose,
}: ThreadPanelProps) {
  const { data, isLoading, mutate } = useSWR<ThreadResponse>(
    conversationId && open
      ? `/api/inbox/thread/${encodeURIComponent(conversationId)}`
      : null,
    fetcher
  );

  const [replyOpen, setReplyOpen] = useState(false);

  // Determine which mailbox to reply from: prefer a writable mailbox that
  // appears in this thread, fall back to chi@.
  const replyMailbox = useMemo(() => {
    if (!data?.mailboxes) {
      return "chi@desertservices.net";
    }
    const writable = data.mailboxes.find((m) =>
      WRITABLE_MAILBOX_SET.has(m.email)
    );
    return writable?.email ?? "chi@desertservices.net";
  }, [data?.mailboxes]);

  // The last email in the thread is the one we reply to
  const lastEmail = data?.emails.at(-1);

  const handleReply = useCallback(() => {
    setReplyOpen(true);
  }, []);

  // Reset scroll when conversation changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally reset on conversationId changes
  useEffect(() => {
    if (!open) {
      return;
    }
    const el = document.querySelector("[data-thread-scroll]");
    if (el) {
      el.scrollTop = 0;
    }
  }, [conversationId, open]);

  return (
    <>
      <Sheet onOpenChange={(isOpen) => !isOpen && onClose()} open={open}>
        <SheetContent
          className="flex w-full flex-col overflow-hidden sm:max-w-3xl"
          side="right"
        >
          {isLoading && (
            <SheetHeader>
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </SheetHeader>
          )}

          {data && (
            <>
              <SheetHeader className="shrink-0 pr-8">
                <SheetTitle className="text-lg leading-tight">
                  {data.subject || "(no subject)"}
                </SheetTitle>
                <SheetDescription className="flex flex-wrap items-center gap-2">
                  <span>{data.messageCount} messages</span>
                  {data.classification && (
                    <Badge
                      className={
                        CLASSIFICATION_COLORS[data.classification] ??
                        "bg-muted text-muted-foreground"
                      }
                      variant="outline"
                    >
                      {data.classification.replace(/_/g, " ")}
                    </Badge>
                  )}
                  {data.mailboxes.length > 1 &&
                    data.mailboxes.map((m) => (
                      <Badge
                        className="bg-indigo-100 font-normal text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
                        key={m.id}
                        variant="outline"
                      >
                        {m.email.split("@")[0]}
                      </Badge>
                    ))}
                </SheetDescription>
              </SheetHeader>

              <Separator />

              {/* Scrollable message list */}
              <div
                className="flex-1 space-y-3 overflow-y-auto p-4"
                data-thread-scroll=""
              >
                {data.emails.map((email) => (
                  <MessageCard email={email} key={email.id} />
                ))}
              </div>

              {/* Reply button */}
              <div className="shrink-0 border-border border-t p-3">
                <Button className="w-full" onClick={handleReply}>
                  <Reply className="h-4 w-4" />
                  Reply
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Reply compose modal */}
      {lastEmail && (
        <ComposeModal
          defaultMailbox={replyMailbox}
          onClose={() => setReplyOpen(false)}
          onSent={() => mutate()}
          open={replyOpen}
          replySubject={data?.subject ?? undefined}
          replyToEmailId={lastEmail.id}
        />
      )}
    </>
  );
}
