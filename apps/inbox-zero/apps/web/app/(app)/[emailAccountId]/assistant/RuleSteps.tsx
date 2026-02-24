import { PlusIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Tooltip } from "@/components/Tooltip";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function RuleSteps({
  children,
  onAdd,
  addButtonLabel,
  addButtonDisabled = false,
  addButtonTooltip,
}: {
  children: ReactNode;
  onAdd: () => void;
  addButtonLabel: string;
  addButtonDisabled?: boolean;
  addButtonTooltip?: string;
}) {
  return (
    <Card className="space-y-2 border-none bg-gray-50 p-4 shadow-none dark:bg-gray-900">
      {children}
      <div>
        <Tooltip content={addButtonTooltip || ""} hide={!addButtonTooltip}>
          <span>
            <Button
              disabled={addButtonDisabled}
              Icon={PlusIcon}
              onClick={onAdd}
              size="sm"
              variant="ghost"
            >
              {addButtonLabel}
            </Button>
          </span>
        </Tooltip>
      </div>
    </Card>
  );
}
