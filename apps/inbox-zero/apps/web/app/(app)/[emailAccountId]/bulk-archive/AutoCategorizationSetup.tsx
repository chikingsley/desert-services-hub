"use client";

import { ArchiveIcon, RotateCcwIcon, TagsIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { useCategorizeProgress } from "@/app/(app)/[emailAccountId]/smart-categories/CategorizeProgress";
import { SetupDialog } from "@/components/SetupCard";
import { toastError, toastSuccess } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/providers/EmailAccountProvider";
import { bulkCategorizeSendersAction } from "@/utils/actions/categorize";

const features = [
  {
    icon: <TagsIcon className="size-4 text-blue-500" />,
    title: "Sorted automatically",
    description:
      "We group senders into categories like Newsletters, Receipts, and Marketing",
  },
  {
    icon: <ArchiveIcon className="size-4 text-blue-500" />,
    title: "Archive by category",
    description:
      "Clean up an entire category at once instead of one email at a time",
  },
  {
    icon: <RotateCcwIcon className="size-4 text-blue-500" />,
    title: "Always reversible",
    description: "Emails are archived, not deleted — you can find them anytime",
  },
];

export function AutoCategorizationSetup({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { emailAccountId } = useAccount();
  const { setIsBulkCategorizing } = useCategorizeProgress();

  const [isEnabling, setIsEnabling] = useState(false);

  const enableFeature = useCallback(async () => {
    setIsEnabling(true);
    setIsBulkCategorizing(true);

    try {
      const result = await bulkCategorizeSendersAction(emailAccountId);

      if (result?.serverError) {
        throw new Error(result.serverError);
      }

      if (result?.data?.totalUncategorizedSenders) {
        toastSuccess({
          description: `Categorizing ${result.data.totalUncategorizedSenders} senders... This may take a few minutes.`,
        });
      } else {
        toastSuccess({ description: "No uncategorized senders found." });
        setIsBulkCategorizing(false);
      }
    } catch (error) {
      toastError({
        description: `Failed to enable feature: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
      setIsBulkCategorizing(false);
    } finally {
      setIsEnabling(false);
    }
  }, [emailAccountId, setIsBulkCategorizing]);

  return (
    <SetupDialog
      description="Archive thousands of emails in a few clicks."
      features={features}
      imageAlt="Bulk Archive"
      imageSrc="/images/illustrations/working-vacation.svg"
      onOpenChange={onOpenChange}
      open={open}
      title="Bulk Archive"
    >
      <Button loading={isEnabling} onClick={enableFeature}>
        Get Started
      </Button>
    </SetupDialog>
  );
}
