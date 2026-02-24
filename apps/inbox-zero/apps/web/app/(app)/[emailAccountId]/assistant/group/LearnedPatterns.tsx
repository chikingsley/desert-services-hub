"use client";

import { BrainIcon } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { useState } from "react";
import { ViewLearnedPatterns } from "@/app/(app)/[emailAccountId]/assistant/group/ViewLearnedPatterns";
import { toastError } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccount } from "@/providers/EmailAccountProvider";
import { createGroupAction } from "@/utils/actions/group";
import { getActionErrorMessage } from "@/utils/error";

export function LearnedPatternsDialog({
  ruleId,
  groupId,
  disabled,
}: {
  ruleId: string;
  groupId: string | null;
  disabled?: boolean;
}) {
  const { emailAccountId } = useAccount();

  const [learnedPatternGroupId, setLearnedPatternGroupId] = useState<
    string | null
  >(groupId);

  const { execute, isExecuting } = useAction(
    createGroupAction.bind(null, emailAccountId),
    {
      onSuccess: (data) => {
        if (data.data?.groupId) {
          setLearnedPatternGroupId(data.data.groupId);
        } else {
          toastError({
            description: "There was an error setting up learned patterns.",
          });
        }
      },
      onError: (error) => {
        toastError({
          description: getActionErrorMessage(error.error),
        });
      },
    }
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          disabled={disabled}
          Icon={BrainIcon}
          onClick={async () => {
            if (!ruleId) {
              return;
            }
            if (groupId) {
              return;
            }
            if (isExecuting) {
              return;
            }

            execute({ ruleId });
          }}
          size="sm"
          variant="outline"
        >
          View learned patterns
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Learned patterns</DialogTitle>
          <DialogDescription>
            Learned patterns are patterns that the AI has learned from your
            email history. When a learned pattern is matched other rules
            conditions are skipped and this rule is automatically selected.
          </DialogDescription>
        </DialogHeader>

        {isExecuting ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          learnedPatternGroupId && (
            <ViewLearnedPatterns groupId={learnedPatternGroupId} />
          )
        )}
      </DialogContent>
    </Dialog>
  );
}
