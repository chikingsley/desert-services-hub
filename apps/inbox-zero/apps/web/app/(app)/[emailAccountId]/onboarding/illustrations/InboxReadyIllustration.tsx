"use client";

import { motion } from "framer-motion";
import { Check, Inbox } from "lucide-react";
import { useEffect, useState } from "react";

const ANIMATION_DURATION = 1; // seconds

export function InboxReadyIllustration() {
  const [isAnimating, setIsAnimating] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    // Start animation after short delay
    const startTimeout = setTimeout(() => {
      setIsAnimating(true);
    }, 100);

    // Mark complete when animation finishes
    const completeTimeout = setTimeout(
      () => {
        setIsComplete(true);
      },
      100 + ANIMATION_DURATION * 1000
    );

    return () => {
      clearTimeout(startTimeout);
      clearTimeout(completeTimeout);
    };
  }, []);

  const circumference = 2 * Math.PI * 70;

  return (
    <div className="relative flex h-[220px] w-[320px] items-center justify-center">
      <svg className="absolute h-[180px] w-[180px] -rotate-90">
        <circle
          cx="90"
          cy="90"
          fill="none"
          r="70"
          stroke="#e5e7eb"
          strokeWidth="8"
        />
        <motion.circle
          animate={{ strokeDashoffset: isAnimating ? 0 : circumference }}
          cx="90"
          cy="90"
          fill="none"
          initial={{ strokeDashoffset: circumference }}
          r="70"
          stroke="#22c55e"
          strokeDasharray={circumference}
          strokeLinecap="round"
          strokeWidth="8"
          transition={{
            duration: ANIMATION_DURATION,
            ease: [0.4, 0, 1, 1], // starts slow, keeps accelerating to the end
          }}
        />
      </svg>

      <motion.div
        animate={{
          scale: isComplete ? 1.05 : 1,
          opacity: 1,
        }}
        className="relative z-10 flex h-14 w-14 items-center justify-center rounded-xl border border-gray-100 bg-white shadow-lg"
        initial={{ scale: 0.8, opacity: 0 }}
        transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        {isComplete ? (
          <Check className="h-7 w-7 text-green-500" strokeWidth={3} />
        ) : (
          <Inbox className="h-7 w-7 text-gray-400" />
        )}
      </motion.div>
    </div>
  );
}
