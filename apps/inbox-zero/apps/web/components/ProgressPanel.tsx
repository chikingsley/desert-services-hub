"use client";

import { AnimatePresence, motion } from "motion/react";
import { LoadingMiniSpinner } from "@/components/Loading";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/utils";

export function ProgressPanel({
  totalItems,
  remainingItems,
  inProgressText,
  completedText,
  itemLabel,
}: {
  totalItems: number;
  remainingItems: number;
  inProgressText: string;
  completedText: string;
  itemLabel: string;
}) {
  const totalProcessed = totalItems - remainingItems;
  const progress = (totalProcessed / totalItems) * 100;
  const isCompleted = progress === 100;

  if (!totalItems) {
    return null;
  }

  return (
    <div className="pt-4 pb-2">
      <AnimatePresence mode="wait">
        <motion.div
          exit={{ opacity: 0 }}
          initial={{ opacity: 1 }}
          key="progress"
          transition={{ duration: 0.3 }}
        >
          <Progress
            innerClassName={isCompleted ? "bg-green-500" : "bg-blue-500"}
            value={progress}
          />
          <div aria-live="polite" className="mt-2 flex justify-between text-sm">
            <span
              className={cn(
                "text-muted-foreground",
                isCompleted ? "text-green-500" : ""
              )}
            >
              {isCompleted ? (
                completedText
              ) : (
                <div className="flex items-center gap-1">
                  <LoadingMiniSpinner />
                  <span>{inProgressText}</span>
                </div>
              )}
            </span>
            <span>
              {totalProcessed} of {totalItems} {itemLabel} processed
            </span>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
