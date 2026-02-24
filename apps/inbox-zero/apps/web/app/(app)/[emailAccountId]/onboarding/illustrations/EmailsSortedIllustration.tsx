"use client";

import { motion } from "framer-motion";
import { Square, Star } from "lucide-react";
import { useEffect, useState } from "react";

const emails = [
  {
    id: 1,
    from: "TechNews Daily",
    subject: "Weekly digest",
    snippet: "- Your weekly roundup of the latest...",
    time: "10:30 AM",
    label: "Newsletters",
    labelColor: "bg-purple-600",
  },
  {
    id: 2,
    from: "Sarah Chen",
    subject: "Project update",
    snippet: "- Hi! Just wanted to check in on...",
    time: "9:15 AM",
    label: "To Reply",
    labelColor: "bg-blue-600",
  },
  {
    id: 3,
    from: "Mark Johnson",
    subject: "Quick introduction",
    snippet: "- I came across your profile and...",
    time: "Yesterday",
    label: "Cold Emails",
    labelColor: "bg-orange-500",
  },
];

export function EmailsSortedIllustration() {
  const [showLabels, setShowLabels] = useState([false, false, false]);

  useEffect(() => {
    const labelDelays = [1200, 1800, 2400];
    const timeouts: NodeJS.Timeout[] = [];

    labelDelays.forEach((delay, index) => {
      timeouts.push(
        setTimeout(() => {
          setShowLabels((prev) => {
            const next = [...prev];
            next[index] = true;
            return next;
          });
        }, delay)
      );
    });

    return () => timeouts.forEach(clearTimeout);
  }, []);

  return (
    <div className="flex h-[200px] w-full max-w-[360px] flex-col justify-center gap-2 sm:w-[420px] sm:max-w-none">
      {emails.map((email, index) => (
        <motion.div
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center rounded-lg border border-gray-200 bg-white px-3 py-2.5 shadow-sm dark:border-gray-700 dark:bg-slate-800"
          initial={{ opacity: 0, x: -20 }}
          key={email.id}
          transition={{
            duration: 0.5,
            delay: index * 0.15,
            ease: [0.25, 0.46, 0.45, 0.94],
          }}
        >
          <div className="flex shrink-0 items-center gap-1.5 pr-3">
            <Square className="h-4 w-4 text-gray-300 dark:text-gray-600" />
            <Star className="h-4 w-4 text-gray-300 dark:text-gray-600" />
          </div>

          <div className="flex h-5 w-[90px] shrink-0 items-center">
            <span className="truncate font-semibold text-[12px] text-gray-900 leading-none dark:text-gray-100">
              {email.from}
            </span>
          </div>

          <div className="ml-auto flex h-5 shrink-0 items-center px-2 sm:ml-0">
            <motion.span
              animate={{
                opacity: showLabels[index] ? 1 : 0,
                scale: showLabels[index] ? 1 : 0.8,
              }}
              className={`inline-block whitespace-nowrap rounded px-2 py-1 font-medium text-[9px] text-white leading-none ${email.labelColor}`}
              initial={{ opacity: 0, scale: 0.8 }}
              transition={{
                duration: 0.4,
                ease: [0.25, 0.46, 0.45, 0.94],
              }}
            >
              {email.label}
            </motion.span>
          </div>

          <div className="hidden h-5 min-w-0 flex-1 items-center truncate sm:flex">
            <span className="font-medium text-[12px] text-gray-900 dark:text-gray-100">
              {email.subject}
            </span>
            <span className="text-[12px] text-gray-500 dark:text-gray-400">
              {" "}
              {email.snippet}
            </span>
          </div>

          <div className="shrink-0 pl-3 text-[11px] text-gray-500 dark:text-gray-400">
            {email.time}
          </div>
        </motion.div>
      ))}
    </div>
  );
}
