import { capitalCase } from "capital-case";
import groupBy from "lodash/groupBy";
import sortBy from "lodash/sortBy";
import { EyeIcon } from "lucide-react";
import { useRuleDialog } from "@/app/(app)/[emailAccountId]/assistant/RuleDialog";
import { Badge } from "@/components/Badge";
import { HoverCard } from "@/components/HoverCard";
import { getActionColor } from "@/components/PlanBadge";
import { MessageText, MutedText } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import type { Rule } from "@/generated/prisma/client";
import type { ActionType } from "@/generated/prisma/enums";
import { ExecutedRuleStatus, LogicalOperator } from "@/generated/prisma/enums";
import { useAccount } from "@/providers/EmailAccountProvider";
import { getActionDisplay, getActionIcon } from "@/utils/action-display";
import { sortActionsByPriority } from "@/utils/action-sort";
import type { RunRulesResult } from "@/utils/ai/choose-rule/run-rules";
import { conditionTypesToString } from "@/utils/condition";

export function ResultsDisplay({
  results,
  showFullContent = false,
}: {
  results: RunRulesResult[];
  showFullContent?: boolean;
}) {
  const groupedResults = groupBy(results, (result) => {
    return result.createdAt.toString();
  });

  const sortedBatches = sortBy(
    Object.entries(groupedResults),
    ([, batchResults]) => {
      const createdAt = batchResults[0]?.createdAt;
      return createdAt ? -new Date(createdAt) : 0; // Negative for descending order
    }
  );

  return (
    <div className="flex flex-col gap-2">
      {sortedBatches.map(([date, batchResults], batchIndex) => (
        <div key={date}>
          {batchIndex === 1 && sortedBatches.length > 1 && (
            <div className="my-1 text-muted-foreground text-xs">Previous:</div>
          )}
          <div
            className={showFullContent ? "flex flex-col gap-4" : "flex gap-1"}
          >
            {batchResults.map((result, resultIndex) => (
              <ResultDisplay
                key={`${date}-${resultIndex}`}
                result={result}
                showFullContent={showFullContent}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ResultDisplay({
  result,
  showFullContent = false,
}: {
  result: RunRulesResult;
  showFullContent?: boolean;
}) {
  const { rule, status } = result;

  if (showFullContent) {
    return (
      <div className="w-full">
        <ResultDisplayContent result={result} />
      </div>
    );
  }

  return (
    <HoverCard content={<ResultDisplayContent result={result} />}>
      <Badge className="whitespace-nowrap" color={rule ? "green" : "red"}>
        {rule
          ? rule.name
          : status === ExecutedRuleStatus.SKIPPED
            ? "No match found"
            : capitalCase(status)}
        <EyeIcon className="ml-1.5 size-3.5 opacity-70" />
      </Badge>
    </HoverCard>
  );
}

export function ResultDisplayContent({ result }: { result: RunRulesResult }) {
  const { rule, status, reason } = result;

  const { ruleDialog, RuleDialogComponent } = useRuleDialog();
  const { provider } = useAccount();

  return (
    <div>
      <div className="flex justify-between font-medium">
        {rule ? (
          <>
            {rule.name}
            <Badge color="blue">{conditionTypesToString(rule)}</Badge>
          </>
        ) : (
          status === ExecutedRuleStatus.SKIPPED && "No match found"
        )}
      </div>
      <div className="mt-2">
        {rule ? <PrettyConditions rule={rule} /> : null}
      </div>
      <div className="mt-2">
        {!!rule && (
          <Button
            onClick={() => {
              ruleDialog.onOpen({ ruleId: rule.id });
            }}
            size="sm"
          >
            View matching rule
          </Button>
        )}
      </div>

      <div className="mt-2">
        {result.actionItems?.length ? (
          <>
            <div className="mb-1 font-medium text-sm">Actions:</div>
            <Actions
              actions={
                result.actionItems?.map((action) => ({
                  id: action.id,
                  type: action.type,
                  label: action.label,
                  folderName: action.folderName,
                  content: action.content,
                  to: action.to,
                  subject: action.subject,
                  cc: action.cc,
                  bcc: action.bcc,
                  url: action.url,
                })) || []
              }
              labels={[]}
              provider={provider}
            />
          </>
        ) : (
          <div className="text-muted-foreground text-sm">No actions taken</div>
        )}
      </div>

      {!!reason && (
        <div className="mt-4 space-y-2 rounded-md bg-muted p-2">
          <div className="font-medium text-sm">
            Reason for choosing this rule:
          </div>
          <MessageText>{reason}</MessageText>
        </div>
      )}

      <RuleDialogComponent />
    </div>
  );
}

function Actions({
  actions,
  provider,
  labels,
}: {
  actions: {
    id: string;
    type: ActionType;
    label?: string | null;
    labelId?: string | null;
    folderName?: string | null;
    content?: string | null;
    to?: string | null;
    subject?: string | null;
    cc?: string | null;
    bcc?: string | null;
    url?: string | null;
  }[];
  provider: string;
  labels: Array<{ id: string; name: string }>;
}) {
  return (
    <div className="flex flex-col flex-wrap gap-2">
      {sortActionsByPriority(actions).map((action) => {
        const Icon = getActionIcon(action.type);
        const fields = [
          { key: "to", value: action.to },
          { key: "cc", value: action.cc },
          { key: "bcc", value: action.bcc },
          { key: "subject", value: action.subject },
          { key: "content", value: action.content },
          { key: "url", value: action.url },
        ].filter((field) => field.value);

        return (
          <div className="flex flex-col gap-1" key={action.id}>
            <Badge
              className="w-fit text-nowrap"
              color={getActionColor(action.type)}
            >
              <Icon className="mr-1.5 size-3" />
              {getActionDisplay(action, provider, labels)}
            </Badge>
            {fields.length > 0 && (
              <div className="ml-1 space-y-0.5 text-muted-foreground text-sm">
                {fields.map((field) => (
                  <div
                    className="whitespace-pre-wrap break-all"
                    key={field.key}
                  >
                    <span className="font-medium capitalize">{field.key}:</span>{" "}
                    {field.value}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PrettyConditions({
  rule,
}: {
  rule: Pick<
    Rule,
    "from" | "to" | "subject" | "body" | "instructions" | "conditionalOperator"
  >;
}) {
  const conditions: string[] = [];

  // Static conditions - grouped with commas
  const staticConditions: string[] = [];
  if (rule.from) {
    staticConditions.push(`From: ${rule.from}`);
  }
  if (rule.subject) {
    staticConditions.push(`Subject: "${rule.subject}"`);
  }
  if (rule.to) {
    staticConditions.push(`To: ${rule.to}`);
  }
  if (rule.body) {
    staticConditions.push(`Body: "${rule.body}"`);
  }
  if (staticConditions.length) {
    conditions.push(staticConditions.join(", "));
  }

  // AI condition
  if (rule.instructions) {
    conditions.push(rule.instructions);
  }

  const operator =
    rule.conditionalOperator === LogicalOperator.AND ? "AND" : "OR";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {conditions.map((condition, index) => (
        <div className="flex items-center gap-1.5" key={index}>
          <MutedText>{condition}</MutedText>
          {index < conditions.length - 1 && (
            <Badge className="text-xs" color="purple">
              {operator}
            </Badge>
          )}
        </div>
      ))}
    </div>
  );
}
