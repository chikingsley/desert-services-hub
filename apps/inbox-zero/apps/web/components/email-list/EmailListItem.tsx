import clsx from "clsx";
import Link from "next/link";
import {
  type ForwardedRef,
  forwardRef,
  type MouseEventHandler,
  useCallback,
  useMemo,
} from "react";
import { ActionButtons } from "@/components/ActionButtons";
import { Checkbox } from "@/components/Checkbox";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { EmailDate } from "@/components/email-list/EmailDate";
import type { Thread } from "@/components/email-list/types";
import { PlanBadge } from "@/components/PlanBadge";
import { Button } from "@/components/ui/button";
import { useIsInAiQueue } from "@/store/ai-queue";
import { internalDateToDate } from "@/utils/date";
import { extractNameFromEmail, participant } from "@/utils/email";
import { decodeSnippet } from "@/utils/gmail/decode";
import { findCtaLink } from "@/utils/parse/parseHtml.client";

export const EmailListItem = forwardRef(
  (
    props: {
      userEmail: string;
      provider: string;
      thread: Thread;
      opened: boolean;
      selected: boolean;
      splitView: boolean;
      onClick: MouseEventHandler<HTMLLIElement>;
      closePanel: () => void;
      onSelected: (id: string) => void;
      onPlanAiAction: (thread: Thread) => void;
      onArchive: (thread: Thread) => void;
      refetch: () => void;
    },
    ref: ForwardedRef<HTMLLIElement>
  ) => {
    const { provider, thread, splitView, onSelected } = props;

    const lastMessage = thread.messages?.[thread.messages.length - 1];

    const isUnread = useMemo(() => {
      return lastMessage?.labelIds?.includes("UNREAD");
    }, [lastMessage?.labelIds]);

    const preventPropagation = useCallback(
      (e: React.MouseEvent | React.KeyboardEvent) => e.stopPropagation(),
      []
    );

    const onRowSelected = useCallback(
      () => onSelected(props.thread.id!),
      [onSelected, props.thread.id]
    );

    const isPlanning = useIsInAiQueue(props.thread.id);

    if (!lastMessage) {
      return null;
    }

    const decodedSnippet = decodeSnippet(thread.snippet || lastMessage.snippet);

    const cta = findCtaLink(lastMessage.textHtml);

    return (
      <ErrorBoundary extra={{ props, cta, decodedSnippet }}>
        <li
          className={clsx("group relative cursor-pointer border-l-4 py-3", {
            "hover:bg-slate-50 dark:hover:bg-slate-950": !(
              props.selected || props.opened
            ),
            "bg-blue-50 dark:bg-blue-950": props.selected,
            "bg-blue-100 dark:bg-blue-900": props.opened,
            "bg-slate-100 dark:bg-background": !(
              isUnread ||
              props.selected ||
              props.opened
            ),
          })}
          onClick={props.onClick}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              props.onClick(e as any);
            }
          }}
          ref={ref}
        >
          <div className="px-4">
            <div className="mx-auto flex">
              {/* left */}
              <div
                className={clsx(
                  "flex flex-1 items-center overflow-hidden whitespace-nowrap text-sm leading-6",
                  {
                    "font-semibold": isUnread,
                  }
                )}
              >
                <div
                  className="flex items-center pl-1"
                  onClick={preventPropagation}
                  onKeyDown={preventPropagation}
                >
                  <Checkbox
                    checked={!!props.selected}
                    onChange={onRowSelected}
                  />
                </div>

                <div className="ml-4 w-48 min-w-0 overflow-hidden truncate text-foreground">
                  {extractNameFromEmail(
                    participant(lastMessage, props.userEmail)
                  )}{" "}
                  {thread.messages.length > 1 ? (
                    <span className="font-normal">
                      ({thread.messages.length})
                    </span>
                  ) : null}
                </div>
                {!splitView && (
                  <>
                    {cta && (
                      <Button
                        asChild
                        className="ml-2"
                        size="xs"
                        variant="outline"
                      >
                        <Link href={cta.ctaLink} target="_blank">
                          {cta.ctaText}
                        </Link>
                      </Button>
                    )}
                    <div className="ml-2 min-w-0 overflow-hidden text-foreground">
                      {lastMessage.headers.subject}
                    </div>
                    <div className="mr-6 ml-4 flex flex-1 items-center overflow-hidden truncate font-normal text-muted-foreground leading-5">
                      {decodedSnippet}
                    </div>
                  </>
                )}
              </div>

              {/* right */}
              <div className="flex items-center justify-between">
                <div className="relative flex items-center">
                  <div
                    className="absolute right-0 z-20 hidden group-hover:block"
                    // prevent email panel being opened when clicking on action buttons
                    onClick={preventPropagation}
                    onKeyDown={preventPropagation}
                  >
                    <ActionButtons
                      isPlanning={isPlanning}
                      onArchive={() => {
                        props.onArchive(thread);
                        props.closePanel();
                      }}
                      onPlanAiAction={() => props.onPlanAiAction(thread)}
                      refetch={props.refetch}
                      shadow
                      threadId={thread.id!}
                    />
                  </div>
                  <EmailDate
                    date={internalDateToDate(lastMessage?.internalDate)}
                  />
                </div>

                {!!thread.plan && (
                  <div className="ml-3 flex items-center space-x-2 whitespace-nowrap">
                    <PlanBadge plan={thread.plan} provider={provider} />
                  </div>
                )}
              </div>
            </div>

            {splitView && (
              <div className="mt-1.5 whitespace-nowrap text-sm leading-6">
                <div className="min-w-0 overflow-hidden font-medium text-foreground">
                  {lastMessage.headers.subject}
                </div>
                <div className="mt-0.5 mr-6 flex flex-1 items-center overflow-hidden truncate pl-1 font-normal text-muted-foreground leading-5">
                  {decodedSnippet}
                </div>
                {cta && (
                  <Button asChild className="mt-2" size="xs" variant="outline">
                    <Link href={cta.ctaLink} target="_blank">
                      {cta.ctaText}
                    </Link>
                  </Button>
                )}
              </div>
            )}
          </div>
        </li>
      </ErrorBoundary>
    );
  }
);

EmailListItem.displayName = "EmailListItem";
