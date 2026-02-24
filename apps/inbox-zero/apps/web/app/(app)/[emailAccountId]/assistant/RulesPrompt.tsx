"use client";

import { HelpCircleIcon, SparklesIcon, UserPenIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import useSWR from "swr";
import { useLocalStorage } from "usehooks-ts";
import { AssistantOnboarding } from "@/app/(app)/[emailAccountId]/assistant/AssistantOnboarding";
import {
  getPersonas,
  type Personas,
} from "@/app/(app)/[emailAccountId]/assistant/examples";
import { PersonaDialog } from "@/app/(app)/[emailAccountId]/assistant/PersonaDialog";
import { ProcessingPromptFileDialog } from "@/app/(app)/[emailAccountId]/assistant/ProcessingPromptFileDialog";
import type { RulesPromptResponse } from "@/app/api/user/rules/prompt/route";
import {
  SimpleRichTextEditor,
  type SimpleRichTextEditorRef,
} from "@/components/editor/SimpleRichTextEditor";
import { LoadingContent } from "@/components/LoadingContent";
import { toastError } from "@/components/Toast";
import { Tooltip } from "@/components/Tooltip";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useLabels } from "@/hooks/useLabels";
import { useModal } from "@/hooks/useModal";
import { useAccount } from "@/providers/EmailAccountProvider";
import { cn } from "@/utils";
import {
  generateRulesPromptAction,
  saveRulesPromptAction,
} from "@/utils/actions/ai-rule";
import type { SaveRulesPromptBody } from "@/utils/actions/rule.validation";
import { prefixPath } from "@/utils/path";

export function RulesPrompt() {
  const { emailAccountId, provider } = useAccount();
  const { data, isLoading, error, mutate } = useSWR<
    RulesPromptResponse,
    { error: string }
  >("/api/user/rules/prompt");
  const { isModalOpen, setIsModalOpen } = useModal();
  const onOpenPersonaDialog = useCallback(
    () => setIsModalOpen(true),
    [setIsModalOpen]
  );

  const [persona, setPersona] = useState<string | null>(null);
  const personas = getPersonas(provider);

  const personaPrompt = persona
    ? personas[persona as keyof typeof personas]?.prompt
    : undefined;

  return (
    <>
      <LoadingContent
        error={error}
        loading={isLoading}
        loadingComponent={<Skeleton className="h-[60vh] w-full" />}
      >
        {data && (
          <div className="mt-4">
            <RulesPromptForm
              emailAccountId={emailAccountId}
              mutate={mutate}
              onOpenPersonaDialog={onOpenPersonaDialog}
              personaPrompt={personaPrompt}
              personas={personas}
              rulesPrompt={data.rulesPrompt}
              showExamples
            />
            <AssistantOnboarding
              onComplete={() => {
                if (!data.rulesPrompt) {
                  onOpenPersonaDialog();
                }
              }}
            />
          </div>
        )}
      </LoadingContent>
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
  rulesPrompt,
  personaPrompt,
  mutate,
  onOpenPersonaDialog,
  showExamples,
  personas,
}: {
  emailAccountId: string;
  rulesPrompt: string | null;
  personaPrompt?: string;
  mutate: () => void;
  onOpenPersonaDialog: () => void;
  showExamples?: boolean;
  personas: Personas;
}) {
  const { userLabels, isLoading: isLoadingLabels } = useLabels();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [_result, setResult] = useState<{
    createdRules: number;
    editedRules: number;
    removedRules: number;
  }>();
  const [
    viewedProcessingPromptFileDialog,
    setViewedProcessingPromptFileDialog,
  ] = useLocalStorage("viewedProcessingPromptFileDialog", false);

  const router = useRouter();

  const editorRef = useRef<SimpleRichTextEditorRef>(null);

  const onSubmit = useCallback(async () => {
    const markdown = editorRef.current?.getMarkdown();
    if (typeof markdown !== "string") {
      return;
    }

    setIsSubmitting(true);

    const saveRulesPromise = async (data: SaveRulesPromptBody) => {
      setIsSubmitting(true);
      const result = await saveRulesPromptAction(emailAccountId, data);

      if (result?.serverError) {
        setIsSubmitting(false);
        throw new Error(result.serverError);
      }

      if (viewedProcessingPromptFileDialog) {
        router.push(prefixPath(emailAccountId, "/automation?tab=test"));
      }

      mutate();
      setIsSubmitting(false);

      return result;
    };

    if (!viewedProcessingPromptFileDialog) {
      setIsDialogOpen(true);
    }
    setResult(undefined);

    toast.promise(() => saveRulesPromise({ rulesPrompt: markdown }), {
      loading: "Saving rules... This may take a while to process...",
      success: (result) => {
        const {
          createdRules = 0,
          editedRules = 0,
          removedRules = 0,
        } = result?.data || {};
        setResult({ createdRules, editedRules, removedRules });

        const message = [
          createdRules ? `${createdRules} rules created.` : "",
          editedRules ? `${editedRules} rules edited.` : "",
          removedRules ? `${removedRules} rules removed.` : "",
        ]
          .filter(Boolean)
          .join(" ");

        return `Rules saved successfully! ${message}`;
      },
      error: (err) => {
        return `Error saving rules: ${err.message}`;
      },
    });
  }, [mutate, router, viewedProcessingPromptFileDialog, emailAccountId]);

  useEffect(() => {
    if (!personaPrompt) {
      return;
    }
    editorRef.current?.appendText(personaPrompt);
  }, [personaPrompt]);

  const _addExamplePrompt = useCallback((example: string) => {
    editorRef.current?.appendText(`\n* ${example.trim()}`);
  }, []);

  return (
    <div>
      <ProcessingPromptFileDialog
        onOpenChange={setIsDialogOpen}
        open={isDialogOpen} // TODO: if we revert back to this component we need to fix this
        result={[]}
        setViewedProcessingPromptFileDialog={
          setViewedProcessingPromptFileDialog
        }
      />

      <div
        className={cn(showExamples && "grid grid-cols-1 gap-4 sm:grid-cols-3")}
      >
        <form
          className={showExamples ? "sm:col-span-2" : ""}
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <div className="flex items-center justify-between">
            <Label className="font-title text-xl leading-7">
              How your assistant should handle incoming emails
            </Label>

            <Tooltip
              contentComponent={
                <div className="space-y-1">
                  <div className="font-medium">Formatting options:</div>
                  <div className="space-y-1 text-sm">
                    <div>
                      <span className="font-bold font-mono text-blue-400">
                        *
                      </span>{" "}
                      for bullet points
                    </div>
                    <div>
                      <span className="font-bold font-mono text-blue-400">
                        @label
                      </span>{" "}
                      for labels
                    </div>
                    <div>
                      <span className="font-bold font-mono text-blue-400">
                        &gt; text
                      </span>{" "}
                      for quotes
                    </div>
                  </div>
                </div>
              }
            >
              <HelpCircleIcon className="h-5 w-5 cursor-pointer text-muted-foreground hover:text-foreground" />
            </Tooltip>
          </div>

          <div className="mt-1.5 space-y-4">
            <LoadingContent
              loading={isLoadingLabels}
              loadingComponent={<Skeleton className="min-h-[600px] w-full" />}
            >
              <SimpleRichTextEditor
                defaultValue={rulesPrompt || undefined}
                minHeight={600}
                onClearContents={() => {
                  toast.info(
                    "Note: Deleting text will delete rules. Add new rules at the end to keep your existing rules."
                  );
                }}
                placeholder={`Here's an example of what your prompt might look like:

* ${personas.other.promptArray[0]}
* ${personas.other.promptArray[1]}
* If someone asks about pricing, reply with:
> Hi NAME!
> I'm currently offering a 10% discount. Let me know if you're interested!`}
                ref={editorRef}
                userLabels={userLabels}
              />
            </LoadingContent>

            <div className="flex flex-wrap gap-2">
              <Button
                disabled={isSubmitting || isGenerating}
                loading={isSubmitting}
                type="submit"
              >
                Save
              </Button>

              <Button onClick={onOpenPersonaDialog} variant="outline">
                <UserPenIcon className="mr-2 size-4" />
                Choose persona
              </Button>

              <Tooltip content="Our AI will analyze your Gmail inbox and create a customized prompt for your assistant.">
                <Button
                  disabled={isSubmitting || isGenerating}
                  loading={isGenerating}
                  onClick={async () => {
                    if (isSubmitting || isGenerating) {
                      return;
                    }
                    toast.promise(
                      async () => {
                        setIsGenerating(true);
                        const result = await generateRulesPromptAction(
                          emailAccountId,
                          {}
                        );

                        if (result?.serverError) {
                          setIsGenerating(false);
                          throw new Error(result.serverError);
                        }

                        if (result?.data?.rulesPrompt) {
                          editorRef.current?.appendText(
                            `\n${result?.data?.rulesPrompt || ""}`
                          );
                        } else {
                          toastError({
                            description: "Error generating prompt",
                          });
                        }

                        setIsGenerating(false);

                        return result;
                      },
                      {
                        loading: "Generating prompt...",
                        success: "Prompt generated successfully!",
                        error: (err) => {
                          return `Error generating prompt: ${err.message}`;
                        },
                      }
                    );
                  }}
                  type="button"
                  variant="outline"
                >
                  <SparklesIcon className="mr-2 size-4" />
                  Give me ideas
                </Button>
              </Tooltip>
            </div>
          </div>
        </form>

        {/* {showExamples && (
          <Examples onSelect={addExamplePrompt} provider={provider} />
        )} */}
      </div>
    </div>
  );
}
