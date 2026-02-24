"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";

export function FollowUpRemindersIllustration() {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const timings = [
      1000, // Stage 1: Card slides in
      750, // Stage 2: "You replied" appears
      625, // Stage 3: "1 day ago"
      625, // Stage 4: "2 days ago"
      625, // Stage 5: "3 days ago"
      500, // Stage 6: Follow up label appears
      2500, // Pause before reset
    ];

    let timeout: NodeJS.Timeout;
    let currentStage = 0;

    const advanceStage = () => {
      timeout = setTimeout(() => {
        currentStage++;
        if (currentStage > timings.length) {
          currentStage = 0;
          setStage(0);
        } else {
          setStage(currentStage);
        }
        advanceStage();
      }, timings[currentStage] || 1000);
    };

    advanceStage();

    return () => clearTimeout(timeout);
  }, []);

  const daysText =
    stage >= 5 ? "3 days ago" : stage >= 4 ? "2 days ago" : "1 day ago";

  return (
    <div className="relative h-44 overflow-hidden rounded-lg bg-gradient-to-br from-slate-50 to-gray-100 dark:from-slate-900 dark:to-gray-900">
      <div className="absolute inset-0 flex items-center justify-center px-6 py-6">
        <AnimatePresence mode="wait">
          {stage >= 1 && (
            <motion.div
              animate={{ opacity: 1, x: 0 }}
              className="w-full max-w-[280px] rounded-lg bg-white p-3 shadow-md dark:bg-slate-800"
              exit={{ opacity: 0, x: -100 }}
              initial={{ opacity: 0, x: 100 }}
              key="card"
              transition={{ duration: 0.625, ease: "easeOut" }}
            >
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pink-100 font-semibold text-pink-600 text-xs dark:bg-pink-900/50 dark:text-pink-300">
                  SM
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[13px] text-gray-900 dark:text-gray-100">
                      Sarah Miller
                    </span>
                    <AnimatePresence>
                      {stage >= 6 && (
                        <motion.span
                          animate={{ opacity: 1, scale: 1 }}
                          className="rounded bg-amber-100 px-1.5 py-0.5 font-semibold text-[9px] text-amber-700 dark:bg-amber-800/50 dark:text-amber-300"
                          initial={{ opacity: 0, scale: 0.8 }}
                          transition={{ duration: 0.375, ease: "easeOut" }}
                        >
                          Follow up
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </div>
                  <div className="font-medium text-[11px] text-gray-700 dark:text-gray-300">
                    Meeting follow-up
                  </div>
                </div>
              </div>
              <div className="mt-2 text-[10px] text-gray-500 leading-relaxed dark:text-gray-400">
                Thanks for your time today. I wanted to follow up on...
              </div>
              <motion.div
                animate={{
                  height: stage >= 2 ? "auto" : 0,
                  opacity: stage >= 2 ? 1 : 0,
                }}
                className="overflow-hidden"
                initial={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.375, ease: "easeOut" }}
              >
                <div className="mt-2.5 flex items-center gap-1.5 border-gray-100 border-t pt-2 dark:border-gray-700">
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">
                    ↩ You replied
                    {stage >= 3 && (
                      <motion.span
                        animate={{ opacity: 1 }}
                        initial={{ opacity: 0 }}
                        key={daysText}
                        transition={{ duration: 0.375 }}
                      >
                        {" "}
                        · {daysText}
                      </motion.span>
                    )}
                  </span>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
