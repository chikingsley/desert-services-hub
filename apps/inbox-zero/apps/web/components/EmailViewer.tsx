"use client";

import { useCallback } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { EmailThread } from "@/components/email-list/EmailThread";
import { LoadingContent } from "@/components/LoadingContent";
import { MutedText } from "@/components/Typography";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useDisplayedEmail } from "@/hooks/useDisplayedEmail";
import { useThread } from "@/hooks/useThread";
import { useAccount } from "@/providers/EmailAccountProvider";
import { isGoogleProvider } from "@/utils/email/provider-types";

export function EmailViewer() {
  const { provider } = useAccount();

  const { threadId, showEmail, showReplyButton, autoOpenReplyForMessageId } =
    useDisplayedEmail();

  const hideEmail = useCallback(() => showEmail(null), [showEmail]);

  return (
    <Sheet onOpenChange={hideEmail} open={!!threadId}>
      <SheetContent
        className="overflow-y-auto bg-slate-100 p-0"
        overlay="transparent"
        side="right"
        size="5xl"
      >
        {isGoogleProvider(provider) ? (
          threadId && (
            <ThreadContent
              autoOpenReplyForMessageId={autoOpenReplyForMessageId ?? undefined}
              showReplyButton={showReplyButton}
              threadId={threadId}
            />
          )
        ) : (
          <div className="flex h-full items-center justify-center">
            <MutedText>This feature isn't enabled for Outlook.</MutedText>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function ThreadContent({
  threadId,
  showReplyButton,
  autoOpenReplyForMessageId,
  topRightComponent,
  onSendSuccess,
}: {
  threadId: string;
  showReplyButton: boolean;
  autoOpenReplyForMessageId?: string;
  topRightComponent?: React.ReactNode;
  onSendSuccess?: (messageId: string, threadId: string) => void;
}) {
  const { data, isLoading, error, mutate } = useThread(
    { id: threadId },
    {
      includeDrafts: true,
    }
  );

  return (
    <ErrorBoundary extra={{ component: "ThreadContent", threadId }}>
      <LoadingContent error={error} loading={isLoading}>
        {data && (
          <EmailThread
            autoOpenReplyForMessageId={autoOpenReplyForMessageId}
            key={data.thread.id}
            messages={data.thread.messages}
            onSendSuccess={onSendSuccess}
            refetch={mutate}
            showReplyButton={showReplyButton}
            topRightComponent={topRightComponent}
            withHeader
          />
        )}
      </LoadingContent>
    </ErrorBoundary>
  );
}
