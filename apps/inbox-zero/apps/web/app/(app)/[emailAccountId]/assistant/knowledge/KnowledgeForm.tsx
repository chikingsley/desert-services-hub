"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CrownIcon } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";
import { Controller, useForm } from "react-hook-form";
import type { KeyedMutator } from "swr";
import type { GetKnowledgeResponse } from "@/app/api/knowledge/route";
import { AlertWithButton } from "@/components/Alert";
import { Tiptap, type TiptapHandle } from "@/components/editor/Tiptap";
import { Input } from "@/components/Input";
import { usePremium } from "@/components/PremiumAlert";
import { toastError, toastSuccess } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { Knowledge } from "@/generated/prisma/client";
import { useAccount } from "@/providers/EmailAccountProvider";
import { cn } from "@/utils";
import {
  createKnowledgeAction,
  updateKnowledgeAction,
} from "@/utils/actions/knowledge";
import {
  type CreateKnowledgeBody,
  createKnowledgeBody,
  type UpdateKnowledgeBody,
  updateKnowledgeBody,
} from "@/utils/actions/knowledge.validation";
import { KNOWLEDGE_BASIC_MAX_ITEMS } from "@/utils/config";
import { hasTierAccess } from "@/utils/premium";

export function KnowledgeForm({
  closeDialog,
  refetch,
  editingItem,
  knowledgeItemsCount,
}: {
  closeDialog: () => void;
  refetch: KeyedMutator<GetKnowledgeResponse>;
  editingItem: Knowledge | null;
  knowledgeItemsCount: number;
}) {
  const { emailAccountId } = useAccount();
  const { tier } = usePremium();

  const hasFullAccess = hasTierAccess({
    tier: tier || null,
    minimumTier: "PLUS_MONTHLY",
  });

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CreateKnowledgeBody | UpdateKnowledgeBody>({
    resolver: zodResolver(
      editingItem ? updateKnowledgeBody : createKnowledgeBody
    ),
    defaultValues: editingItem
      ? {
          id: editingItem.id,
          title: editingItem.title,
          content: editingItem.content,
        }
      : {
          title: "How to draft replies",
          content: "",
        },
  });

  const editorRef = useRef<TiptapHandle>(null);

  const onSubmit = async (data: CreateKnowledgeBody | UpdateKnowledgeBody) => {
    const markdownContent = editorRef.current?.getMarkdown();

    const submitData = {
      ...data,
      content: markdownContent ?? "",
    };

    const result = editingItem
      ? await updateKnowledgeAction(
          emailAccountId,
          submitData as UpdateKnowledgeBody
        )
      : await createKnowledgeAction(emailAccountId, submitData);

    if (result?.serverError) {
      toastError({
        title: `Error ${editingItem ? "updating" : "creating"} knowledge base entry`,
        description: result.serverError || "",
      });
      return;
    }

    toastSuccess({
      description: `Knowledge base entry ${editingItem ? "updated" : "created"} successfully`,
    });

    refetch();
    closeDialog();
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
      {!(editingItem || hasFullAccess) &&
        knowledgeItemsCount >= KNOWLEDGE_BASIC_MAX_ITEMS && (
          <AlertWithButton
            button={
              <Button asChild>
                <Link href="/settings">Open settings</Link>
              </Button>
            }
            description={
              <>Switch to the Plus plan to add more knowledge base entries.</>
            }
            icon={<CrownIcon className="h-4 w-4" />}
            title="Upgrade to add more knowledge base entries"
            variant="blue"
          />
        )}

      <Input
        error={errors.title}
        label="Title"
        name="title"
        registerProps={register("title")}
        type="text"
      />
      <div>
        <Label
          className={cn(errors.content && "text-destructive")}
          htmlFor="content"
        >
          Content (supports markdown)
        </Label>
        <Controller
          control={control}
          name="content"
          render={({ field }) => (
            <div className="max-h-[600px] overflow-y-auto">
              <Tiptap
                autofocus={false}
                className="prose prose-sm dark:prose-invert mt-1 max-w-none"
                initialContent={field.value ?? ""}
                ref={editorRef}
              />
            </div>
          )}
        />
        {errors.content && (
          <p className="mt-1 text-destructive text-sm">
            {errors.content.message}
          </p>
        )}
      </div>
      <Button loading={isSubmitting} type="submit">
        {editingItem ? "Update" : "Create"}
      </Button>
    </form>
  );
}
