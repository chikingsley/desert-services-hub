import {
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  ForwardIcon,
  ReplyIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReplyingToEmail } from "@/app/(app)/[emailAccountId]/compose/ComposeEmailForm";
import { ComposeEmailFormLazy } from "@/app/(app)/[emailAccountId]/compose/ComposeEmailFormLazy";
import { EmailAttachments } from "@/components/email-list/EmailAttachments";
import { HtmlEmail, PlainEmail } from "@/components/email-list/EmailContents";
import { EmailDetails } from "@/components/email-list/EmailDetails";
import type { ThreadMessage } from "@/components/email-list/types";
import { Loading } from "@/components/Loading";
import { Tooltip } from "@/components/Tooltip";
import { MessageText, MutedText } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAccount } from "@/providers/EmailAccountProvider";
import { cn } from "@/utils";
import { generateNudgeReplyAction } from "@/utils/actions/generate-reply";
import { formatShortDate } from "@/utils/date";
import { extractNameFromEmail } from "@/utils/email";
import { formatReplySubject } from "@/utils/email/subject";
import { forwardEmailHtml, forwardEmailSubject } from "@/utils/gmail/forward";
import { createReplyContent } from "@/utils/gmail/reply";
import { extractEmailReply } from "@/utils/parse/extract-reply.client";
import type { ParsedMessage } from "@/utils/types";

export function EmailMessage({
  message,
  refetch,
  showReplyButton,
  defaultShowReply,
  draftMessage,
  expanded,
  onExpand,
  onSendSuccess,
  generateNudge,
}: {
  message: ThreadMessage;
  draftMessage?: ThreadMessage;
  refetch: () => void;
  showReplyButton: boolean;
  defaultShowReply?: boolean;
  expanded: boolean;
  onExpand: () => void;
  onSendSuccess: (messageId: string, threadId: string) => void;
  generateNudge?: boolean;
}) {
  const [showReply, setShowReply] = useState(defaultShowReply ?? false);
  const [showDetails, setShowDetails] = useState(false);

  const onReply = useCallback(() => setShowReply(true), []);
  const [showForward, setShowForward] = useState(false);
  const onForward = useCallback(() => setShowForward(true), []);

  const onCloseCompose = useCallback(() => {
    setShowReply(false);
    setShowForward(false);
  }, []);

  const toggleDetails = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDetails((prev) => !prev);
  }, []);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: ignore
    <li
      className={cn(
        "bg-background p-4 shadow sm:rounded-lg",
        !expanded && "cursor-pointer"
      )}
      onClick={onExpand}
    >
      <TopBar
        expanded={expanded}
        message={message}
        onForward={onForward}
        onReply={onReply}
        showDetails={showDetails}
        showReplyButton={showReplyButton}
        toggleDetails={toggleDetails}
      />

      {expanded && (
        <>
          {showDetails && <EmailDetails message={message} />}

          {message.textHtml ? (
            <HtmlEmail html={message.textHtml} />
          ) : (
            <PlainEmail text={message.textPlain || ""} />
          )}

          {message.attachments && <EmailAttachments message={message} />}

          {(showReply || showForward) && (
            <ReplyPanel
              defaultShowReply={defaultShowReply}
              draftMessage={draftMessage}
              generateNudge={generateNudge}
              message={message}
              onCloseCompose={onCloseCompose}
              onSendSuccess={onSendSuccess}
              refetch={refetch}
              showReply={showReply}
            />
          )}
        </>
      )}
    </li>
  );
}

function TopBar({
  message,
  expanded,
  showDetails,
  toggleDetails,
  showReplyButton,
  onReply,
  onForward,
}: {
  message: ParsedMessage;
  expanded: boolean;
  showDetails: boolean;
  toggleDetails: (e: React.MouseEvent) => void;
  showReplyButton: boolean;
  onReply: () => void;
  onForward: () => void;
}) {
  return (
    <div className="sm:flex sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <div className="flex items-center">
          <h3 className="font-medium text-base">
            <span className="text-foreground">
              {message.labelIds?.includes("SENT")
                ? "Me"
                : extractNameFromEmail(message.headers.from)}
            </span>{" "}
            {expanded && <span className="text-muted-foreground">wrote</span>}
          </h3>
        </div>
        {expanded && (
          <Button
            className="size-6 p-0"
            onClick={toggleDetails}
            size="sm"
            variant="ghost"
          >
            {showDetails ? (
              <ChevronsDownUpIcon className="size-4" />
            ) : (
              <ChevronsUpDownIcon className="size-4" />
            )}
          </Button>
        )}
      </div>
      <div className="flex items-center space-x-2">
        <MutedText className="mt-1 whitespace-nowrap sm:mt-0 sm:ml-3">
          <time dateTime={message.headers.date}>
            {formatShortDate(new Date(message.headers.date))}
          </time>
        </MutedText>
        {showReplyButton && (
          <div className="relative flex items-center">
            <Tooltip content="Reply">
              <Button onClick={onReply} size="icon" variant="ghost">
                <ReplyIcon className="h-4 w-4" />
                <span className="sr-only">Reply</span>
              </Button>
            </Tooltip>
            <Tooltip content="Forward">
              <Button size="icon" variant="ghost">
                <ForwardIcon className="h-4 w-4" onClick={onForward} />
                <span className="sr-only">Forward</span>
              </Button>
            </Tooltip>
          </div>
        )}
      </div>
    </div>
  );
}

function ReplyPanel({
  message,
  refetch,
  onSendSuccess,
  onCloseCompose,
  defaultShowReply,
  showReply,
  draftMessage,
  generateNudge,
}: {
  message: ParsedMessage;
  refetch: () => void;
  onSendSuccess: (messageId: string, threadId: string) => void;
  onCloseCompose: () => void;
  defaultShowReply?: boolean;
  showReply: boolean;
  draftMessage?: ThreadMessage;
  generateNudge?: boolean;
}) {
  const { emailAccountId } = useAccount();

  const replyRef = useRef<HTMLDivElement>(null);

  const [isGeneratingReply, setIsGeneratingReply] = useState(false);
  const [reply, setReply] = useState<string | null>(null);
  // scroll to the reply panel when it first opens
  useEffect(() => {
    if (defaultShowReply && replyRef.current) {
      // hacky using setTimeout
      setTimeout(() => {
        replyRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      }, 500);
    }
  }, [defaultShowReply]);

  useEffect(() => {
    async function generateReply() {
      const isSent = message.labelIds?.includes("SENT");

      // Doesn't need a nudge if it's not sent
      if (!isSent) {
        return;
      }

      setIsGeneratingReply(true);

      const result = await generateNudgeReplyAction(emailAccountId, {
        messages: [
          {
            id: message.id,
            textHtml: message.textHtml,
            textPlain: message.textPlain,
            date: message.headers.date,
            from: message.headers.from,
            to: message.headers.to,
            subject: message.headers.subject,
          },
        ],
      });
      if (result?.serverError) {
        console.error(result);
        setReply("");
      } else {
        setReply(result?.data?.text || "");
      }
      setIsGeneratingReply(false);
    }

    // Only generate a nudge if there's no draft message and generateNudge is true
    if (generateNudge && !draftMessage) {
      generateReply();
    }
  }, [generateNudge, message, draftMessage, emailAccountId]);

  const replyingToEmail: ReplyingToEmail = useMemo(() => {
    if (showReply) {
      if (draftMessage) {
        return prepareDraftReplyEmail(draftMessage);
      }

      // use nudge if available
      if (reply) {
        // Convert nudge text into HTML paragraphs
        const replyHtml = reply
          ? reply
              .split("\n")
              .filter((line) => line.trim())
              .map((line) => `<p>${line}</p>`)
              .join("")
          : "";

        return prepareReplyingToEmail(message, replyHtml);
      }

      return prepareReplyingToEmail(message);
    }
    return prepareForwardingEmail(message);
  }, [showReply, message, draftMessage, reply]);

  return (
    <>
      <Separator className="my-4" />

      <div ref={replyRef}>
        {isGeneratingReply ? (
          <div className="flex items-center justify-center">
            <Loading />
            <MessageText>Generating reply...</MessageText>
            <Button
              className="ml-4"
              onClick={() => {
                setIsGeneratingReply(false);
              }}
              size="sm"
              variant="outline"
            >
              Skip
            </Button>
          </div>
        ) : (
          <ComposeEmailFormLazy
            onDiscard={onCloseCompose}
            onSuccess={(messageId, threadId) => {
              onSendSuccess(messageId, threadId);
              onCloseCompose();
            }}
            refetch={refetch}
            replyingToEmail={replyingToEmail}
          />
        )}
      </div>
    </>
  );
}

const prepareReplyingToEmail = (
  message: ParsedMessage,
  content = ""
): ReplyingToEmail => {
  const sentFromUser = message.labelIds?.includes("SENT");

  const { html } = createReplyContent({ message });

  return {
    // If following an email from yourself, use original recipients, otherwise reply to sender
    to: sentFromUser ? message.headers.to : message.headers.from,
    // If following an email from yourself, don't add "Re:" prefix
    subject: sentFromUser
      ? message.headers.subject
      : formatReplySubject(message.headers.subject),
    headerMessageId: message.headers["message-id"] || undefined,
    messageId: message.id || undefined,
    threadId: message.threadId || undefined,
    // Keep original CC
    cc: message.headers.cc,
    // Keep original BCC if available
    bcc: sentFromUser ? message.headers.bcc : "",
    references: message.headers.references,
    draftHtml: content || "",
    quotedContentHtml: html,
  };
};

const prepareForwardingEmail = (message: ParsedMessage): ReplyingToEmail => ({
  to: "",
  subject: forwardEmailSubject(message.headers.subject),
  headerMessageId: undefined,
  threadId: message.threadId || undefined,
  cc: "",
  references: "",
  draftHtml: forwardEmailHtml({ content: "", message }),
  quotedContentHtml: "",
});

function prepareDraftReplyEmail(draft: ParsedMessage): ReplyingToEmail {
  const splitHtml = extractEmailReply(draft.textHtml || "");

  return {
    to: draft.headers.to,
    subject: draft.headers.subject,
    headerMessageId: draft.headers["message-id"] || undefined,
    messageId: draft.id || undefined,
    threadId: draft.threadId || undefined,
    cc: draft.headers.cc,
    bcc: draft.headers.bcc,
    references: draft.headers.references,
    draftHtml: splitHtml.draftHtml,
    quotedContentHtml: splitHtml.originalHtml,
  };
}
