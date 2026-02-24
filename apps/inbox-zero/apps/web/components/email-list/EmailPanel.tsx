import { XIcon } from "lucide-react";
import { ActionButtons } from "@/components/ActionButtons";
import { EmailThread } from "@/components/email-list/EmailThread";
import { PlanExplanation } from "@/components/email-list/PlanExplanation";
import type { Thread } from "@/components/email-list/types";
import { Tooltip } from "@/components/Tooltip";
import { MutedText } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useIsInAiQueue } from "@/store/ai-queue";

export function EmailPanel({
  row,
  onPlanAiAction,
  onArchive,
  advanceToAdjacentThread,
  close,
  refetch,
}: {
  row: Thread;
  onPlanAiAction: (thread: Thread) => void;
  onArchive: (thread: Thread) => void;
  advanceToAdjacentThread: () => void;
  close: () => void;
  refetch: () => void;
}) {
  const { provider } = useAccount();
  const isPlanning = useIsInAiQueue(row.id);

  const lastMessage = row.messages?.[row.messages.length - 1];

  const plan = row.plan;

  return (
    <div className="flex h-full flex-col overflow-y-hidden border-border border-l">
      <div className="sticky border-border border-b p-4 md:flex md:items-center md:justify-between">
        <div className="md:w-0 md:flex-1">
          <h1
            className="font-medium text-foreground text-lg"
            id="message-heading"
          >
            {lastMessage.headers.subject}
          </h1>
          <MutedText className="mt-1 truncate">
            {lastMessage.headers.from}
          </MutedText>
        </div>

        <div className="mt-3 flex items-center md:mt-0 md:ml-2">
          <ActionButtons
            isPlanning={isPlanning}
            onArchive={() => {
              onArchive(row);
              advanceToAdjacentThread();
            }}
            onPlanAiAction={() => onPlanAiAction(row)}
            refetch={refetch}
            threadId={row.id!}
          />
          <Tooltip content="Close">
            <Button onClick={close} size="icon" variant="ghost">
              <span className="sr-only">Close</span>
              <XIcon aria-hidden="true" className="h-4 w-4" />
            </Button>
          </Tooltip>
        </div>
      </div>
      <div className="flex flex-1 flex-col overflow-y-auto">
        {plan?.rule && <PlanExplanation provider={provider} thread={row} />}
        <EmailThread
          key={row.id}
          messages={row.messages}
          refetch={refetch}
          showReplyButton
        />
      </div>
    </div>
  );
}
