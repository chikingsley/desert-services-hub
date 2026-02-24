"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Archive,
  Bell,
  Calendar,
  CircleCheck,
  type LucideIcon,
  Megaphone,
  Newspaper,
  Tag,
} from "lucide-react";
import { useEffect, useState } from "react";

const senders: {
  id: number;
  name: string;
  color: string;
  icon: LucideIcon;
  rotate: number;
  emailCount: number;
}[] = [
  {
    id: 1,
    name: "Daily Deals",
    color: "bg-red-100 text-red-600",
    icon: Tag,
    rotate: -3,
    emailCount: 127,
  },
  {
    id: 2,
    name: "Newsletter",
    color: "bg-orange-100 text-orange-600",
    icon: Newspaper,
    rotate: 2,
    emailCount: 84,
  },
  {
    id: 3,
    name: "Promo Alert",
    color: "bg-yellow-100 text-yellow-600",
    icon: Megaphone,
    rotate: -1.5,
    emailCount: 56,
  },
  {
    id: 4,
    name: "Weekly Digest",
    color: "bg-purple-100 text-purple-600",
    icon: Calendar,
    rotate: 2.5,
    emailCount: 43,
  },
  {
    id: 5,
    name: "Updates",
    color: "bg-pink-100 text-pink-600",
    icon: Bell,
    rotate: -2,
    emailCount: 31,
  },
];

export function BulkUnsubscribeIllustration() {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const timeouts: NodeJS.Timeout[] = [];

    timeouts.push(setTimeout(() => setStage(1), 1200));
    timeouts.push(setTimeout(() => setStage(2), 2000));
    timeouts.push(setTimeout(() => setStage(3), 2800));
    timeouts.push(setTimeout(() => setStage(4), 3600));
    timeouts.push(setTimeout(() => setStage(5), 4400));

    return () => timeouts.forEach(clearTimeout);
  }, []);

  const archivedEmailCount = senders
    .slice(0, stage)
    .reduce((sum, sender) => sum + sender.emailCount, 0);

  return (
    <div className="relative flex h-[200px] w-[420px] items-center justify-center gap-6">
      <div className="relative z-10 flex h-[160px] w-[150px] flex-col rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-slate-800">
        <div className="border-gray-100 border-b px-3 py-2 dark:border-gray-700">
          <div className="font-medium text-[10px] text-gray-600 dark:text-gray-300">
            Inbox
          </div>
        </div>
        <div className="relative flex-1 p-2">
          {senders.map((email, index) => {
            const isArchived = index < stage;
            if (isArchived) {
              return null;
            }

            return (
              <motion.div
                animate={{
                  opacity: 1,
                  y: index * 10,
                  scale: 1,
                  rotate: email.rotate,
                }}
                className="absolute right-2 left-2 flex items-center gap-1.5 rounded border border-gray-200 bg-white px-2 py-1.5 shadow-sm dark:border-gray-600 dark:bg-slate-700"
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                key={`static-${email.id}`}
                style={{ zIndex: senders.length - index }}
                transition={{
                  duration: 0.4,
                  delay: index * 0.06,
                  ease: [0.25, 0.46, 0.45, 0.94],
                }}
              >
                <div
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded ${email.color}`}
                >
                  <email.icon className="h-2.5 w-2.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-[9px] text-gray-900 dark:text-gray-100">
                    {email.name}
                  </div>
                </div>
              </motion.div>
            );
          })}

          {stage === 5 && (
            <motion.div
              animate={{ opacity: 1, scale: 1 }}
              className="absolute inset-0 flex items-center justify-center"
              initial={{ opacity: 0, scale: 0.9 }}
            >
              <CircleCheck className="h-6 w-6 text-gray-400" />
            </motion.div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {senders.map((email, index) => {
          const isAnimatingOut = index === stage - 1 && stage > 0;
          if (!isAnimatingOut) {
            return null;
          }

          return (
            <motion.div
              animate={{
                opacity: 0,
                x: 50,
                y: 0,
                scale: 0.6,
                rotate: 0,
              }}
              className="absolute top-1/2 left-1/2 z-20 flex w-[126px] items-center gap-1.5 rounded border border-gray-200 bg-white px-2 py-1.5 shadow-sm dark:border-gray-600 dark:bg-slate-700"
              initial={{
                opacity: 1,
                x: -135,
                y: index * 10 - 50,
                scale: 1,
                rotate: email.rotate,
              }}
              key={`flying-${email.id}`}
              transition={{
                duration: 0.6,
                ease: [0.25, 0.46, 0.45, 0.94],
              }}
            >
              <div
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded ${email.color}`}
              >
                <email.icon className="h-2.5 w-2.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-[9px] text-gray-900 dark:text-gray-100">
                  {email.name}
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      <motion.div
        animate={{ opacity: stage > 0 ? 1 : 0.3 }}
        className="z-10 hidden items-center sm:flex"
        initial={{ opacity: 0.3 }}
      >
        <svg
          className="h-4 w-6 text-gray-300"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 16"
        >
          <path d="M0 8h20M14 2l6 6-6 6" />
        </svg>
      </motion.div>

      <div className="relative z-10 flex h-[160px] w-[150px] flex-col rounded-lg border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-slate-800">
        <div className="border-gray-100 border-b px-3 py-2 dark:border-gray-700">
          <div className="font-medium text-[10px] text-gray-600 dark:text-gray-300">
            Archived
          </div>
        </div>
        <motion.div
          animate={{
            scale: archivedEmailCount > 0 ? [1, 1.02, 1] : 1,
          }}
          className="flex flex-1 flex-col items-center justify-center"
          transition={{ duration: 0.2 }}
        >
          <Archive className="mb-2 h-5 w-5 text-gray-400" />
          <motion.div
            animate={{ scale: 1 }}
            className="font-medium text-[11px] text-gray-600 dark:text-gray-300"
            initial={archivedEmailCount > 0 ? { scale: 1.1 } : false}
            key={archivedEmailCount}
          >
            {archivedEmailCount} emails
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
