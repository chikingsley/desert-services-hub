import { useMemo, useState } from "react";
import { EmailMessage } from "@/components/email-list/EmailMessage";
import type { ThreadMessage } from "@/components/email-list/types";

export function EmailThread({
  messages,
  refetch,
  showReplyButton,
  autoOpenReplyForMessageId,
  topRightComponent,
  onSendSuccess,
  withHeader,
}: {
  messages: ThreadMessage[];
  refetch: () => void;
  showReplyButton: boolean;
  autoOpenReplyForMessageId?: string;
  topRightComponent?: React.ReactNode;
  onSendSuccess?: (messageId: string, threadId: string) => void;
  withHeader?: boolean;
}) {
  // Place draft messages as replies to their parent message
  const organizedMessages = useMemo(() => {
    const drafts = new Map<string, ThreadMessage>();
    const regularMessages: ThreadMessage[] = [];

    messages?.forEach((message) => {
      if (message.labelIds?.includes("DRAFT")) {
        // Get the parent message ID from the references or in-reply-to header
        const parentId =
          message.headers.references?.split(" ").pop() ||
          message.headers["in-reply-to"];
        if (parentId) {
          drafts.set(parentId, message);
        }
      } else {
        regularMessages.push(message);
      }
    });

    return regularMessages.map((message) => ({
      message,
      draftMessage: drafts.get(message.headers["message-id"] || ""),
    }));
  }, [messages]);

  const lastMessageId = organizedMessages.at(-1)?.message.id;

  const [expandedMessageIds, setExpandedMessageIds] = useState<Set<string>>(
    new Set(lastMessageId ? [lastMessageId] : [])
  );

  return (
    <div className="flex-1 overflow-auto bg-muted p-4">
      {withHeader && (
        <div className="flex items-center justify-between">
          <div className="font-semibold text-2xl text-foreground">
            {messages[0]?.headers.subject}
          </div>
          {topRightComponent && (
            <div className="flex items-center gap-2">{topRightComponent}</div>
          )}
        </div>
      )}
      <ul className="mt-4 space-y-2 sm:space-y-4">
        {organizedMessages.map(({ message, draftMessage }) => {
          const defaultShowReply =
            autoOpenReplyForMessageId === message.id || Boolean(draftMessage);
          return (
            <EmailMessage
              defaultShowReply={defaultShowReply}
              draftMessage={draftMessage}
              expanded={expandedMessageIds.has(message.id)}
              generateNudge={defaultShowReply && !draftMessage?.textHtml}
              key={message.id}
              message={message}
              onExpand={() => {
                setExpandedMessageIds((prev) => {
                  if (prev.has(message.id)) {
                    return prev;
                  }
                  return new Set(prev).add(message.id);
                });
              }}
              onSendSuccess={(messageId) => {
                setExpandedMessageIds((prev) => {
                  if (prev.has(messageId)) {
                    return prev;
                  }
                  return new Set(prev).add(messageId);
                });

                onSendSuccess?.(messageId, message.threadId);
              }}
              refetch={refetch}
              showReplyButton={showReplyButton}
            />
          );
        })}
      </ul>
    </div>
  );
}
