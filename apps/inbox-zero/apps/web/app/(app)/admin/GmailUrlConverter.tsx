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
import { adminConvertGmailUrlAction } from "@/utils/actions/admin";
import {
  type ConvertGmailUrlBody,
  convertGmailUrlBody,
} from "@/utils/actions/admin.validation";
import { internalDateToDate } from "@/utils/date";

export function GmailUrlConverter() {
  const {
    execute: convertUrl,
    isExecuting,
    result,
  } = useAction(adminConvertGmailUrlAction, {
    onSuccess: () => {
      toastSuccess({ description: "Message found!" });
    },
    onError: ({ error }) => {
      toastError({
        title: "Error looking up message",
        description: error.serverError || "An error occurred",
      });
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ConvertGmailUrlBody>({
    resolver: zodResolver(convertGmailUrlBody),
  });

  const onSubmit: SubmitHandler<ConvertGmailUrlBody> = useCallback(
    (data) => {
      convertUrl(data);
    },
    [convertUrl]
  );

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Email message lookup</CardTitle>
        <CardDescription>
          Find thread/message IDs using RFC822 Message-ID from email headers
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <Input
            error={errors.rfc822MessageId}
            label="RFC822 Message-ID"
            name="rfc822MessageId"
            placeholder="<abc123@email.example.com>"
            registerProps={register("rfc822MessageId")}
            type="text"
          />
          <Input
            error={errors.email}
            label="Email Address"
            name="email"
            placeholder="user@example.com"
            registerProps={register("email")}
            type="email"
          />
          <Button loading={isExecuting} type="submit">
            Lookup
          </Button>
        </form>

        {result.data && (
          <div className="space-y-2">
            <div>
              <span className="font-medium text-sm">Thread ID: </span>
              <code className="text-sm">{result.data.threadId}</code>
            </div>
            <div>
              <span className="font-medium text-sm">Messages: </span>
              <div className="space-y-1">
                {result.data.messages.map((msg) => (
                  <div className="text-sm" key={msg.id}>
                    <code>{msg.id}</code>
                    {msg.date && (
                      <span className="ml-2 text-muted-foreground">
                        ({internalDateToDate(msg.date).toLocaleString()})
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
