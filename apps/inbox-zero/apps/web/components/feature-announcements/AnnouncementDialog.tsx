"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import { useCallback, useEffect, useState } from "react";
import { LoadingContent } from "@/components/LoadingContent";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useUser } from "@/hooks/useUser";
import { dismissAnnouncementModalAction } from "@/utils/actions/announcements";
import {
  type Announcement,
  type AnnouncementDetail,
  getActiveAnnouncements,
  hasNewAnnouncements,
} from "@/utils/announcements";

export function AnnouncementDialog() {
  const { data: user, mutate, isLoading, error } = useUser();
  const [isOpen, setIsOpen] = useState(true);

  const { execute: dismissModal } = useAction(dismissAnnouncementModalAction, {
    onSuccess: () => {
      mutate();
    },
  });

  const announcements = getActiveAnnouncements();
  const cutOffDate =
    user?.announcementDismissedAt ?? user?.createdAt ?? new Date();
  const showAnnouncements =
    !!user && !isLoading && hasNewAnnouncements(cutOffDate);

  // Prevent body scroll when modal is actually visible
  useEffect(() => {
    const shouldLockScroll =
      isOpen && announcements.length > 0 && showAnnouncements;
    if (shouldLockScroll) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen, announcements.length, showAnnouncements]);

  const handleCloseModal = useCallback(() => {
    if (announcements.length > 0) {
      dismissModal({ publishedAt: announcements[0].publishedAt });
    }
    setIsOpen(false);
  }, [dismissModal, announcements]);

  return (
    <LoadingContent error={error} loading={isLoading}>
      {announcements.length === 0 || !showAnnouncements ? null : (
        <AnimatePresence>
          {isOpen && (
            <>
              {/* Backdrop */}
              <motion.div
                animate={{ opacity: 1 }}
                className="fixed inset-0 z-40 bg-black/40"
                exit={{ opacity: 0 }}
                initial={{ opacity: 0 }}
                key="backdrop"
                onClick={handleCloseModal}
                transition={{ duration: 0.2 }}
              />

              {/* Modal */}
              <motion.div
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4"
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                key="modal-container"
                transition={{ type: "spring", damping: 25, stiffness: 400 }}
              >
                <div className="pointer-events-auto relative">
                  {/* Close button - outside modal, diagonal top-right corner */}
                  <button
                    className="absolute -top-9 -right-9 z-10 flex items-center justify-center rounded-full border border-white/20 bg-white/10 p-2 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
                    onClick={handleCloseModal}
                    type="button"
                  >
                    <X className="h-5 w-5" />
                  </button>

                  <div className="w-full max-w-md overflow-hidden rounded-xl bg-gray-100 shadow-2xl dark:bg-gray-900">
                    <ScrollArea className="max-h-[600px] [&>[data-radix-scroll-area-viewport]]:max-h-[600px]">
                      <div className="flex flex-col gap-4 p-4">
                        {announcements.map((announcement) => (
                          <AnnouncementCard
                            announcement={announcement}
                            key={announcement.id}
                            onClose={handleCloseModal}
                          />
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      )}
    </LoadingContent>
  );
}

export interface AnnouncementCardProps {
  announcement: Announcement;
  onClose: () => void;
}

export function AnnouncementCard({
  announcement,
  onClose,
}: AnnouncementCardProps) {
  return (
    <div className="overflow-hidden rounded-xl bg-white dark:bg-gray-800">
      <div className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-bold text-gray-900 text-lg dark:text-gray-100">
            {announcement.title}
          </h3>
          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 font-medium text-gray-600 text-xs dark:bg-gray-700 dark:text-gray-400">
            {new Date(announcement.publishedAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </span>
        </div>

        {/* <div className="mb-4">
          <Image
            src={announcement.image}
            alt={announcement.title}
            width={400}
            height={176}
            className="h-44 w-full rounded-lg object-cover"
          />
        </div> */}

        {/* TODO: sizing / rounded */}
        {announcement.image && <div className="mb-4">{announcement.image}</div>}

        {announcement.details && announcement.details.length > 0 && (
          <div className="mb-4 space-y-3">
            {announcement.details.map((detail) => (
              <DetailItem detail={detail} key={detail.title} />
            ))}
          </div>
        )}

        <div className="flex gap-3">
          {announcement.link && (
            <Link
              className="flex flex-1 items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-sm text-white transition-colors hover:bg-blue-700"
              href={announcement.link}
              onClick={onClose}
            >
              View
            </Link>
          )}
          {announcement.learnMoreLink && (
            <Link
              className="flex flex-1 items-center justify-center rounded-lg bg-gray-100 px-4 py-2.5 font-medium text-gray-700 text-sm transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
              href={announcement.learnMoreLink}
            >
              Learn more
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailItem({ detail }: { detail: AnnouncementDetail }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-200 dark:border-gray-700">
        {detail.icon}
      </div>
      <div className="min-w-0 pt-0.5">
        <div className="font-medium text-gray-900 text-sm dark:text-gray-100">
          {detail.title}
        </div>
        <div className="text-gray-500 text-sm dark:text-gray-400">
          {detail.description}
        </div>
      </div>
    </div>
  );
}
