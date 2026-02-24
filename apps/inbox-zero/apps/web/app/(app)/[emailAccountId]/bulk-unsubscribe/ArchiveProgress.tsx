"use client";

import { memo, useEffect } from "react";
import { ProgressPanel } from "@/components/ProgressPanel";
import { resetTotalThreads, useQueueState } from "@/store/archive-queue";

export const ArchiveProgress = memo(() => {
  const { totalThreads, activeThreads } = useQueueState();

  // Make sure activeThreads is an object as this was causing an error.
  const threadsRemaining = Object.values(activeThreads || {}).length;
  const totalProcessed = totalThreads - threadsRemaining;
  const progress = (totalProcessed / totalThreads) * 100;
  const isCompleted = progress === 100;

  useEffect(() => {
    if (isCompleted) {
      setTimeout(() => {
        resetTotalThreads();
      }, 5000);
    }
  }, [isCompleted]);

  return (
    <ProgressPanel
      completedText="Archiving complete!"
      inProgressText="Archiving emails..."
      itemLabel="emails"
      remainingItems={threadsRemaining}
      totalItems={totalThreads}
    />
  );
});
