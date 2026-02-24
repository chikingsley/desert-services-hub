"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useAction } from "next-safe-action/hooks";
import { useCallback } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { Input } from "@/components/Input";
import { toastError, toastSuccess } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAccount } from "@/providers/EmailAccountProvider";
import { testMcpAction } from "@/utils/actions/mcp";
import {
  type McpAgentActionInput,
  testMcpSchema,
} from "@/utils/actions/mcp.validation";
import { getActionErrorMessage } from "@/utils/error";

export function McpAgentTest() {
  const { emailAccountId } = useAccount();

  const { executeAsync, result } = useAction(
    testMcpAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({
          description: "MCP agent test successful",
        });
      },
      onError: (error) => {
        toastError({
          description: getActionErrorMessage(error.error),
        });
      },
    }
  );

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<McpAgentActionInput>({
    resolver: zodResolver(testMcpSchema),
    defaultValues: {
      from: "john.smith@example.com",
      subject: "Question about your services",
      content:
        "Hi there,\n\nI'm John Smith and I have a question about your services.\n\nCould you please help me with this?\n\nThanks!",
    },
  });

  const onSubmit: SubmitHandler<McpAgentActionInput> = useCallback(
    async (data) => {
      await executeAsync(data);
    },
    [executeAsync]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Test MCP integrations</CardTitle>
        <p className="mt-2 text-gray-600 text-sm">
          This tests the MCP agent's ability to research customer context from
          connected systems like CRMs, payment platforms, and documentation to
          help draft personalized email replies.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <Input
            error={errors.from}
            label="From"
            name="from"
            placeholder="john.smith@example.com"
            registerProps={register("from")}
            type="text"
          />
          <Input
            error={errors.subject}
            label="Subject"
            name="subject"
            placeholder="Question about your services"
            registerProps={register("subject")}
            type="text"
          />
          <Input
            autosizeTextarea
            error={errors.content}
            label="Content"
            name="content"
            placeholder="e.g., 'billing issue', 'product inquiry', 'support request'"
            registerProps={register("content")}
            rows={3}
            type="text"
          />
          <Button loading={isSubmitting} type="submit">
            Test
          </Button>
        </form>

        {result?.data && (
          <div className="space-y-4">
            {result.data.response ? (
              <div className="rounded-lg border bg-gray-50 p-4">
                <h4 className="mb-2 font-semibold">Response:</h4>
                <p className="whitespace-pre-wrap">{result.data.response}</p>
              </div>
            ) : (
              <div className="rounded-lg border bg-yellow-50 p-4">
                <h4 className="mb-2 font-semibold">
                  No Relevant Information Found
                </h4>
                <p className="text-gray-600 text-sm">
                  The MCP agent searched the connected systems but didn't find
                  relevant information.
                </p>
              </div>
            )}

            {result?.data?.toolCalls && result.data.toolCalls.length > 0 && (
              <div className="rounded-lg border p-4">
                <h4 className="mb-2 font-semibold">Tool Calls Made:</h4>
                <div className="space-y-2">
                  {result.data.toolCalls.map((call, index) => (
                    <div
                      className="rounded bg-gray-100 p-2 text-sm"
                      key={index}
                    >
                      <div className="font-mono text-blue-600">
                        {call.toolName}
                      </div>
                      <div className="text-gray-600">
                        Args: {JSON.stringify(call.arguments, null, 2)}
                      </div>
                      <div className="mt-1 text-gray-500 text-xs">
                        Result: {call.result}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
