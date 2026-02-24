import type { UseChatHelpers } from "@ai-sdk/react";
import { Fragment, type ReactNode, useMemo } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Loader } from "@/components/ai-elements/loader";
import { Message, MessageContent } from "@/components/ai-elements/message";
import type { ThreadLookup } from "@/components/assistant-chat/tools";
import type { ChatMessage } from "@/components/assistant-chat/types";
import { MessagePart } from "./message-part";
import { MessagingChannelHint } from "./messaging-channel-hint";
import { Overview } from "./overview";

interface MessagesProps {
  footer?: ReactNode;
  isArtifactVisible: boolean;
  messages: Array<ChatMessage>;
  regenerate: UseChatHelpers<ChatMessage>["regenerate"];
  setInput: (input: string) => void;
  setMessages: UseChatHelpers<ChatMessage>["setMessages"];
  status: UseChatHelpers<ChatMessage>["status"];
}

export function Messages({
  status,
  messages,
  setInput,
  footer,
}: MessagesProps) {
  const threadLookup = useMemo(() => buildThreadLookup(messages), [messages]);
  const firstAssistantIndex = useMemo(
    () => messages.findIndex((m) => m.role === "assistant"),
    [messages]
  );

  return (
    <Conversation className="flex min-w-0 flex-1">
      <ConversationContent
        className="mx-auto flex min-h-full max-w-[calc(var(--chat-max-w)+var(--chat-px)*2)] flex-col px-[var(--chat-px)] pt-0 pb-0"
        scrollClassName="![scrollbar-gutter:auto] scrollbar-thin"
      >
        <div className="flex flex-1 flex-col gap-6">
          {messages.length === 0 && <Overview setInput={setInput} />}

          {messages.map((message, index) => (
            <Fragment key={message.id}>
              <Message from={message.role}>
                <MessageContent variant="flat">
                  {message.parts?.map((part, partIndex) => (
                    <MessagePart
                      isStreaming={status === "streaming"}
                      key={`${message.id}-${partIndex}`}
                      messageId={message.id}
                      part={part}
                      partIndex={partIndex}
                      threadLookup={threadLookup}
                    />
                  ))}
                </MessageContent>
              </Message>
              {index === firstAssistantIndex && <MessagingChannelHint />}
            </Fragment>
          ))}

          {status === "submitted" &&
            messages.length > 0 &&
            messages[messages.length - 1].role === "user" && (
              <Message from="assistant">
                <MessageContent variant="flat">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader />
                    <span>Thinking...</span>
                  </div>
                </MessageContent>
              </Message>
            )}
        </div>

        {footer && (
          <div className="pointer-events-none relative sticky bottom-0 z-10 pb-4 md:pb-6 [&>*]:pointer-events-auto">
            <ConversationScrollButton wrapperClassName="absolute bottom-full left-1/2 -translate-x-1/2 mb-2" />
            {footer}
          </div>
        )}
      </ConversationContent>
    </Conversation>
  );
}

function buildThreadLookup(messages: Array<ChatMessage>): ThreadLookup {
  const lookup: ThreadLookup = new Map();
  for (const message of messages) {
    for (const part of message.parts ?? []) {
      if (
        part.type === "tool-searchInbox" &&
        part.state === "output-available"
      ) {
        const output = part.output as Record<string, unknown> | undefined;
        const items = output?.messages as
          | Array<{
              threadId: string;
              subject: string;
              from: string;
              snippet: string;
            }>
          | undefined;
        if (!items) {
          continue;
        }
        for (const item of items) {
          if (!lookup.has(item.threadId)) {
            lookup.set(item.threadId, {
              subject: item.subject,
              from: item.from,
              snippet: item.snippet,
            });
          }
        }
      }
    }
  }
  return lookup;
}
