"use client";

import { CheckCircle2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { RuleDialog } from "@/app/(app)/[emailAccountId]/assistant/RuleDialog";
import { ActionBadges } from "@/app/(app)/[emailAccountId]/assistant/Rules";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDialogState } from "@/hooks/useDialogState";
import { useLabels } from "@/hooks/useLabels";
import { useAccount } from "@/providers/EmailAccountProvider";
import { conditionsToString } from "@/utils/condition";
import { prefixPath } from "@/utils/path";
import type { CreateRuleResult } from "@/utils/rule/types";

export function CreatedRulesModal({
  open,
  onOpenChange,
  rules,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rules: CreateRuleResult[] | null;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <CreatedRulesContent onOpenChange={onOpenChange} rules={rules || []} />
      </DialogContent>
    </Dialog>
  );
}

export function CreatedRulesContent({
  rules,
  onOpenChange,
}: {
  rules: CreateRuleResult[];
  onOpenChange: (open: boolean) => void;
}) {
  const { emailAccountId, provider } = useAccount();
  const ruleDialog = useDialogState<{ ruleId: string }>();
  const router = useRouter();

  const handleTestRules = () => {
    onOpenChange(false);
    router.push(prefixPath(emailAccountId, "/automation?tab=test"));
  };

  const { userLabels } = useLabels();

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <CheckCircle2 className="size-5 text-green-600" />
          Rules Created Successfully!
        </DialogTitle>
        <DialogDescription>
          {rules.length === 1
            ? "Your rule has been created. You can now test it or view the details below."
            : `${rules.length} rules have been created. You can now test them or view the details below.`}
        </DialogDescription>
      </DialogHeader>

      <div className="flex-1 overflow-y-auto">
        <div className="space-y-2">
          {rules.map((rule) => (
            <Card
              className="cursor-pointer p-4"
              key={rule.id}
              onClick={() => ruleDialog.onOpen({ ruleId: rule.id })}
              role="button"
              tabIndex={0}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-base">{rule.name}</h4>
                </div>

                <div className="text-sm">
                  <span className="font-medium">Condition:</span>{" "}
                  {conditionsToString(rule)}
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">Actions:</span>
                  <ActionBadges
                    actions={rule.actions}
                    labels={userLabels}
                    provider={provider}
                  />
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <DialogFooter className="flex gap-2">
        <Button onClick={() => onOpenChange(false)} variant="outline">
          Close
        </Button>
        <Button onClick={handleTestRules}>Test Rules</Button>
      </DialogFooter>
      <RuleDialog
        editMode={false}
        isOpen={ruleDialog.isOpen}
        onClose={ruleDialog.onClose}
        ruleId={ruleDialog.data?.ruleId}
      />
    </>
  );
}
