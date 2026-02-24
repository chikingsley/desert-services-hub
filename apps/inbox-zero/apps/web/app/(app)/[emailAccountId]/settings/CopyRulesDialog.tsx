"use client";

import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import type { RulesResponse } from "@/app/api/user/rules/route";
import { LoadingContent } from "@/components/LoadingContent";
import { toastError } from "@/components/Toast";
import { MutedText } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { copyRulesFromAccountAction } from "@/utils/actions/rule";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";
import { getActionErrorMessage } from "@/utils/error";
import { prefixPath } from "@/utils/path";

type SourceAccount = {
  id: string;
  name: string | null;
  email: string;
};

interface CopyRulesDialogProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  sourceAccounts: SourceAccount[];
  targetAccountEmail: string;
  targetAccountId: string;
}

export function CopyRulesDialog({
  open,
  onOpenChange,
  targetAccountId,
  targetAccountEmail,
  sourceAccounts,
}: CopyRulesDialogProps) {
  const router = useRouter();
  const [selectedSourceId, setSelectedSourceId] = useState<string>("");
  const [selectedRuleIds, setSelectedRuleIds] = useState<Set<string>>(
    new Set()
  );

  // Fetch rules from the selected source account
  const {
    data: rules,
    isLoading,
    error,
  } = useSWR<RulesResponse>(
    selectedSourceId ? "/api/user/rules" : null,
    (url: string) =>
      fetch(url, {
        headers: { [EMAIL_ACCOUNT_HEADER]: selectedSourceId },
      }).then((res) => res.json())
  );

  const { execute, isExecuting } = useAction(copyRulesFromAccountAction, {
    onSuccess: (result) => {
      const { copiedCount, replacedCount } = result.data || {};
      toast.success("Rules transferred successfully", {
        description: `${copiedCount || 0} rules transferred, ${replacedCount || 0} rules updated.`,
        action: {
          label: "View rules",
          onClick: () => {
            router.push(prefixPath(targetAccountId, "/automation"));
          },
        },
      });
      onOpenChange(false);
      resetState();
    },
    onError: (error) => {
      toastError({
        title: "Error transferring rules",
        description: getActionErrorMessage(error.error),
      });
    },
  });

  const selectedSource = sourceAccounts.find((a) => a.id === selectedSourceId);

  const allSelected = useMemo(() => {
    if (!rules || rules.length === 0) {
      return false;
    }
    return rules.every((rule) => selectedRuleIds.has(rule.id));
  }, [rules, selectedRuleIds]);

  const someSelected = useMemo(() => {
    if (!rules || rules.length === 0) {
      return false;
    }
    return (
      rules.some((rule) => selectedRuleIds.has(rule.id)) &&
      !rules.every((rule) => selectedRuleIds.has(rule.id))
    );
  }, [rules, selectedRuleIds]);

  const handleSelectAll = (checked: boolean) => {
    if (!rules) {
      return;
    }
    if (checked) {
      setSelectedRuleIds(new Set(rules.map((r) => r.id)));
    } else {
      setSelectedRuleIds(new Set());
    }
  };

  const handleToggleRule = (ruleId: string, checked: boolean) => {
    setSelectedRuleIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(ruleId);
      } else {
        next.delete(ruleId);
      }
      return next;
    });
  };

  const handleCopy = () => {
    if (selectedRuleIds.size === 0) {
      return;
    }
    execute({
      sourceEmailAccountId: selectedSourceId,
      targetEmailAccountId: targetAccountId,
      ruleIds: Array.from(selectedRuleIds),
    });
  };

  const resetState = () => {
    setSelectedSourceId("");
    setSelectedRuleIds(new Set());
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      resetState();
    }
    onOpenChange(open);
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="max-w-md">
        <DialogHeader className="pr-6">
          <DialogTitle className="break-words">
            Transfer rules to {targetAccountEmail}
          </DialogTitle>
          <DialogDescription>
            Select an account to transfer rules from. Rules with matching names
            will be replaced.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <span className="font-medium text-sm">Transfer from</span>
            <Select
              onValueChange={(value) => {
                setSelectedSourceId(value);
                setSelectedRuleIds(new Set());
              }}
              value={selectedSourceId}
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue placeholder="Select source account" />
              </SelectTrigger>
              <SelectContent>
                {sourceAccounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name || account.email}
                    {account.name && (
                      <span className="ml-2 text-muted-foreground">
                        ({account.email})
                      </span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedSourceId && (
            <LoadingContent error={error} loading={isLoading}>
              {rules && rules.length > 0 ? (
                <div className="overflow-hidden rounded-md border">
                  <Table>
                    <TableHeader className="sticky top-0 bg-muted">
                      <TableRow>
                        <TableHead className="w-10">
                          <div className="flex items-center justify-center">
                            <Checkbox
                              aria-label="Select all"
                              checked={
                                allSelected || (someSelected && "indeterminate")
                              }
                              onCheckedChange={handleSelectAll}
                            />
                          </div>
                        </TableHead>
                        <TableHead>Rule</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rules.map((rule) => (
                        <TableRow key={rule.id}>
                          <TableCell>
                            <div className="flex items-center justify-center">
                              <Checkbox
                                aria-label={`Select ${rule.name}`}
                                checked={selectedRuleIds.has(rule.id)}
                                onCheckedChange={(checked) =>
                                  handleToggleRule(rule.id, !!checked)
                                }
                              />
                            </div>
                          </TableCell>
                          <TableCell className="truncate font-medium">
                            {rule.name}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="border-t bg-muted/50 px-3 py-2 text-muted-foreground text-xs">
                    {selectedRuleIds.size} of {rules.length} selected
                  </div>
                </div>
              ) : (
                <MutedText className="py-4 text-center">
                  No rules found in {selectedSource?.email}
                </MutedText>
              )}
            </LoadingContent>
          )}
        </div>

        <DialogFooter>
          <Button onClick={() => handleOpenChange(false)} variant="outline">
            Cancel
          </Button>
          <Button
            disabled={selectedRuleIds.size === 0}
            loading={isExecuting}
            onClick={handleCopy}
          >
            Transfer{" "}
            {selectedRuleIds.size > 0 ? `${selectedRuleIds.size} ` : ""}
            rule{selectedRuleIds.size !== 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
