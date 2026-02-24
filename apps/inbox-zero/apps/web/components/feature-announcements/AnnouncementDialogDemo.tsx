"use client";

import { AnimatePresence, motion } from "framer-motion";
import { FileEdit, Tag, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AnnouncementCard } from "@/components/feature-announcements/AnnouncementDialog";
import { FollowUpRemindersIllustration } from "@/components/feature-announcements/FollowUpRemindersIllustration";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Announcement } from "@/utils/announcements";

const DETAIL_ICON_CLASS = "h-4 w-4 text-gray-600 dark:text-gray-400";

export function AnnouncementDialogDemo() {
  const [isOpen, setIsOpen] = useState(false);
  const announcement = getDemoAnnouncement();

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>Open Announcement Dialog</Button>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              animate={{ opacity: 1 }}
              className="fixed inset-0 z-40 bg-black/40"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              key="backdrop"
              onClick={handleClose}
              transition={{ duration: 0.2 }}
            />

            <motion.div
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4"
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              key="modal-container"
              transition={{ type: "spring", damping: 25, stiffness: 400 }}
            >
              <div className="pointer-events-auto relative">
                <button
                  className="absolute -top-9 -right-9 z-10 flex items-center justify-center rounded-full border border-white/20 bg-white/10 p-2 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
                  onClick={handleClose}
                  type="button"
                >
                  <X className="h-5 w-5" />
                </button>

                <div className="w-full max-w-md overflow-hidden rounded-xl bg-gray-100 shadow-2xl dark:bg-gray-900">
                  <ScrollArea className="max-h-[600px] [&>[data-radix-scroll-area-viewport]]:max-h-[600px]">
                    <div className="flex flex-col gap-4 p-4">
                      <AnnouncementCard
                        announcement={announcement}
                        onClose={handleClose}
                      />
                    </div>
                  </ScrollArea>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function getDemoAnnouncement(): Announcement {
  return {
    id: "follow-up-reminders",
    title: "Follow-up Reminders",
    description:
      "Track replies and get reminded about unanswered emails. Never let an important email slip through the cracks.",
    image: <FollowUpRemindersIllustration />,
    link: "/automation?tab=settings",
    learnMoreLink: "/#",
    publishedAt: "2026-01-15T00:00:00Z",
    details: [
      {
        title: "Automatic follow-up labels",
        description: "Labels threads after 3 days with no response.",
        icon: <Tag className={DETAIL_ICON_CLASS} />,
      },
      {
        title: "Auto-generated drafts",
        description: "Creates a draft to nudge unresponsive contacts.",
        icon: <FileEdit className={DETAIL_ICON_CLASS} />,
      },
    ],
  };
}
