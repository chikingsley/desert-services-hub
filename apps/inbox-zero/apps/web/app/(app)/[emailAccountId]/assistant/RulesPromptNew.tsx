"use client";

import { PlusIcon, UserPenIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocalStorage } from "usehooks-ts";
import { AvailableActionsPanel } from "@/app/(app)/[emailAccountId]/assistant/AvailableActionsPanel";
import { CreatedRulesModal } from "@/app/(app)/[emailAccountId]/assistant/CreatedRulesModal";
import { ExamplesGrid } from "@/app/(app)/[emailAccountId]/assistant/ExamplesList";
import { getPersonas } from "@/app/(app)/[emailAccountId]/assistant/examples";
import { PersonaDialog } from "@/app/(app)/[emailAccountId]/assistant/PersonaDialog";
import { ProcessingPromptFileDialog } from "@/app/(app)/[emailAccountId]/assistant/ProcessingPromptFileDialog";
import { RuleDialog } from "@/app/(app)/[emailAccountId]/assistant/RuleDialog";
import {
  SimpleRichTextEditor,
  type SimpleRichTextEditorRef,
} from "@/components/editor/SimpleRichTextEditor";
import { LoadingContent } from "@/components/LoadingContent";
import { toastError } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useDialogState } from "@/hooks/useDialogState";
import { useLabels } from "@/hooks/useLabels";
import { useModal } from "@/hooks/useModal";
import { useRules } from "@/hooks/useRules";
import { useAccount } from "@/providers/EmailAccountProvider";
import { createRulesAction } from "@/utils/actions/ai-rule";
import type { CreateRuleResult } from "@/utils/rule/types";

export function RulesPrompt() {
  const { emailAccountId, provider } = useAccount();
  const { isModalOpen, setIsModalOpen } = useModal();
  const onOpenPersonaDialog = useCallback(
    () => setIsModalOpen(true),
    [setIsModalOpen]
  );

  const [persona, setPersona] = useState<string | null>(null);
  const personas = getPersonas(provider);

  const examples = persona
    ? personas[persona as keyof typeof personas]?.promptArray
    : undefined;

  return (
    <>
      <RulesPromptForm
        emailAccountId={emailAccountId}
        examples={examples}
        onHideExamples={() => setPersona(null)}
        onOpenPersonaDialog={onOpenPersonaDialog}
        provider={provider}
      />
      <PersonaDialog
        isOpen={isModalOpen}
        onSelect={setPersona}
        personas={personas}
        setIsOpen={setIsModalOpen}
      />
    </>
  );
}

function RulesPromptForm({
  emailAccountId,
  provider,
  examples,
  onOpenPersonaDialog,
  onHideExamples,
}: {
  emailAccountId: string;
  provider: string;
  examples?: string[];
  onOpenPersonaDialog: () => void;
  onHideExamples: () => void;
}) {
  const { mutate } = useRules();
  const { userLabels, isLoading: isLoadingLabels } = useLabels();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isProcessingDialogOpen, setIsProcessingDialogOpen] = useState(false);
  const [createdRules, setCreatedRules] = useState<CreateRuleResult[] | null>(
    null
  );
  const [showCreatedRulesModal, setShowCreatedRulesModal] = useState(false);
  const [
    viewedProcessingPromptFileDialog,
    setViewedProcessingPromptFileDialog,
  ] = useLocalStorage("viewedProcessingPromptFileDialog", false);

  const ruleDialog = useDialogState();

  const editorRef = useRef<SimpleRichTextEditorRef>(null);

  const onSubmit = useCallback(async () => {
    const markdown = editorRef.current?.getMarkdown();
    if (typeof markdown !== "string") {
      return;
    }
    if (markdown.trim() === "") {
      toastError({
        description: "Please enter a prompt to create rules",
      });
      return;
    }

    setIsSubmitting(true);
    if (!viewedProcessingPromptFileDialog) {
      setIsProcessingDialogOpen(true);
    }
    setCreatedRules(null);

    toast.promise(
      async () => {
        const result = await createRulesAction(emailAccountId, {
          prompt: markdown,
        }).finally(() => {
          setIsSubmitting(false);
        });

        if (result?.serverError) {
          throw new Error(result.serverError);
        }

        mutate();

        return result;
      },
      {
        loading: "Creating rules...",
        success: (result) => {
          const { rules = [], errors = [] } = result?.data || {};
          setCreatedRules(rules);

          if (errors.length > 0) {
            const errorDetails = errors
              .map((e) => `${e.ruleName}: ${e.error}`)
              .join(", ");
            return `${rules.length} rules created. ${errors.length} failed: ${errorDetails}`;
          }

          return `${rules.length} rules created!`;
        },
        error: (err) => {
          return `Error creating rules: ${err.message}`;
        },
      }
    );
  }, [mutate, viewedProcessingPromptFileDialog, emailAccountId]);

  useEffect(() => {
    if (createdRules && createdRules.length > 0 && !isProcessingDialogOpen) {
      setShowCreatedRulesModal(true);
    }
  }, [createdRules, isProcessingDialogOpen]);

  const addExamplePrompt = useCallback((example: string) => {
    editorRef.current?.appendText(`\n* ${example.trim()}`);
  }, []);

  return (
    <div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr,250px]">
        <div className="grid gap-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit();
            }}
          >
            <Label className="font-title text-xl leading-7">
              Add new rules
            </Label>

            <div className="mt-1.5 space-y-2">
              <LoadingContent
                loading={isLoadingLabels}
                loadingComponent={<Skeleton className="min-h-[180px] w-full" />}
              >
                <SimpleRichTextEditor
                  defaultValue={undefined}
                  minHeight={180}
                  placeholder={`* Label urgent emails as "Urgent"
* Forward receipts to jane@accounting.com`}
                  ref={editorRef}
                  userLabels={userLabels}
                />
              </LoadingContent>

              <div className="flex flex-col flex-wrap gap-2 sm:flex-row">
                <Button loading={isSubmitting} size="sm" type="submit">
                  Create rules
                </Button>

                <Button
                  onClick={examples ? onHideExamples : onOpenPersonaDialog}
                  size="sm"
                  variant="outline"
                >
                  <UserPenIcon className="mr-2 size-4" />
                  {examples ? "Hide examples" : "Choose from examples"}
                </Button>

                <Button
                  className="ml-auto w-full sm:w-auto"
                  Icon={PlusIcon}
                  onClick={() => ruleDialog.onOpen()}
                  size="sm"
                  variant="outline"
                >
                  Add rule manually
                </Button>
              </div>
            </div>
          </form>
        </div>

        <div className="pr-4">
          <AvailableActionsPanel />
        </div>
      </div>

      {examples && (
        <div className="mt-2">
          <Label className="font-title text-xl leading-7">Examples</Label>
          <div className="mt-1.5">
            <ExamplesGrid
              examples={examples}
              onSelect={addExamplePrompt}
              provider={provider}
            />
          </div>
        </div>
      )}

      <RuleDialog
        editMode={false}
        isOpen={ruleDialog.isOpen}
        onClose={ruleDialog.onClose}
        onSuccess={() => {
          mutate();
          ruleDialog.onClose();
        }}
      />

      <ProcessingPromptFileDialog
        onOpenChange={setIsProcessingDialogOpen}
        open={isProcessingDialogOpen}
        result={createdRules}
        setViewedProcessingPromptFileDialog={
          setViewedProcessingPromptFileDialog
        }
      />

      <CreatedRulesModal
        onOpenChange={(open) => {
          setShowCreatedRulesModal(open);

          // Clear results when modal closes to prevent re-showing
          if (!open) {
            setCreatedRules(null);
          }
        }}
        open={showCreatedRulesModal}
        rules={createdRules}
      />
    </div>
  );
}
