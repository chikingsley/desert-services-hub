import { memo } from "react";
import { getExamplePrompts } from "@/app/(app)/[emailAccountId]/assistant/examples";
import type { Color } from "@/components/Badge";
import { getActionColor } from "@/components/PlanBadge";
import { SectionHeader } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ActionType } from "@/generated/prisma/enums";
import { cn } from "@/utils";
import { getActionIcon } from "@/utils/action-display";
import { convertLabelsToDisplay } from "@/utils/mention";

function PureExamples({
  examples,
  onSelect,
  provider,
  className = "mt-1.5 sm:h-[60vh] sm:max-h-[60vh]",
}: {
  examples: string[];
  onSelect: (example: string) => void;
  provider: string;
  className?: string;
}) {
  const examplePrompts = getExamplePrompts(provider, examples);

  return (
    <div>
      <SectionHeader className="text-xl">Examples</SectionHeader>

      <ScrollArea className={className}>
        <div className="grid grid-cols-1 gap-2">
          {examplePrompts.map((example) => {
            const actionType = getActionType(example);
            const Icon = actionType ? getActionIcon(actionType) : null;
            const color = actionType ? getActionColor(actionType) : "gray";

            return (
              <Button
                className="h-auto w-full justify-start text-wrap py-2 text-left"
                key={example}
                onClick={() => onSelect(example)}
                variant="outline"
              >
                <div className="flex w-full items-start gap-2">
                  {Icon && (
                    <Icon
                      className={cn(
                        "mt-0.5 h-4 w-4 flex-shrink-0",
                        getIconColorClass(color)
                      )}
                    />
                  )}
                  <span className="flex-1">
                    {convertLabelsToDisplay(example)}
                  </span>
                </div>
              </Button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}

export const Examples = memo(PureExamples);

function PureExamplesGrid({
  examples,
  onSelect,
  provider,
}: {
  examples: string[];
  onSelect: (example: string) => void;
  provider: string;
  className?: string;
}) {
  const examplePrompts = getExamplePrompts(provider, examples);

  return (
    <div className="grid grid-cols-2 gap-4">
      {examplePrompts.map((example) => {
        const actionType = getActionType(example);
        const Icon = actionType ? getActionIcon(actionType) : null;
        const color = actionType ? getActionColor(actionType) : "gray";

        return (
          <Button
            className="h-auto w-full justify-start text-wrap py-2 text-left"
            key={example}
            onClick={() => onSelect(example)}
            variant="outline"
          >
            <div className="flex w-full items-start gap-2">
              {Icon && (
                <Icon
                  className={cn(
                    "mt-0.5 h-4 w-4 flex-shrink-0",
                    getIconColorClass(color)
                  )}
                />
              )}
              <span className="flex-1">{convertLabelsToDisplay(example)}</span>
            </div>
          </Button>
        );
      })}
    </div>
  );
}

export const ExamplesGrid = memo(PureExamplesGrid);

function getActionType(example: string): ActionType | null {
  const lowerExample = example.toLowerCase();

  if (lowerExample.includes("forward")) {
    return ActionType.FORWARD;
  }
  if (lowerExample.includes("draft")) {
    return ActionType.DRAFT_EMAIL;
  }
  if (lowerExample.includes("reply")) {
    return ActionType.REPLY;
  }
  if (lowerExample.includes("archive")) {
    return ActionType.ARCHIVE;
  }
  if (lowerExample.includes("spam")) {
    return ActionType.MARK_SPAM;
  }
  if (lowerExample.includes("mark")) {
    return ActionType.MARK_READ;
  }
  if (lowerExample.includes("label") || lowerExample.includes("categorize")) {
    return ActionType.LABEL;
  }

  return null;
}

function getIconColorClass(color: Color): string {
  switch (color) {
    case "green":
      return "text-green-600 dark:text-green-400";
    case "yellow":
      return "text-yellow-600 dark:text-yellow-400";
    case "blue":
      return "text-blue-600 dark:text-blue-400";
    case "red":
      return "text-red-600 dark:text-red-400";
    case "purple":
      return "text-purple-600 dark:text-purple-400";
    case "indigo":
      return "text-indigo-600 dark:text-indigo-400";
    default:
      return "text-gray-600 dark:text-gray-400";
  }
}
