"use client";

import { useEffect } from "react";
import { useAccount } from "@/providers/EmailAccountProvider";
import { processQueue, useQueueState } from "@/store/archive-queue";

let isInitialized = false;

function useInitializeQueues() {
  const queueState = useQueueState();
  const { emailAccountId } = useAccount();

  useEffect(() => {
    if (!isInitialized) {
      isInitialized = true;
      if (queueState.activeThreads) {
        processQueue({
          threads: queueState.activeThreads,
          emailAccountId,
        });
      }
    }
  }, [queueState.activeThreads, emailAccountId]);
}

export function QueueInitializer() {
  useInitializeQueues();
  return null;
}
