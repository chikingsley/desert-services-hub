"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useAction } from "next-safe-action/hooks";
import { useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Tiptap, type TiptapHandle } from "@/components/editor/Tiptap";
import { LoadingContent } from "@/components/LoadingContent";
import { SettingCard } from "@/components/SettingCard";
import { toastError, toastSuccess } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { useAccount } from "@/providers/EmailAccountProvider";
import { saveWritingStyleAction } from "@/utils/actions/user";
import {
  type SaveWritingStyleBody,
  saveWritingStyleBody,
} from "@/utils/actions/user.validation";
import { getActionErrorMessage } from "@/utils/error";

export function WritingStyleSetting() {
  const { data, isLoading, error } = useEmailAccountFull();

  const hasWritingStyle = !!data?.writingStyle;

  return (
    <SettingCard
      description="Define your tone and style."
      right={
        <LoadingContent
          error={error}
          loading={isLoading}
          loadingComponent={<Skeleton className="h-8 w-32" />}
        >
          <WritingStyleDialog currentWritingStyle={data?.writingStyle || ""}>
            <Button size="sm" variant="outline">
              {hasWritingStyle ? "Edit" : "Set"}
            </Button>
          </WritingStyleDialog>
        </LoadingContent>
      }
      title="Writing style"
    />
  );
}

function WritingStyleDialog({
  children,
  currentWritingStyle,
}: {
  children: React.ReactNode;
  currentWritingStyle: string;
}) {
  const [open, setOpen] = useState(false);
  const { emailAccountId } = useAccount();
  const { mutate } = useEmailAccountFull();
  const editorRef = useRef<TiptapHandle>(null);

  const {
    control,
    formState: { errors },
    handleSubmit,
  } = useForm<SaveWritingStyleBody>({
    defaultValues: { writingStyle: currentWritingStyle },
    resolver: zodResolver(saveWritingStyleBody),
  });

  const { execute, isExecuting } = useAction(
    saveWritingStyleAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({
          description: "Writing style saved!",
        });
        setOpen(false);
      },
      onError: (error) => {
        toastError({
          description: getActionErrorMessage(error.error),
        });
      },
      onSettled: () => {
        mutate();
      },
    }
  );

  const onSubmit = (data: SaveWritingStyleBody) => {
    execute(data);
  };

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Writing style</DialogTitle>
          <DialogDescription>
            Used to draft replies in your voice.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)}>
          <Controller
            control={control}
            name="writingStyle"
            render={({ field }) => (
              <div className="max-h-[400px] overflow-y-auto">
                <Tiptap
                  autofocus={false}
                  className="prose prose-sm dark:prose-invert max-w-none [&_p.is-editor-empty:first-child::before]:pointer-events-none [&_p.is-editor-empty:first-child::before]:float-left [&_p.is-editor-empty:first-child::before]:h-0 [&_p.is-editor-empty:first-child::before]:text-muted-foreground [&_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]"
                  initialContent={field.value ?? ""}
                  onChange={field.onChange}
                  output="markdown"
                  placeholder={`Typical Length: 2-3 sentences

Formality: Informal but professional

Common Greeting: Hey,

Notable Traits:
- Uses contractions frequently
- Concise and direct responses
- Minimal closings`}
                  preservePastedLineBreaks
                  ref={editorRef}
                />
              </div>
            )}
          />
          {errors.writingStyle && (
            <p className="mt-1 text-destructive text-sm">
              {errors.writingStyle.message}
            </p>
          )}
          <Button className="mt-4" loading={isExecuting} type="submit">
            Save
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
