"use client";

import sortBy from "lodash/sortBy";
import {
  CheckCircleIcon,
  CircleXIcon,
  HandIcon,
  RefreshCwIcon,
  ReplyIcon,
  XIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type RefCallback, useCallback, useState } from "react";
import { EmailMessageCell } from "@/components/EmailMessageCell";
import { ThreadContent } from "@/components/EmailViewer";
import { Loading } from "@/components/Loading";
import { TablePagination } from "@/components/TablePagination";
import { toastError, toastInfo, toastSuccess } from "@/components/Toast";
import { MutedText } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { CommandShortcut } from "@/components/ui/command";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import type { ThreadTracker } from "@/generated/prisma/client";
import { ThreadTrackerType } from "@/generated/prisma/enums";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTableKeyboardNavigation } from "@/hooks/useTableKeyboardNavigation";
import { useThreadsByIds } from "@/hooks/useThreadsByIds";
import { useAccount } from "@/providers/EmailAccountProvider";
import { cn } from "@/utils";
import { resolveThreadTrackerAction } from "@/utils/actions/reply-tracking";
import { formatShortDate, internalDateToDate } from "@/utils/date";
import { isGoogleProvider } from "@/utils/email/provider-types";
import type { ParsedMessage } from "@/utils/types";

export function ReplyTrackerEmails({
  trackers,
  emailAccountId,
  userEmail,
  type,
  isResolved,
  totalPages,
  isAnalyzing,
}: {
  trackers: ThreadTracker[];
  emailAccountId: string;
  userEmail: string;
  type?: ThreadTrackerType;
  isResolved?: boolean;
  totalPages: number;
  isAnalyzing: boolean;
}) {
  const { provider } = useAccount();
  const isGmail = isGoogleProvider(provider);

  const [selectedEmail, setSelectedEmail] = useState<{
    threadId: string;
    messageId: string;
  } | null>(null);
  const [resolvingThreads, setResolvingThreads] = useState<Set<string>>(
    new Set()
  );
  // When we send an email, it takes some time to process so we want to hide those from the "To Reply" UI
  // This will reshow on page refresh, but it's good enough for now.
  const [recentlySentThreads, setRecentlySentThreads] = useState<Set<string>>(
    new Set()
  );

  const { data, isLoading } = useThreadsByIds(
    {
      threadIds: trackers.map((t) => t.threadId),
    },
    { keepPreviousData: true }
  );

  const sortedThreads = sortBy(
    data?.threads.filter((t) => !recentlySentThreads.has(t.id)),
    (t) => -internalDateToDate(t.messages.at(-1)?.internalDate)
  );

  const handleResolve = useCallback(
    async (threadId: string, resolved: boolean) => {
      if (resolvingThreads.has(threadId)) {
        return;
      }

      setResolvingThreads((prev) => {
        const next = new Set(prev);
        next.add(threadId);
        return next;
      });

      const result = await resolveThreadTrackerAction(emailAccountId, {
        threadId,
        resolved,
      });

      if (result?.serverError) {
        toastError({
          title: "Error",
          description: result.serverError,
        });
      } else {
        toastSuccess({
          title: "Success",
          description: resolved ? "Marked as done!" : "Marked as not done!",
        });
      }

      setResolvingThreads((prev) => {
        const next = new Set(prev);
        next.delete(threadId);
        return next;
      });

      if (selectedEmail?.threadId === threadId) {
        setSelectedEmail(null);
      }
    },
    [resolvingThreads, selectedEmail, emailAccountId]
  );

  const handleAction = useCallback(
    async (index: number, action: "reply" | "resolve" | "unresolve") => {
      const thread = sortedThreads[index];
      if (!thread) {
        return;
      }

      const message = thread.messages.at(-1)!;

      if (action === "reply") {
        if (!isGmail) {
          showReplyNotSupportedToast();
          return;
        }
        setSelectedEmail({ threadId: thread.id, messageId: message.id });
      } else if (action === "resolve") {
        await handleResolve(thread.id, true);
      } else if (action === "unresolve") {
        await handleResolve(thread.id, false);
      }
    },
    [sortedThreads, handleResolve, isGmail]
  );

  const { selectedIndex, setSelectedIndex, getRefCallback } =
    useReplyTrackerKeyboardNav(sortedThreads, handleAction);

  const onSendSuccess = useCallback(
    async (_messageId: string, threadId: string) => {
      // If this is a "To Reply" thread
      // add it to recently sent threads to hide it immediately
      if (type === ThreadTrackerType.NEEDS_REPLY) {
        setRecentlySentThreads((prev) => {
          const next = new Set(prev);
          next.add(threadId);
          return next;
        });

        // Remove from recently sent after 3 minutes
        const timeout = 3 * 60 * 1000;
        setTimeout(() => {
          setRecentlySentThreads((prev) => {
            const next = new Set(prev);
            next.delete(threadId);
            return next;
          });
        }, timeout);
      }
    },
    [type]
  );

  const isMobile = useIsMobile();

  if (isLoading && !data) {
    return <Loading />;
  }

  if (!data?.threads.length) {
    return (
      <div className="mt-2">
        <EmptyState isAnalyzing={isAnalyzing} message="No emails yet!" />
      </div>
    );
  }

  const listView = (
    <>
      <Table>
        <TableBody>
          {sortedThreads.map((thread, index) => {
            const message = thread.messages.at(-1);
            if (!message) {
              return null;
            }
            return (
              <Row
                isResolved={isResolved}
                isResolving={resolvingThreads.has(thread.id)}
                isSelected={index === selectedIndex}
                isSplitViewOpen={!!selectedEmail}
                key={thread.id}
                message={message}
                onResolve={handleResolve}
                onSelect={() => setSelectedIndex(index)}
                rowRef={getRefCallback(index)}
                setSelectedEmail={setSelectedEmail}
                type={type}
                userEmail={userEmail}
              />
            );
          })}
        </TableBody>
      </Table>
      <TablePagination totalPages={totalPages} />
    </>
  );

  if (!selectedEmail) {
    return listView;
  }

  return (
    // hacky. this will break if other parts of the layout change
    <div className="h-[calc(100vh-7.5rem)]">
      <ResizablePanelGroup
        className="h-full"
        direction={isMobile ? "vertical" : "horizontal"}
      >
        <ResizablePanel defaultSize={35} minSize={0}>
          <div className="h-full overflow-y-auto">{listView}</div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel className="bg-secondary" defaultSize={65} minSize={0}>
          <div className="h-full overflow-y-auto">
            <ThreadContent
              autoOpenReplyForMessageId={selectedEmail.messageId}
              onSendSuccess={
                type === ThreadTrackerType.NEEDS_REPLY
                  ? onSendSuccess
                  : undefined
              }
              showReplyButton={true}
              threadId={selectedEmail.threadId}
              topRightComponent={
                <div className="flex items-center gap-1">
                  {trackers.find((t) => t.threadId === selectedEmail.threadId)
                    ?.resolved ? (
                    <UnresolveButton
                      isLoading={resolvingThreads.has(selectedEmail.threadId)}
                      onResolve={handleResolve}
                      showShortcut={false}
                      threadId={selectedEmail.threadId}
                    />
                  ) : (
                    <ResolveButton
                      isLoading={resolvingThreads.has(selectedEmail.threadId)}
                      onResolve={handleResolve}
                      showShortcut={false}
                      threadId={selectedEmail.threadId}
                    />
                  )}
                  <Button
                    onClick={() => setSelectedEmail(null)}
                    size="icon"
                    variant="ghost"
                  >
                    <XIcon className="size-4" />
                  </Button>
                </div>
              }
            />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

function Row({
  message,
  userEmail,
  isResolved,
  type,
  setSelectedEmail,
  isSplitViewOpen,
  isSelected,
  onResolve,
  isResolving,
  onSelect,
  rowRef,
}: {
  message: ParsedMessage;
  userEmail: string;
  isResolved?: boolean;
  type?: ThreadTrackerType;
  setSelectedEmail: (email: { threadId: string; messageId: string }) => void;
  isSplitViewOpen: boolean;
  isSelected: boolean;
  onResolve: (threadId: string, resolved: boolean) => Promise<void>;
  isResolving: boolean;
  onSelect: () => void;
  rowRef: RefCallback<HTMLTableRowElement>;
}) {
  const openSplitView = useCallback(() => {
    setSelectedEmail({
      threadId: message.threadId,
      messageId: message.id,
    });
  }, [message.id, message.threadId, setSelectedEmail]);

  return (
    <TableRow
      className={cn(
        "transition-colors duration-100 hover:bg-background",
        isSelected &&
          "bg-blue-50 hover:bg-blue-50 dark:bg-slate-800 dark:hover:bg-slate-800"
      )}
      onMouseEnter={onSelect}
      ref={rowRef}
    >
      <TableCell className="py-8 pr-6 pl-8" onClick={openSplitView}>
        <div className="flex items-center justify-between">
          <EmailMessageCell
            filterReplyTrackerLabels
            hideViewEmailButton
            labelIds={message.labelIds}
            messageId={message.id}
            sender={
              message.labelIds?.includes("SENT")
                ? message.headers.to
                : message.headers.from
            }
            snippet={message.snippet}
            subject={message.headers.subject}
            threadId={message.threadId}
            userEmail={userEmail}
          />

          {/* biome-ignore lint/a11y/useKeyWithClickEvents: buttons inside handle keyboard events */}
          <div
            className={cn(
              "ml-4 flex items-center gap-1.5",
              isSplitViewOpen && "flex-col"
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <MutedText className="mr-4 text-nowrap">
              {formatShortDate(internalDateToDate(message.internalDate))}
            </MutedText>

            {isResolved ? (
              <UnresolveButton
                isLoading={isResolving}
                onResolve={onResolve}
                showShortcut
                threadId={message.threadId}
              />
            ) : (
              <>
                {!!type && <NudgeButton onClick={openSplitView} type={type} />}
                <ResolveButton
                  isLoading={isResolving}
                  onResolve={onResolve}
                  showShortcut
                  threadId={message.threadId}
                />
              </>
            )}
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}

function NudgeButton({
  type,
  onClick,
}: {
  type: ThreadTrackerType;
  onClick: () => void;
}) {
  const showNudge = type === ThreadTrackerType.AWAITING;
  const { provider } = useAccount();
  const isGmail = isGoogleProvider(provider);

  const handleClick = () => {
    if (!isGmail) {
      showReplyNotSupportedToast();
      return;
    }
    onClick();
  };

  return (
    <Button
      className="w-full"
      Icon={showNudge ? HandIcon : ReplyIcon}
      onClick={handleClick}
    >
      {showNudge ? "Nudge" : "Reply"}
      <CommandShortcut className="ml-2">R</CommandShortcut>
    </Button>
  );
}

function ResolveButton({
  threadId,
  onResolve,
  isLoading,
  showShortcut,
}: {
  threadId: string;
  onResolve: (threadId: string, resolved: boolean) => Promise<void>;
  isLoading: boolean;
  showShortcut: boolean;
}) {
  return (
    <Button
      className="w-full"
      Icon={CheckCircleIcon}
      loading={isLoading}
      onClick={() => onResolve(threadId, true)}
      variant="outline"
    >
      Mark Done
      {showShortcut && <CommandShortcut className="ml-2">D</CommandShortcut>}
    </Button>
  );
}

function UnresolveButton({
  threadId,
  onResolve,
  isLoading,
  showShortcut,
}: {
  threadId: string;
  onResolve: (threadId: string, resolved: boolean) => Promise<void>;
  isLoading: boolean;
  showShortcut: boolean;
}) {
  return (
    <Button
      className="w-full"
      Icon={CircleXIcon}
      loading={isLoading}
      onClick={() => onResolve(threadId, false)}
      variant="outline"
    >
      Not Done
      {showShortcut && <CommandShortcut className="ml-2">N</CommandShortcut>}
    </Button>
  );
}

function EmptyState({
  message,
  isAnalyzing,
}: {
  message: string;
  isAnalyzing: boolean;
}) {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);

  return (
    <div className="content-container">
      <div className="fade-in-50 flex min-h-[200px] animate-in flex-col items-center justify-center rounded-md border border-dashed bg-muted p-8 text-center">
        {isAnalyzing ? (
          <>
            <MutedText>Analyzing your emails...</MutedText>
            <Button
              className="mt-4"
              Icon={RefreshCwIcon}
              loading={isRefreshing}
              onClick={async () => {
                setIsRefreshing(true);
                router.refresh();
                // Reset loading after a short delay
                setTimeout(() => setIsRefreshing(false), 1000);
              }}
              variant="outline"
            >
              Refresh
            </Button>
          </>
        ) : (
          <MutedText>{message}</MutedText>
        )}
      </div>
    </div>
  );
}

function useReplyTrackerKeyboardNav(
  items: { id: string }[],
  onAction: (
    index: number,
    action: "reply" | "resolve" | "unresolve"
  ) => Promise<void>
) {
  const handleKeyAction = useCallback(
    (index: number, key: string) => {
      if (key === "r") {
        onAction(index, "reply");
      } else if (key === "d") {
        onAction(index, "resolve");
      } else if (key === "n") {
        onAction(index, "unresolve");
      }
    },
    [onAction]
  );

  const { selectedIndex, setSelectedIndex, getRefCallback } =
    useTableKeyboardNavigation({
      items,
      onKeyAction: handleKeyAction,
    });

  return { selectedIndex, setSelectedIndex, getRefCallback };
}

function showReplyNotSupportedToast() {
  toastInfo({
    title: "Reply in your email client",
    description:
      "Please use your email client to reply. Replying from within Inbox Zero not yet supported for Microsoft accounts.",
    duration: 5000,
  });
}
