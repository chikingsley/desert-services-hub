// this is a copy/paste of the assistant/TestRules.tsx file
// can probably extract some common components from it

"use client";

import { SparklesIcon } from "lucide-react";
import { useCallback, useState } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import useSWR from "swr";
import type { MessagesResponse } from "@/app/api/messages/route";
import { AlertBasic } from "@/components/Alert";
import { EmailMessageCell } from "@/components/EmailMessageCell";
import { Input } from "@/components/Input";
import { LoadingContent } from "@/components/LoadingContent";
import { SearchForm } from "@/components/SearchForm";
import { toastError } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { useAccount } from "@/providers/EmailAccountProvider";
import { testColdEmailAction } from "@/utils/actions/cold-email";
import type { ColdEmailBlockerBody } from "@/utils/actions/cold-email.validation";

type ColdEmailBlockerResponse = {
  isColdEmail: boolean;
  aiReason?: string | null;
  reason?: string | null;
};

export function TestRulesContent() {
  const [searchQuery, setSearchQuery] = useState("");
  const { data, isLoading, error } = useSWR<MessagesResponse>(
    `/api/messages?q=${searchQuery}`,
    {
      keepPreviousData: true,
      dedupingInterval: 1000,
    }
  );

  const { userEmail } = useAccount();

  return (
    <div>
      <CardContent>
        <TestRulesForm />

        <div className="mt-4 max-w-sm">
          <SearchForm
            defaultQuery={searchQuery || undefined}
            onSearch={setSearchQuery}
          />
        </div>
      </CardContent>

      <Separator />

      <LoadingContent error={error} loading={isLoading}>
        {data && (
          <Table>
            <TableBody>
              {data.messages.map((message) => (
                <TestRulesContentRow
                  key={message.id}
                  message={message}
                  userEmail={userEmail}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </LoadingContent>
    </div>
  );
}

type TestRulesInputs = { message: string };

const TestRulesForm = () => {
  const { response, testEmail } = useColdEmailTest();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TestRulesInputs>({
    defaultValues: {
      message:
        "Hey, I run a development agency. I was wondering if you need extra hands on your team?",
    },
  });

  const onSubmit: SubmitHandler<TestRulesInputs> = useCallback(
    async (data) => {
      await testEmail({
        from: "",
        subject: "",
        textHtml: null,
        textPlain: data.message,
        snippet: null,
        threadId: null,
        messageId: null,
        date: undefined,
      });
    },
    [testEmail]
  );

  return (
    <div>
      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
        <Input
          autosizeTextarea
          error={errors.message}
          label="Email to test against"
          name="message"
          placeholder="Hey, I run a marketing agency, and would love to chat."
          registerProps={register("message", { required: true })}
          rows={3}
          type="text"
        />
        <Button loading={isSubmitting} type="submit">
          <SparklesIcon className="mr-2 h-4 w-4" />
          Test
        </Button>
      </form>
      {response && (
        <div className="mt-4">
          <Result coldEmailResponse={response} />
        </div>
      )}
    </div>
  );
};

function TestRulesContentRow({
  message,
  userEmail,
}: {
  message: MessagesResponse["messages"][number];
  userEmail: string;
}) {
  const { testing, response, testEmail } = useColdEmailTest();

  return (
    <TableRow
      className={
        testing ? "animate-pulse bg-blue-50 dark:bg-blue-950/20" : undefined
      }
    >
      <TableCell>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <EmailMessageCell
              labelIds={message.labelIds}
              messageId={message.id}
              sender={message.headers.from}
              snippet={message.snippet}
              subject={message.headers.subject}
              threadId={message.threadId}
              userEmail={userEmail}
            />
          </div>
          <div className="ml-4 shrink-0">
            <Button
              color="white"
              loading={testing}
              onClick={async () => {
                await testEmail({
                  from: message.headers.from,
                  subject: message.headers.subject,
                  textHtml: message.textHtml || null,
                  textPlain: message.textPlain || null,
                  snippet: message.snippet || null,
                  threadId: message.threadId,
                  messageId: message.id,
                  date: message.internalDate || undefined,
                });
              }}
            >
              <SparklesIcon className="mr-2 h-4 w-4" />
              Test
            </Button>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Result coldEmailResponse={response} />
      </TableCell>
    </TableRow>
  );
}

function Result(props: { coldEmailResponse: ColdEmailBlockerResponse | null }) {
  const { coldEmailResponse } = props;

  if (!coldEmailResponse) {
    return null;
  }

  if (coldEmailResponse.isColdEmail) {
    return (
      <AlertBasic
        description={coldEmailResponse.aiReason}
        title="Email is a cold email!"
        variant="destructive"
      />
    );
  }
  return (
    <AlertBasic
      description={coldEmailResponse.aiReason}
      title={
        coldEmailResponse.reason === "hasPreviousEmail"
          ? "This person has previously emailed you. This is not a cold email!"
          : "Our AI determined this is not a cold email!"
      }
      variant="success"
    />
  );
}

function useColdEmailTest() {
  const [testing, setTesting] = useState(false);
  const [response, setResponse] = useState<ColdEmailBlockerResponse | null>(
    null
  );
  const { emailAccountId } = useAccount();

  const testEmail = async (data: ColdEmailBlockerBody) => {
    setTesting(true);
    try {
      const result = await testColdEmailAction(emailAccountId, data);
      if (result?.serverError) {
        toastError({
          title: "Error checking whether it's a cold email.",
          description: result.serverError,
        });
      } else if (result?.data) {
        setResponse(result.data);
      }
    } finally {
      setTesting(false);
    }
  };

  return { testing, response, testEmail };
}
