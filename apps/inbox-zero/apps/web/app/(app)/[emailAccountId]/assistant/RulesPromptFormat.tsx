"use client";

import { useCallback, useMemo, useRef } from "react";
import {
  SimpleRichTextEditor,
  type SimpleRichTextEditorRef,
} from "@/components/editor/SimpleRichTextEditor";
import { LoadingContent } from "@/components/LoadingContent";
import { Notice } from "@/components/Notice";
import { toastError } from "@/components/Toast";
import { MessageText } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useLabels } from "@/hooks/useLabels";
import { useRules } from "@/hooks/useRules";
import { ruleToText } from "@/utils/rule/rule-to-text";

export function RulesPromptFormat() {
  const { data: rules, isLoading: isLoadingRules } = useRules();
  const { userLabels, isLoading: isLoadingLabels } = useLabels();

  const editorRef = useRef<SimpleRichTextEditorRef>(null);

  const rulesText = useMemo(() => {
    if (!rules) {
      return "";
    }

    return rules
      .filter((rule) => rule.enabled)
      .map((rule, index) => {
        const ruleText = ruleToText(rule);
        return `## Rule ${index + 1}: ${rule.name}\n${rule.enabled ? "" : "(Disabled)\n"}${ruleText}`;
      })
      .join("\n\n---\n\n");
  }, [rules]);

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

    // setIsSubmitting(true);
  }, []);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <LoadingContent
        loading={isLoadingLabels || isLoadingRules}
        loadingComponent={<Skeleton className="min-h-[220px] w-full" />}
      >
        <Notice className="mb-2" variant="info">
          Editing in 'Prompt' view is currently disabled. Edit using AI Chat or
          'List' view instead.
        </Notice>

        <SimpleRichTextEditor
          defaultValue={rulesText}
          editable={false}
          minHeight={220}
          ref={editorRef}
          userLabels={userLabels}
        />
      </LoadingContent>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button disabled size="sm" type="submit">
          Save
        </Button>

        <MessageText className="pl-2">
          Editing in 'Prompt' view is currently disabled. Edit using AI chat or
          'List' view instead.
        </MessageText>
      </div>
    </form>
  );
}
