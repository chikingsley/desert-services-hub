/**
 * Compose / Reply Modal
 *
 * Dialog for composing new emails or replying to existing threads.
 * Creates drafts in Outlook via the inbox API (Graph API app-auth).
 * Can optionally send immediately after creating the draft.
 */

import { Loader2, Send } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import useSWR from "swr";
import { Button } from "@/apps/web/frontend/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/apps/web/frontend/components/ui/dialog";
import { Input } from "@/apps/web/frontend/components/ui/input";
import { Label } from "@/apps/web/frontend/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/apps/web/frontend/components/ui/select";
import { Textarea } from "@/apps/web/frontend/components/ui/textarea";
import { fetcher } from "@/apps/web/frontend/lib/fetcher";

interface WritableMailbox {
  email: string;
  label: string;
}

interface ComposeModalProps {
  /** Pre-fill for reply mode */
  defaultMailbox?: string;
  onClose: () => void;
  onSent?: () => void;
  open: boolean;
  /** Pre-filled subject for replies */
  replySubject?: string;
  /** Reply mode: email database ID to reply to */
  replyToEmailId?: number;
}

type SubmitMode = "draft" | "send";

// ── API helpers ──────────────────────────────────────────

const ANGLE_BRACKET_RE = /^(.+?)\s*<(.+?)>$/;

function parseRecipients(input: string): { email: string; name?: string }[] {
  if (!input.trim()) {
    return [];
  }
  return input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((token) => {
      const match = ANGLE_BRACKET_RE.exec(token);
      if (match) {
        return { email: match[2] ?? "", name: match[1] };
      }
      return { email: token };
    });
}

async function postJson(
  url: string,
  body: unknown
): Promise<{ draftId?: string; error?: string }> {
  const res = await fetch(url, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const raw = (await res.json()) as unknown;
  const data =
    raw && typeof raw === "object"
      ? (raw as { draftId?: unknown; error?: unknown })
      : {};
  if (!res.ok) {
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : `Request failed (${res.status})`
    );
  }
  return {
    draftId: typeof data.draftId === "string" ? data.draftId : undefined,
    error: typeof data.error === "string" ? data.error : undefined,
  };
}

async function createAndOptionallySend(
  draftUrl: string,
  draftBody: unknown,
  mailbox: string,
  mode: SubmitMode
): Promise<void> {
  const draft = await postJson(draftUrl, draftBody);
  if (mode === "send" && draft.draftId) {
    await postJson("/api/inbox/send", { draftId: draft.draftId, mailbox });
  }
}

// ── Component ────────────────────────────────────────────

export function ComposeModal({
  defaultMailbox,
  onClose,
  onSent,
  open,
  replySubject,
  replyToEmailId,
}: ComposeModalProps) {
  const isReply = replyToEmailId !== undefined;

  // Writable mailbox list
  const { data: mailboxData } = useSWR<{ mailboxes: WritableMailbox[] }>(
    open ? "/api/inbox/mailboxes" : null,
    fetcher
  );

  // Form state
  const [mailbox, setMailbox] = useState(defaultMailbox ?? "");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [replyAll, setReplyAll] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setMailbox(defaultMailbox ?? mailboxData?.mailboxes[0]?.email ?? "");
      setTo("");
      setCc("");
      setSubject(replySubject ? `Re: ${replySubject}` : "");
      setBody("");
      setReplyAll(false);
      setError(null);
    }
  }, [open, defaultMailbox, replySubject, mailboxData]);

  // Set default mailbox when data loads
  useEffect(() => {
    if (!mailbox && mailboxData?.mailboxes.length) {
      setMailbox(defaultMailbox ?? mailboxData.mailboxes[0]?.email ?? "");
    }
  }, [mailboxData, defaultMailbox, mailbox]);

  const handleSubmit = useCallback(
    async (mode: SubmitMode) => {
      setLoading(true);
      setError(null);

      try {
        if (isReply) {
          await createAndOptionallySend(
            "/api/inbox/reply",
            { body, emailId: replyToEmailId, mailbox, replyAll },
            mailbox,
            mode
          );
        } else {
          const toRecipients = parseRecipients(to);
          const ccRecipients = parseRecipients(cc);
          if (toRecipients.length === 0) {
            throw new Error("At least one recipient is required");
          }
          await createAndOptionallySend(
            "/api/inbox/compose",
            { body, cc: ccRecipients, mailbox, subject, to: toRecipients },
            mailbox,
            mode
          );
        }
        onSent?.();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    },
    [
      isReply,
      body,
      mailbox,
      replyAll,
      replyToEmailId,
      to,
      cc,
      subject,
      onSent,
      onClose,
    ]
  );

  const canSubmit = isReply
    ? body.trim().length > 0 && mailbox
    : to.trim().length > 0 &&
      subject.trim().length > 0 &&
      body.trim().length > 0 &&
      mailbox;

  return (
    <Dialog onOpenChange={(isOpen) => !isOpen && onClose()} open={open}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isReply ? "Reply" : "New Email"}</DialogTitle>
          <DialogDescription>
            {isReply
              ? "Reply to this conversation. Draft will be created in Outlook."
              : "Compose a new email. Draft will be created in Outlook."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Mailbox selector */}
          <div className="grid grid-cols-[80px_1fr] items-center gap-4">
            <Label htmlFor="mailbox">From</Label>
            <Select onValueChange={setMailbox} value={mailbox}>
              <SelectTrigger id="mailbox">
                <SelectValue placeholder="Select mailbox" />
              </SelectTrigger>
              <SelectContent>
                {mailboxData?.mailboxes.map((m) => (
                  <SelectItem key={m.email} value={m.email}>
                    {m.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* To / CC / Subject (only for new emails) */}
          {!isReply && (
            <>
              <div className="grid grid-cols-[80px_1fr] items-center gap-4">
                <Label htmlFor="to">To</Label>
                <Input
                  id="to"
                  onChange={(e) => setTo(e.target.value)}
                  placeholder="recipient@example.com, ..."
                  value={to}
                />
              </div>
              <div className="grid grid-cols-[80px_1fr] items-center gap-4">
                <Label htmlFor="cc">CC</Label>
                <Input
                  id="cc"
                  onChange={(e) => setCc(e.target.value)}
                  placeholder="cc@example.com, ... (optional)"
                  value={cc}
                />
              </div>
              <div className="grid grid-cols-[80px_1fr] items-center gap-4">
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Email subject"
                  value={subject}
                />
              </div>
            </>
          )}

          {/* Reply All toggle */}
          {isReply && (
            <div className="grid grid-cols-[80px_1fr] items-center gap-4">
              <Label>Reply to</Label>
              <div className="flex gap-2">
                <Button
                  onClick={() => setReplyAll(false)}
                  size="sm"
                  variant={replyAll ? "outline" : "default"}
                >
                  Reply
                </Button>
                <Button
                  onClick={() => setReplyAll(true)}
                  size="sm"
                  variant={replyAll ? "default" : "outline"}
                >
                  Reply All
                </Button>
              </div>
            </div>
          )}

          {/* Body */}
          <div className="grid grid-cols-[80px_1fr] items-start gap-4">
            <Label className="pt-2" htmlFor="body">
              Message
            </Label>
            <Textarea
              className="min-h-[200px]"
              id="body"
              onChange={(e) => setBody(e.target.value)}
              placeholder="Type your message..."
              value={body}
            />
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-destructive text-sm">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button disabled={loading} onClick={onClose} variant="outline">
            Cancel
          </Button>
          <Button
            disabled={!canSubmit || loading}
            onClick={() => handleSubmit("draft")}
            variant="secondary"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save Draft
          </Button>
          <Button
            disabled={!canSubmit || loading}
            onClick={() => handleSubmit("send")}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
