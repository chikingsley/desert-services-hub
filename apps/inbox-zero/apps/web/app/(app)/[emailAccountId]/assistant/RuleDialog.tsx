"use client";

import { useCallback, useMemo } from "react";
import type { RulesResponse } from "@/app/api/user/rules/route";
import { LoadingContent } from "@/components/LoadingContent";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ActionType, LogicalOperator } from "@/generated/prisma/enums";
import { useDialogState } from "@/hooks/useDialogState";
import { useRule } from "@/hooks/useRule";
import type { CreateRuleBody } from "@/utils/actions/rule.validation";
import { ConditionType } from "@/utils/config";
import { RuleForm } from "./RuleForm";

interface RuleDialogProps {
  duplicateRule?: RulesResponse[number];
  editMode?: boolean;
  initialRule?: Partial<CreateRuleBody>;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  ruleId?: string;
}

export function useRuleDialog() {
  const ruleDialog = useDialogState<{ ruleId: string }>();

  const RuleDialogComponent = useCallback(() => {
    return (
      <RuleDialog
        editMode={false}
        isOpen={ruleDialog.isOpen}
        onClose={ruleDialog.onClose}
        ruleId={ruleDialog.data?.ruleId}
      />
    );
  }, [ruleDialog.data?.ruleId, ruleDialog.isOpen, ruleDialog.onClose]);

  return { ruleDialog, RuleDialogComponent };
}

export function RuleDialog({
  ruleId,
  duplicateRule,
  isOpen,
  onClose,
  onSuccess,
  initialRule,
  editMode = true,
}: RuleDialogProps) {
  const { data, isLoading, error, mutate } = useRule(ruleId || "");

  const handleSuccess = () => {
    onSuccess?.();
    onClose();
  };

  // Transform duplicateRule to initialRule format
  const duplicateInitialRule = useMemo(() => {
    if (!duplicateRule) {
      return undefined;
    }
    return transformRuleForDuplication(duplicateRule);
  }, [duplicateRule]);

  // Use duplicateInitialRule if provided, otherwise use initialRule
  const finalInitialRule = duplicateInitialRule || initialRule;

  return (
    <Dialog onOpenChange={onClose} open={isOpen}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader className={ruleId ? "sr-only" : ""}>
          <DialogTitle>{ruleId ? "Edit Rule" : "Create Rule"}</DialogTitle>
        </DialogHeader>
        <div>
          {ruleId ? (
            <LoadingContent error={error} loading={isLoading}>
              {data && (
                <RuleForm
                  alwaysEditMode={editMode}
                  isDialog={true}
                  mutate={mutate}
                  onCancel={onClose}
                  onSuccess={handleSuccess}
                  rule={data.rule}
                />
              )}
            </LoadingContent>
          ) : (
            <RuleForm
              alwaysEditMode={true}
              isDialog={true}
              onCancel={onClose}
              onSuccess={handleSuccess}
              rule={{
                name: "",
                conditions: [
                  {
                    type: ConditionType.AI,
                  },
                ],
                actions: [
                  {
                    type: ActionType.LABEL,
                  },
                ],
                runOnThreads: true,
                conditionalOperator: LogicalOperator.AND,
                ...finalInitialRule,
              }}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function transformRuleForDuplication(
  rule: RulesResponse[number]
): Partial<CreateRuleBody> {
  const conditions: CreateRuleBody["conditions"] = [];

  // Add AI condition if instructions exist
  if (rule.instructions) {
    conditions.push({
      type: ConditionType.AI,
      instructions: rule.instructions,
    });
  }

  // Add static condition if any static fields exist
  if (rule.from || rule.to || rule.subject || rule.body) {
    conditions.push({
      type: ConditionType.STATIC,
      from: rule.from || undefined,
      to: rule.to || undefined,
      subject: rule.subject || undefined,
      body: rule.body || undefined,
    });
  }

  // If no conditions were created, add a default AI condition
  if (conditions.length === 0) {
    conditions.push({
      type: ConditionType.AI,
    });
  }

  return {
    name: `${rule.name} (Copy)`,
    instructions: rule.instructions || undefined,
    groupId: rule.groupId || undefined,
    runOnThreads: rule.runOnThreads,
    conditionalOperator: rule.conditionalOperator,
    conditions,
    actions: rule.actions.map((action) => ({
      type: action.type,
      labelId: action.labelId
        ? { value: action.labelId, name: action.label || undefined }
        : undefined,
      subject: action.subject ? { value: action.subject } : undefined,
      content: action.content ? { value: action.content } : undefined,
      to: action.to ? { value: action.to } : undefined,
      cc: action.cc ? { value: action.cc } : undefined,
      bcc: action.bcc ? { value: action.bcc } : undefined,
      url: action.url ? { value: action.url } : undefined,
      folderName: action.folderName ? { value: action.folderName } : undefined,
      folderId: action.folderId ? { value: action.folderId } : undefined,
      delayInMinutes: action.delayInMinutes || undefined,
    })),
  };
}
