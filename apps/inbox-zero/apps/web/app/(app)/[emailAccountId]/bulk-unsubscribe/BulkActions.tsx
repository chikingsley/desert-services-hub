import { AnimatePresence, motion } from "framer-motion";
import {
  ArchiveIcon,
  Loader2Icon,
  MailXIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
  TrashIcon,
  XIcon,
} from "lucide-react";
import { usePostHog } from "posthog-js/react";
import { useMemo, useState } from "react";
import type { NewsletterFilterType } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/hooks";
import {
  useBulkApprove,
  useBulkArchive,
  useBulkAutoArchive,
  useBulkDelete,
  useBulkUnsubscribe,
} from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/hooks";
import { usePremiumModal } from "@/app/(app)/premium/PremiumModal";
import type { NewsletterStatsResponse } from "@/app/api/user/stats/newsletters/route";
import { DomainIcon } from "@/components/charts/DomainIcon";
import { PremiumTooltip, usePremium } from "@/components/PremiumAlert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { NewsletterStatus } from "@/generated/prisma/enums";
import { useAccount } from "@/providers/EmailAccountProvider";
import { cn } from "@/utils";
import { extractDomainFromEmail } from "@/utils/email";

type Newsletter = NewsletterStatsResponse["newsletters"][number];

function ActionButton({
  icon: Icon,
  label,
  loadingLabel,
  onClick,
  loading,
  danger,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  loadingLabel?: string;
  onClick: () => void;
  loading?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      className={cn(
        "flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 font-medium text-sm transition-colors",
        "text-gray-600 hover:bg-gray-100 hover:text-gray-900",
        danger && "hover:text-red-600",
        loading && "cursor-not-allowed opacity-50"
      )}
      disabled={loading}
      onClick={onClick}
      type="button"
    >
      {loading ? (
        <Loader2Icon className="size-4 animate-spin" />
      ) : (
        <Icon className="size-4" />
      )}
      {loading && loadingLabel ? loadingLabel : label}
    </button>
  );
}

export function BulkActions({
  selected,
  mutate,
  onClearSelection,
  deselectItem,
  newsletters,
  filter,
  totalCount,
}: {
  selected: Map<string, boolean>;
  // biome-ignore lint/suspicious/noExplicitAny: matches SWR mutate return type
  mutate: () => Promise<any>;
  onClearSelection: () => void;
  deselectItem: (id: string) => void;
  newsletters?: Newsletter[];
  filter: NewsletterFilterType;
  totalCount: number;
}) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = useState(false);
  const [autoArchiveDialogOpen, setAutoArchiveDialogOpen] = useState(false);

  const posthog = usePostHog();
  const { hasUnsubscribeAccess, mutate: refetchPremium } = usePremium();
  const { PremiumModal, openModal } = usePremiumModal();
  const { emailAccountId } = useAccount();
  const { onBulkUnsubscribe } = useBulkUnsubscribe({
    hasUnsubscribeAccess,
    mutate,
    posthog,
    refetchPremium,
    emailAccountId,
    onDeselectItem: deselectItem,
    filter,
  });

  const { onBulkApprove } = useBulkApprove({
    mutate,
    posthog,
    emailAccountId,
    onDeselectItem: deselectItem,
    filter,
  });

  const { onBulkAutoArchive } = useBulkAutoArchive({
    hasUnsubscribeAccess,
    mutate,
    refetchPremium,
    emailAccountId,
    onDeselectItem: deselectItem,
    filter,
  });

  const { onBulkArchive, isBulkArchiving } = useBulkArchive({
    mutate,
    posthog,
    emailAccountId,
  });

  const { onBulkDelete, isBulkDeleting } = useBulkDelete({
    mutate,
    posthog,
    emailAccountId,
  });

  const getSelectedValues = () =>
    Array.from(selected.entries())
      .filter(([, value]) => value)
      .map(([name, value]) => ({
        name,
        value,
      }));

  const selectedCount = Array.from(selected.values()).filter(Boolean).length;
  const isVisible = selectedCount > 0;

  // Get the selected newsletters with their details
  const selectedNewsletters =
    newsletters?.filter((n) => selected.get(n.name)) || [];

  // Check if all selected newsletters are already approved
  const allSelectedAreApproved = useMemo(() => {
    if (selectedNewsletters.length === 0) {
      return false;
    }
    return selectedNewsletters.every(
      (n) => n.status === NewsletterStatus.APPROVED
    );
  }, [selectedNewsletters]);

  return (
    <>
      <AnimatePresence>
        {isVisible && (
          <motion.div
            animate={{ opacity: 1, height: "auto" }}
            className="overflow-hidden"
            exit={{ opacity: 0, height: 0 }}
            initial={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
          >
            <PremiumTooltip
              openModal={openModal}
              showTooltip={!hasUnsubscribeAccess}
            >
              <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                {/* Left side: Close button and selection count */}
                <div className="flex items-center gap-3">
                  <button
                    className="rounded p-1 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-700"
                    onClick={onClearSelection}
                    type="button"
                  >
                    <XIcon className="size-4" />
                  </button>
                  <span className="text-gray-600 text-sm">
                    {selectedCount} of {totalCount} selected
                  </span>
                </div>

                {/* Right side: Action Buttons */}
                <div className="flex flex-nowrap items-center gap-1">
                  <ActionButton
                    icon={MailXIcon}
                    label="Unsubscribe"
                    onClick={() => onBulkUnsubscribe(getSelectedValues())}
                  />
                  <ActionButton
                    icon={ArchiveIcon}
                    label="Auto Archive"
                    onClick={() => setAutoArchiveDialogOpen(true)}
                  />
                  <ActionButton
                    icon={
                      allSelectedAreApproved ? ThumbsDownIcon : ThumbsUpIcon
                    }
                    label={allSelectedAreApproved ? "Unapprove" : "Approve"}
                    onClick={() =>
                      onBulkApprove(getSelectedValues(), allSelectedAreApproved)
                    }
                  />
                  <ActionButton
                    icon={ArchiveIcon}
                    label="Archive"
                    loading={isBulkArchiving}
                    loadingLabel="Archiving"
                    onClick={() => setArchiveDialogOpen(true)}
                  />
                  <ActionButton
                    danger
                    icon={TrashIcon}
                    label="Delete"
                    loading={isBulkDeleting}
                    loadingLabel="Deleting"
                    onClick={() => setDeleteDialogOpen(true)}
                  />
                </div>
              </div>
            </PremiumTooltip>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Dialog */}
      <Dialog onOpenChange={setDeleteDialogOpen} open={deleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete all emails?</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete all emails from these senders.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {/* Selected Senders List */}
          {selectedNewsletters.length > 0 && (
            <div className="max-h-[300px] overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {selectedNewsletters.map((newsletter) => {
                  const domain =
                    extractDomainFromEmail(newsletter.name) || newsletter.name;
                  return (
                    <div
                      className="flex items-center gap-3 px-3 py-2"
                      key={newsletter.name}
                    >
                      <DomainIcon
                        domain={domain}
                        size={32}
                        variant="circular"
                      />
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate font-medium text-sm">
                          {newsletter.fromName || newsletter.name}
                        </span>
                        {newsletter.fromName && (
                          <span className="truncate text-muted-foreground text-xs">
                            {newsletter.name}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              onClick={() => setDeleteDialogOpen(false)}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                onBulkDelete(getSelectedValues());
                setDeleteDialogOpen(false);
              }}
              variant="destructive"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Archive Confirmation Dialog */}
      <Dialog onOpenChange={setArchiveDialogOpen} open={archiveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive all emails?</DialogTitle>
            <DialogDescription>
              Are you sure you want to archive all emails from these senders?
            </DialogDescription>
          </DialogHeader>

          {/* Selected Senders List */}
          {selectedNewsletters.length > 0 && (
            <div className="max-h-[300px] overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {selectedNewsletters.map((newsletter) => {
                  const domain =
                    extractDomainFromEmail(newsletter.name) || newsletter.name;
                  return (
                    <div
                      className="flex items-center gap-3 px-3 py-2"
                      key={newsletter.name}
                    >
                      <DomainIcon
                        domain={domain}
                        size={32}
                        variant="circular"
                      />
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate font-medium text-sm">
                          {newsletter.fromName || newsletter.name}
                        </span>
                        {newsletter.fromName && (
                          <span className="truncate text-muted-foreground text-xs">
                            {newsletter.name}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              onClick={() => setArchiveDialogOpen(false)}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                onBulkArchive(getSelectedValues());
                setArchiveDialogOpen(false);
              }}
            >
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Auto Archive Confirmation Dialog */}
      <Dialog
        onOpenChange={setAutoArchiveDialogOpen}
        open={autoArchiveDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Auto archive these senders?</DialogTitle>
            <DialogDescription>
              Automatically archive all current and future emails from these
              senders. They will no longer appear in your inbox.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              onClick={() => setAutoArchiveDialogOpen(false)}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                onBulkAutoArchive(getSelectedValues());
                setAutoArchiveDialogOpen(false);
              }}
            >
              Auto Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PremiumModal />
    </>
  );
}
