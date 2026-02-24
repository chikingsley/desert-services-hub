import { TooltipExplanation } from "@/components/TooltipExplanation";
import { SectionHeader } from "@/components/Typography";
import { Card, CardContent } from "@/components/ui/card";
import { ActionType } from "@/generated/prisma/enums";
import { useAccount } from "@/providers/EmailAccountProvider";
import { getActionIcon } from "@/utils/action-display";
import {
  getAvailableActions,
  getExtraActions,
} from "@/utils/ai/rule/create-rule-schema";

const actionNames: Record<ActionType, string> = {
  [ActionType.LABEL]: "Label",
  [ActionType.MOVE_FOLDER]: "Move to folder",
  [ActionType.ARCHIVE]: "Archive",
  [ActionType.DRAFT_EMAIL]: "Draft replies",
  [ActionType.REPLY]: "Send replies",
  [ActionType.FORWARD]: "Forward",
  [ActionType.MARK_READ]: "Mark as read",
  [ActionType.MARK_SPAM]: "Mark as spam",
  [ActionType.SEND_EMAIL]: "Send email",
  [ActionType.CALL_WEBHOOK]: "Call webhook",
  [ActionType.DIGEST]: "Add to digest",
  [ActionType.NOTIFY_SENDER]: "Notify sender",
};

const actionTooltips: Partial<Record<ActionType, string>> = {
  [ActionType.CALL_WEBHOOK]:
    "For developers: trigger external integrations by sending email data to a custom URL",
  [ActionType.DIGEST]:
    "Group emails together and receive them as a daily summary",
};

export function AvailableActionsPanel() {
  const { provider } = useAccount();
  return (
    <Card className="hidden h-fit bg-slate-50 sm:block dark:bg-slate-900">
      <CardContent className="pt-4">
        <div className="grid gap-2">
          <ActionSection
            actions={[...getAvailableActions(provider), ...getExtraActions()]}
            title="Available Actions"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function ActionSection({
  title,
  actions,
}: {
  title: string;
  actions: ActionType[];
}) {
  return (
    <div>
      <SectionHeader>{title}</SectionHeader>
      <div className="mt-1 grid gap-2">
        {actions.map((actionType) => {
          const Icon = getActionIcon(actionType);
          const tooltip = actionTooltips[actionType];
          return (
            <div className="flex items-center gap-2" key={actionType}>
              <Icon className="size-3.5 text-muted-foreground" />
              <span className="text-sm">{actionNames[actionType]}</span>
              {tooltip && <TooltipExplanation size="sm" text={tooltip} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
