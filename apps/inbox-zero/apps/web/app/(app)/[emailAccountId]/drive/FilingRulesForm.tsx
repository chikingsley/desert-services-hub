"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { Input } from "@/components/Input";
import { LoadingContent } from "@/components/LoadingContent";
import { toastError, toastSuccess } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { updateFilingPromptAction } from "@/utils/actions/drive";
import {
  type UpdateFilingPromptBody,
  updateFilingPromptBody,
} from "@/utils/actions/drive.validation";

export function FilingRulesForm({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const { data, isLoading, error, mutate } = useEmailAccountFull();

  return (
    <LoadingContent error={error} loading={isLoading}>
      {data && (
        <FilingRulesFormContent
          emailAccountId={emailAccountId}
          initialPrompt={data.filingPrompt || ""}
          mutateEmail={mutate}
        />
      )}
    </LoadingContent>
  );
}

function FilingRulesFormContent({
  emailAccountId,
  initialPrompt,
  mutateEmail,
}: {
  emailAccountId: string;
  initialPrompt: string;
  mutateEmail: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UpdateFilingPromptBody>({
    resolver: zodResolver(updateFilingPromptBody),
    defaultValues: {
      filingPrompt: initialPrompt,
    },
  });

  const onSubmit: SubmitHandler<UpdateFilingPromptBody> = useCallback(
    async (data) => {
      const result = await updateFilingPromptAction(emailAccountId, data);

      if (result?.serverError) {
        toastError({
          title: "Error saving rules",
          description: result.serverError,
        });
      } else {
        toastSuccess({ description: "Filing rules saved" });
        mutateEmail();
      }
    },
    [emailAccountId, mutateEmail]
  );

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Filing rules</CardTitle>
        <CardDescription>How should we organize your files?</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-3" onSubmit={handleSubmit(onSubmit)}>
          <Input
            autosizeTextarea
            error={errors.filingPrompt}
            name="filingPrompt"
            placeholder="Receipts go to Expenses by month. Contracts go to Legal."
            registerProps={register("filingPrompt")}
            rows={3}
            type="textarea"
          />
          <div className="flex justify-end">
            <Button loading={isSubmitting} size="sm" type="submit">
              Save
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
