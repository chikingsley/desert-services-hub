"use client";

import { ChevronsDownIcon } from "lucide-react";
import Link from "next/link";
import { useQueryState } from "nuqs";
import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ActionButtonsBulk } from "@/components/ActionButtonsBulk";
import { AlertBasic } from "@/components/Alert";
import { Celebration } from "@/components/Celebration";
import { Checkbox } from "@/components/Checkbox";
import { EmailListItem } from "@/components/email-list/EmailListItem";
import { EmailPanel } from "@/components/email-list/EmailPanel";
import type { Thread } from "@/components/email-list/types";
import { GroupHeading } from "@/components/GroupHeading";
import { ButtonLoader } from "@/components/Loading";
import { Tabs } from "@/components/Tabs";
import { MessageText } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  archiveEmails,
  deleteEmails,
  markReadThreads,
} from "@/store/archive-queue";
import { prefixPath } from "@/utils/path";
import { runAiRules } from "@/utils/queue/email-actions";

export function List({
  emails,
  type,
  refetch,
  showLoadMore,
  isLoadingMore,
  handleLoadMore,
}: {
  emails: Thread[];
  type?: string;
  refetch: (options?: { removedThreadIds?: string[] }) => void;
  showLoadMore?: boolean;
  isLoadingMore?: boolean;
  handleLoadMore?: () => void;
}) {
  const { emailAccountId } = useAccount();
  const [selectedTab] = useQueryState("tab", { defaultValue: "all" });

  const planned = useMemo(() => {
    return emails.filter((email) => email.plan?.rule);
  }, [emails]);

  const tabs = useMemo(
    () => [
      {
        label: "All",
        value: "all",
        href: "/mail?tab=all",
      },
      {
        label: `Planned${planned.length ? ` (${planned.length})` : ""}`,
        value: "planned",
        href: "/mail?tab=planned",
      },
    ],
    [planned]
  );

  // only show tabs if there are planned emails or categorized emails
  const showTabs = !!planned.length;

  const filteredEmails = useMemo(() => {
    if (selectedTab === "planned") {
      return planned;
    }

    if (selectedTab === "all") {
      return emails;
    }

    return emails;
  }, [emails, selectedTab, planned]);

  return (
    <>
      {showTabs && (
        <div className="border-gray-200 border-b">
          <GroupHeading
            leftContent={
              <div className="overflow-x-auto py-2 md:max-w-lg lg:max-w-xl xl:max-w-3xl 2xl:max-w-4xl">
                <Tabs breakpoint="xs" selected={selectedTab} tabs={tabs} />
              </div>
            }
          />
        </div>
      )}
      {emails.length ? (
        <EmailList
          emptyMessage={
            <div className="px-2">
              {selectedTab === "planned" ? (
                <AlertBasic
                  description={
                    <>
                      Set rules on the{" "}
                      <Link
                        className="font-semibold hover:underline"
                        href={prefixPath(emailAccountId, "/automation")}
                      >
                        Assistant page
                      </Link>{" "}
                      for our AI to handle incoming emails for you.
                    </>
                  }
                  title="No planned emails"
                />
              ) : (
                <AlertBasic
                  description="Great work!"
                  title="All emails handled"
                />
              )}
            </div>
          }
          handleLoadMore={handleLoadMore}
          isLoadingMore={isLoadingMore}
          refetch={refetch}
          showLoadMore={showLoadMore}
          threads={filteredEmails}
        />
      ) : (
        <div className="mt-20">
          {type === "inbox" ? (
            <Celebration message={"You made it to Inbox Zero!"} />
          ) : (
            <div className="flex items-center justify-center font-title text-2xl text-primary">
              No emails to display
            </div>
          )}
        </div>
      )}
    </>
  );
}

export function EmailList({
  threads = [],
  emptyMessage,
  hideActionBarWhenEmpty,
  refetch = () => {},
  showLoadMore,
  isLoadingMore,
  handleLoadMore,
}: {
  threads?: Thread[];
  emptyMessage?: React.ReactNode;
  hideActionBarWhenEmpty?: boolean;
  refetch?: (options?: { removedThreadIds?: string[] }) => void;
  showLoadMore?: boolean;
  isLoadingMore?: boolean;
  handleLoadMore?: () => void;
}) {
  const { emailAccountId, userEmail, provider } = useAccount();

  // if right panel is open
  const [openThreadId, setOpenThreadId] = useQueryState("thread-id");
  const closePanel = useCallback(
    () => setOpenThreadId(null),
    [setOpenThreadId]
  );

  const openedRow = useMemo(
    () => threads.find((thread) => thread.id === openThreadId),
    [openThreadId, threads]
  );

  // if checkbox for a row has been checked
  const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({});

  const onSetSelectedRow = useCallback((id: string) => {
    setSelectedRows((s) => ({ ...s, [id]: !s[id] }));
  }, []);

  const isAllSelected = useMemo(() => {
    return threads.every((thread) => selectedRows[thread.id]);
  }, [threads, selectedRows]);

  const onToggleSelectAll = useCallback(() => {
    const newState = { ...selectedRows };
    for (const thread of threads) {
      newState[thread.id] = !isAllSelected;
    }
    setSelectedRows(newState);
  }, [threads, isAllSelected, selectedRows]);

  const onPlanAiAction = useCallback(
    (thread: Thread) => {
      toast.promise(() => runAiRules(emailAccountId, [thread], true), {
        success: "Running...",
        error: "There was an error running the AI rules :(",
      });
    },
    [emailAccountId]
  );

  const onArchive = useCallback(
    (thread: Thread) => {
      const threadIds = [thread.id];
      toast.promise(
        async () => {
          await new Promise<void>((resolve, reject) => {
            archiveEmails({
              threadIds,
              onSuccess: () => {
                refetch({ removedThreadIds: [thread.id] });
                resolve();
              },
              onError: reject,
              emailAccountId,
            });
          });
        },
        {
          loading: "Archiving...",
          success: "Archived!",
          error: "There was an error archiving the email :(",
        }
      );
    },
    [refetch, emailAccountId]
  );

  const listRef = useRef<HTMLUListElement>(null);
  const itemsRef = useRef<Map<string, HTMLLIElement> | null>(null);

  // https://react.dev/learn/manipulating-the-dom-with-refs#how-to-manage-a-list-of-refs-using-a-ref-callback
  function getMap() {
    if (!itemsRef.current) {
      // Initialize the Map on first usage.
      itemsRef.current = new Map();
    }
    return itemsRef.current;
  }

  // to scroll to a row when the side panel is opened
  function scrollToId(threadId: string) {
    const map = getMap();
    const node = map.get(threadId);

    // let the panel open first
    setTimeout(() => {
      if (listRef.current && node) {
        // Calculate the position of the item relative to the container
        const topPos = node.offsetTop - 117;

        // Scroll the container to the item
        listRef.current.scrollTop = topPos;
      }
    }, 100);
  }

  function advanceToAdjacentThread() {
    const openedRowIndex = threads.findIndex(
      (thread) => thread.id === openThreadId
    );

    if (openedRowIndex === -1 || threads.length === 0 || threads.length === 1) {
      closePanel();
      return;
    }

    const rowIndex =
      openedRowIndex < threads.length - 1
        ? openedRowIndex + 1
        : openedRowIndex - 1;

    const prevOrNextRowId = threads[rowIndex].id;
    setOpenThreadId(prevOrNextRowId);
  }

  const onArchiveBulk = useCallback(async () => {
    toast.promise(
      async () => {
        const threadIds = Object.entries(selectedRows)
          .filter(([, selected]) => selected)
          .map(([id]) => id);

        await new Promise<void>((resolve, reject) => {
          archiveEmails({
            threadIds,
            onSuccess: () => {
              refetch({ removedThreadIds: threadIds });
              resolve();
            },
            onError: reject,
            emailAccountId,
          });
        });
      },
      {
        loading: "Archiving emails...",
        success: "Emails archived",
        error: "There was an error archiving the emails :(",
      }
    );
  }, [selectedRows, refetch, emailAccountId]);

  const onTrashBulk = useCallback(async () => {
    toast.promise(
      async () => {
        const threadIds = Object.entries(selectedRows)
          .filter(([, selected]) => selected)
          .map(([id]) => id);

        await new Promise<void>((resolve, reject) => {
          deleteEmails({
            threadIds,
            onSuccess: () => {
              refetch({ removedThreadIds: threadIds });
              resolve();
            },
            onError: reject,
            emailAccountId,
          });
        });
      },
      {
        loading: "Deleting emails...",
        success: "Emails deleted!",
        error: "There was an error deleting the emails :(",
      }
    );
  }, [selectedRows, refetch, emailAccountId]);

  const onPlanAiBulk = useCallback(async () => {
    toast.promise(
      async () => {
        const selectedThreads = Object.entries(selectedRows)
          .filter(([, selected]) => selected)
          .map(([id]) => threads.find((t) => t.id === id)!);

        runAiRules(emailAccountId, selectedThreads, false);
        // runAiRules(threadIds, () => refetch(threadIds));
      },
      {
        success: "Running AI rules...",
        error: "There was an error running the AI rules :(",
      }
    );
  }, [emailAccountId, selectedRows, threads]);

  const isEmpty = threads.length === 0;

  return (
    <>
      {!(isEmpty && hideActionBarWhenEmpty) && (
        <div className="flex items-center border-border border-b border-l-4 bg-background px-4 py-1">
          <div className="pl-1">
            <Checkbox checked={isAllSelected} onChange={onToggleSelectAll} />
          </div>
          <div className="ml-2">
            <ActionButtonsBulk
              isArchiving={false}
              isDeleting={false}
              isPlanning={false}
              onArchive={onArchiveBulk}
              onDelete={onTrashBulk}
              onPlanAiAction={onPlanAiBulk}
            />
          </div>
          {/* <div className="ml-auto gap-1 flex items-center">
            <Button variant="ghost" size='icon'>
              <ChevronLeftIcon className='h-4 w-4' />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost">Today</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem>All</DropdownMenuItem>
                <DropdownMenuItem>Today</DropdownMenuItem>
                <DropdownMenuItem>Yesterday</DropdownMenuItem>
                <DropdownMenuItem>Last week</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button variant="ghost" size='icon'>
              <ChevronRightIcon className='h-4 w-4' />
            </Button>
          </div> */}
        </div>
      )}

      {isEmpty ? (
        <div className="py-2">
          {typeof emptyMessage === "string" ? (
            <MessageText>{emptyMessage}</MessageText>
          ) : (
            emptyMessage
          )}
        </div>
      ) : (
        <ResizeGroup
          left={
            <ul
              className="divide-y divide-border overflow-y-auto scroll-smooth"
              ref={listRef}
            >
              {threads.map((thread) => {
                const onOpen = () => {
                  const alreadyOpen = !!openThreadId;
                  setOpenThreadId(thread.id);

                  if (!alreadyOpen) {
                    scrollToId(thread.id);
                  }

                  markReadThreads({
                    threadIds: [thread.id],
                    onSuccess: () => refetch(),
                    emailAccountId,
                  });
                };

                return (
                  <EmailListItem
                    closePanel={closePanel}
                    key={thread.id}
                    onArchive={onArchive}
                    onClick={onOpen}
                    onPlanAiAction={onPlanAiAction}
                    onSelected={onSetSelectedRow}
                    opened={openThreadId === thread.id}
                    provider={provider}
                    ref={(node) => {
                      const map = getMap();
                      if (node) {
                        map.set(thread.id, node);
                      } else {
                        map.delete(thread.id);
                      }
                    }}
                    refetch={refetch}
                    selected={selectedRows[thread.id]}
                    splitView={!!openThreadId}
                    thread={thread}
                    userEmail={userEmail}
                  />
                );
              })}
              {showLoadMore && (
                <Button
                  className="mb-2 w-full"
                  disabled={isLoadingMore}
                  onClick={handleLoadMore}
                  size={"sm"}
                  variant="outline"
                >
                  {
                    <>
                      {isLoadingMore ? (
                        <ButtonLoader />
                      ) : (
                        <ChevronsDownIcon className="mr-2 h-4 w-4" />
                      )}
                      <span>Load more</span>
                    </>
                  }
                </Button>
              )}
            </ul>
          }
          right={
            !!(openThreadId && openedRow) && (
              <EmailPanel
                advanceToAdjacentThread={advanceToAdjacentThread}
                close={closePanel}
                onArchive={onArchive}
                onPlanAiAction={onPlanAiAction}
                refetch={refetch}
                row={openedRow}
              />
            )
          }
        />
      )}
    </>
  );
}

function ResizeGroup({
  left,
  right,
}: {
  left: React.ReactNode;
  right?: React.ReactNode;
}) {
  const isMobile = useIsMobile();

  if (!right) {
    return left;
  }

  return (
    <ResizablePanelGroup direction={isMobile ? "vertical" : "horizontal"}>
      <ResizablePanel defaultSize={50} minSize={0} style={{ overflow: "auto" }}>
        {left}
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={50} minSize={0}>
        {right}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
