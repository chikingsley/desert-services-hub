"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { SparklesIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { ResultsDisplay } from "@/app/(app)/[emailAccountId]/assistant/ResultDisplay";
import { Input } from "@/components/Input";
import { toastError } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAccount } from "@/providers/EmailAccountProvider";
import { testAiCustomContentAction } from "@/utils/actions/ai-rule";
import {
  type TestAiCustomContentBody,
  testAiCustomContentBody,
} from "@/utils/actions/ai-rule.validation";
import type { RunRulesResult } from "@/utils/ai/choose-rule/run-rules";

export const TestCustomEmailForm = () => {
  const [testResults, setTestResult] = useState<RunRulesResult[]>();
  const { emailAccountId } = useAccount();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TestAiCustomContentBody>({
    resolver: zodResolver(testAiCustomContentBody),
  });

  const onSubmit: SubmitHandler<TestAiCustomContentBody> = useCallback(
    async (data) => {
      const result = await testAiCustomContentAction(emailAccountId, data);
      if (result?.serverError) {
        toastError({
          title: "Error testing email",
          description: result.serverError,
        });
      } else {
        setTestResult(result?.data);
      }
    },
    [emailAccountId]
  );

  return (
    <div>
      <form className="space-y-2" onSubmit={handleSubmit(onSubmit)}>
        <Input
          autosizeTextarea
          error={errors.content}
          name="content"
          placeholder="Paste in email content or write your own. e.g. Receipt from Stripe for $49"
          registerProps={register("content", { required: true })}
          rows={3}
          type="text"
        />
        <Button loading={isSubmitting} size="sm" type="submit">
          <SparklesIcon className="mr-2 size-4" />
          Test
        </Button>
      </form>
      {testResults && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Test result</CardTitle>
          </CardHeader>
          <CardContent>
            <ResultsDisplay results={testResults} showFullContent={true} />
          </CardContent>
        </Card>
      )}
    </div>
  );
};
