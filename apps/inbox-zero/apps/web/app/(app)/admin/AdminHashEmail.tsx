"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useAction } from "next-safe-action/hooks";
import { useCallback } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { Input } from "@/components/Input";
import { toastError, toastSuccess } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { adminHashEmailAction } from "@/utils/actions/admin";
import {
  type HashEmailBody,
  hashEmailBody,
} from "@/utils/actions/admin.validation";

export const AdminHashEmail = () => {
  const {
    execute: hashEmail,
    isExecuting,
    result,
  } = useAction(adminHashEmailAction, {
    onError: ({ error }) => {
      toastError({
        description: `Error hashing value: ${error.serverError}`,
      });
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<HashEmailBody>({
    resolver: zodResolver(hashEmailBody),
  });

  const onSubmit: SubmitHandler<HashEmailBody> = useCallback(
    (data) => {
      hashEmail({ email: data.email });
    },
    [hashEmail]
  );

  const copyToClipboard = () => {
    if (result.data?.hash) {
      navigator.clipboard.writeText(result.data.hash);
      toastSuccess({
        description: "Hash copied to clipboard",
      });
    }
  };

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Hash for Log Search</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <Input
            error={errors.email}
            label="Value to Hash"
            name="email"
            placeholder="user@example.com"
            registerProps={register("email")}
            type="text"
          />

          <Button loading={isExecuting} type="submit">
            Generate Hash
          </Button>

          {result.data?.hash && (
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  className="font-mono text-xs"
                  label="Hashed Value"
                  name="hashedValue"
                  registerProps={{
                    value: result.data.hash,
                    readOnly: true,
                  }}
                  type="text"
                />
              </div>
              <div className="flex items-end">
                <Button
                  onClick={copyToClipboard}
                  type="button"
                  variant="outline"
                >
                  Copy
                </Button>
              </div>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
};
