"use client";

import { PauseIcon, PlayIcon, SquareIcon } from "lucide-react";
import Link from "next/link";
import { useReducer, useRef, useState } from "react";
import { BulkProcessActivityLog } from "@/app/(app)/[emailAccountId]/assistant/BulkProcessActivityLog";
import {
  bulkRunReducer,
  getProgressMessage,
  initialBulkRunState,
} from "@/app/(app)/[emailAccountId]/assistant/bulk-run-rules-reducer";
import { SetDateDropdown } from "@/app/(app)/[emailAccountId]/assistant/SetDateDropdown";
import { usePremiumModal } from "@/app/(app)/premium/PremiumModal";
import type { ThreadsResponse } from "@/app/api/threads/route";
import type { ThreadsQuery } from "@/app/api/threads/validation";
import { LoadingContent } from "@/components/LoadingContent";
import { PremiumAlertWithData, usePremium } from "@/components/PremiumAlert";
import { toastError } from "@/components/Toast";
import { Toggle } from "@/components/Toggle";
import { SectionDescription } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useBeforeUnload } from "@/hooks/useBeforeUnload";
import { useThreads } from "@/hooks/useThreads";
import { useAccount } from "@/providers/EmailAccountProvider";
import { clearAiQueueAtom, useAiQueueState } from "@/store/ai-queue";
import { fetchWithAccount } from "@/utils/fetch";
import { hasTierAccess } from "@/utils/premium";
import {
  clearAiQueue,
  pauseAiQueue,
  resumeAiQueue,
} from "@/utils/queue/ai-queue";
import { runAiRules } from "@/utils/queue/email-actions";
import { sleep } from "@/utils/sleep";

export function BulkRunRules() {
  const { emailAccountId } = useAccount();

  const [isOpen, setIsOpen] = useState(false);
  const [state, dispatch] = useReducer(bulkRunReducer, initialBulkRunState);

  const { data, isLoading, error } = useThreads({ type: "inbox" });

  const queue = useAiQueueState();

  const { hasAiAccess, isLoading: isLoadingPremium, tier } = usePremium();
  const { PremiumModal, openModal } = usePremiumModal();

  const isBusinessPlusTier = hasTierAccess({
    tier: tier || null,
    minimumTier: "PROFESSIONAL_MONTHLY",
  });

  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [includeRead, setIncludeRead] = useState(false);

  const abortRef = useRef<() => void>(undefined);

  // Derived state
  const remaining = new Set(
    [...state.processedThreadIds].filter((id) => queue.has(id))
  ).size;
  const completed = state.processedThreadIds.size - remaining;
  const isProcessing = queue.size > 0;
  const isPaused = state.status === "paused";
  const isBusy = isProcessing || state.status === "processing";

  // Warn user before leaving page during processing (includes initial fetch)
  useBeforeUnload(isBusy);

  const handleStart = async () => {
    dispatch({ type: "START" });

    if (!startDate) {
      toastError({ description: "Please select a start date" });
      dispatch({ type: "RESET" });
      return;
    }
    if (!emailAccountId) {
      toastError({
        description: "Email account ID is missing. Please refresh the page.",
      });
      dispatch({ type: "RESET" });
      return;
    }

    // Ensure queue is not paused from a previous run
    resumeAiQueue();

    try {
      abortRef.current = await onRun(
        emailAccountId,
        { startDate, endDate, includeRead },
        (threads) => {
          dispatch({ type: "THREADS_QUEUED", threads });
        },
        (_completionStatus, count) => {
          dispatch({ type: "COMPLETE", count });
        }
      );
    } catch (error) {
      console.error("Failed to start bulk processing:", error);
      toastError({
        title: "Failed to start",
        description: "An error occurred. Please try again.",
      });
      dispatch({ type: "RESET" });
    }
  };

  const handlePauseResume = () => {
    if (isPaused) {
      resumeAiQueue();
      dispatch({ type: "RESUME" });
    } else {
      pauseAiQueue();
      dispatch({ type: "PAUSE" });
    }
  };

  const handleStop = () => {
    dispatch({ type: "STOP", completedCount: completed });
    clearAiQueue();
    clearAiQueueAtom();
    abortRef.current?.();
  };

  const progressMessage = getProgressMessage(state, remaining);

  return (
    <div>
      <Dialog onOpenChange={setIsOpen} open={isOpen}>
        <DialogTrigger asChild>
          <Button size="sm" type="button" variant="outline">
            Process Past Emails
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Bulk Process Emails</DialogTitle>
            <DialogDescription>
              Run your rules on emails in your inbox that haven't been handled
              yet.
            </DialogDescription>
          </DialogHeader>
          <LoadingContent error={error} loading={isLoading}>
            {data && (
              <>
                {progressMessage && (
                  <div className="rounded-md border border-green-200 bg-green-50 px-2 py-1.5 dark:border-green-800 dark:bg-green-950">
                    <SectionDescription className="mt-0">
                      {progressMessage}
                    </SectionDescription>
                  </div>
                )}
                <LoadingContent loading={isLoadingPremium}>
                  <div className="flex min-w-0 flex-col space-y-4 overflow-hidden">
                    <PremiumAlertWithData className="mr-auto" />

                    <div className="grid grid-cols-2 gap-2">
                      <SetDateDropdown
                        disabled={isProcessing}
                        onChange={(date) => {
                          setStartDate(date);
                          dispatch({ type: "RESET" });
                        }}
                        placeholder="Set start date"
                        value={startDate}
                      />
                      <SetDateDropdown
                        disabled={isProcessing}
                        onChange={(date) => {
                          setEndDate(date);
                          dispatch({ type: "RESET" });
                        }}
                        placeholder="Set end date (optional)"
                        value={endDate}
                      />
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <Toggle
                        disabled={isProcessing || !isBusinessPlusTier}
                        enabled={includeRead}
                        label="Include read emails"
                        name="include-read"
                        onChange={(enabled) => setIncludeRead(enabled)}
                      />
                      {!isBusinessPlusTier && hasAiAccess && (
                        <Link
                          className="whitespace-nowrap text-primary text-sm hover:underline"
                          href="/settings"
                          onClick={(e) => {
                            e.preventDefault();
                            openModal();
                          }}
                        >
                          Upgrade to Professional to enable
                        </Link>
                      )}
                    </div>

                    {(state.status !== "idle" ||
                      state.processedThreadIds.size > 0) && (
                      <BulkProcessActivityLog
                        aiQueue={queue}
                        loading={
                          state.status === "processing" &&
                          state.processedThreadIds.size === 0
                        }
                        paused={isPaused}
                        processedThreadIds={state.processedThreadIds}
                        threads={Array.from(state.fetchedThreads.values())}
                      />
                    )}

                    {(state.status === "idle" || state.status === "stopped") &&
                      !isProcessing && (
                        <Button
                          disabled={
                            !(startDate && emailAccountId && hasAiAccess)
                          }
                          onClick={handleStart}
                          type="button"
                        >
                          Process Emails
                        </Button>
                      )}
                    {isBusy && (
                      <div className="flex justify-end gap-2">
                        <Button onClick={handlePauseResume} size="sm">
                          {isPaused ? (
                            <>
                              <PlayIcon className="mr-1.5 h-3.5 w-3.5" />
                              Resume
                            </>
                          ) : (
                            <>
                              <PauseIcon className="mr-1.5 h-3.5 w-3.5" />
                              Pause
                            </>
                          )}
                        </Button>
                        <Button
                          onClick={handleStop}
                          size="sm"
                          variant="outline"
                        >
                          <SquareIcon className="mr-1.5 h-3.5 w-3.5" />
                          Stop
                        </Button>
                      </div>
                    )}

                    {state.runResult && state.runResult.count === 0 && (
                      <div className="mt-4 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-blue-800 text-sm dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200">
                        No {includeRead ? "" : "unread "}emails found in the
                        selected date range.
                      </div>
                    )}
                  </div>
                </LoadingContent>
              </>
            )}
          </LoadingContent>
        </DialogContent>
      </Dialog>
      <PremiumModal />
    </div>
  );
}

// fetch batches of messages and add them to the ai queue
async function onRun(
  emailAccountId: string,
  {
    startDate,
    endDate,
    includeRead,
  }: { startDate: Date; endDate?: Date; includeRead?: boolean },
  onThreadsQueued: (threads: ThreadsResponse["threads"]) => void,
  onComplete: (status: "success" | "error" | "cancelled", count: number) => void
) {
  let nextPageToken = "";
  const LIMIT = 25;
  let totalProcessed = 0;

  let aborted = false;

  function abort() {
    aborted = true;
  }

  async function run() {
    for (let i = 0; i < 100; i++) {
      const query: ThreadsQuery = {
        type: "inbox",
        limit: LIMIT,
        after: startDate,
        ...(endDate ? { before: endDate } : {}),
        ...(includeRead ? {} : { isUnread: true }),
        ...(nextPageToken ? { nextPageToken } : {}),
      };

      const res = await fetchWithAccount({
        url: `/api/threads?${
          // biome-ignore lint/suspicious/noExplicitAny: simplest
          new URLSearchParams(query as any).toString()
        }`,
        emailAccountId,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error("Failed to fetch threads:", res.status, errorData);
        toastError({
          title: "Failed to fetch emails",
          description:
            typeof errorData.error === "string"
              ? errorData.error
              : `Error: ${res.status}`,
        });
        onComplete("error", totalProcessed);
        return;
      }

      const data: ThreadsResponse = await res.json();

      if (!data.threads) {
        console.error("Invalid response: missing threads", data);
        toastError({
          title: "Invalid response",
          description: "Failed to process emails. Please try again.",
        });
        onComplete("error", totalProcessed);
        return;
      }

      nextPageToken = data.nextPageToken || "";

      const threadsWithoutPlan = data.threads.filter((t) => !t.plan);

      onThreadsQueued(threadsWithoutPlan);
      totalProcessed += threadsWithoutPlan.length;

      runAiRules(emailAccountId, threadsWithoutPlan, false);

      if (aborted) {
        onComplete("cancelled", totalProcessed);
        return;
      }

      if (!nextPageToken) {
        break;
      }

      // avoid gmail api rate limits
      // ai takes longer anyway
      await sleep(threadsWithoutPlan.length ? 5000 : 2000);
    }

    onComplete("success", totalProcessed);
  }

  run();

  return abort;
}
