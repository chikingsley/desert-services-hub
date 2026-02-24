"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useAction } from "next-safe-action/hooks";
import { useCallback } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { Input } from "@/components/Input";
import { toastError, toastSuccess } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { adminGetLabelsAction } from "@/utils/actions/admin";
import {
  type GetLabelsBody,
  getLabelsBody,
} from "@/utils/actions/admin.validation";

export function DebugLabels() {
  const { execute, isExecuting, result } = useAction(adminGetLabelsAction, {
    onSuccess: () => {
      toastSuccess({ description: "Labels found!" });
    },
    onError: ({ error }) => {
      toastError({
        title: "Error getting labels",
        description: error.serverError || "An error occurred",
      });
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<GetLabelsBody>({
    resolver: zodResolver(getLabelsBody),
  });

  const onSubmit: SubmitHandler<GetLabelsBody> = useCallback(
    (data) => {
      execute(data);
    },
    [execute]
  );

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Debug labels</CardTitle>
        <CardDescription>Get all labels for an email account</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <Input
            error={errors.emailAccountId}
            label="Email Account ID"
            name="emailAccountId"
            placeholder="Email Account ID"
            registerProps={register("emailAccountId")}
            type="text"
          />
          <Button loading={isExecuting} type="submit">
            Get Labels
          </Button>
        </form>

        {result.data && (
          <pre className="text-sm">{JSON.stringify(result.data, null, 2)}</pre>
        )}
      </CardContent>
    </Card>
  );
}
