"use client";

import { ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import { parseAsInteger, parseAsString, useQueryState } from "nuqs";
import { DateCell } from "@/app/(app)/[emailAccountId]/assistant/DateCell";
import { FixWithChat } from "@/app/(app)/[emailAccountId]/assistant/FixWithChat";
import { ResultsDisplay } from "@/app/(app)/[emailAccountId]/assistant/ResultDisplay";
import { RulesSelect } from "@/app/(app)/[emailAccountId]/assistant/RulesSelect";
import type { GetExecutedRulesResponse } from "@/app/api/user/executed-rules/history/route";
import { AlertBasic } from "@/components/Alert";
import { Badge } from "@/components/Badge";
import { LoadingContent } from "@/components/LoadingContent";
import { TablePagination } from "@/components/TablePagination";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ViewEmailButton } from "@/components/ViewEmailButton";
import { useExecutedRules } from "@/hooks/useExecutedRules";
import { useChat } from "@/providers/ChatProvider";
import { useAccount } from "@/providers/EmailAccountProvider";
import { isGoogleProvider } from "@/utils/email/provider-types";
import { decodeSnippet } from "@/utils/gmail/decode";
import type { ParsedMessage } from "@/utils/types";
import { getEmailUrlForMessage } from "@/utils/url";

export function History() {
  const [page] = useQueryState("page", parseAsInteger.withDefault(1));
  const [ruleId] = useQueryState("ruleId", parseAsString.withDefault("all"));

  const { data, isLoading, error } = useExecutedRules({ page, ruleId });

  return (
    <>
      <RulesSelect />
      <Card className="mt-2">
        <LoadingContent error={error} loading={isLoading}>
          {data?.results.length ? (
            <HistoryTable data={data.results} totalPages={data.totalPages} />
          ) : (
            <AlertBasic
              description={
                ruleId === "all"
                  ? "No emails have been processed yet."
                  : "No emails have been processed for this rule."
              }
              title="No history"
            />
          )}
        </LoadingContent>
      </Card>
    </>
  );
}

function HistoryTable({
  data,
  totalPages,
}: {
  data: GetExecutedRulesResponse["results"];
  totalPages: number;
}) {
  const { userEmail } = useAccount();
  const { setInput } = useChat();

  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead className="text-right">Rule</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((er) => (
            <TableRow key={er.message.id}>
              <TableCell>
                <EmailCell
                  createdAt={er.executedRules[0]?.createdAt}
                  from={er.message.headers.from}
                  messageId={er.message.id}
                  snippet={er.message.snippet}
                  subject={er.message.headers.subject}
                  threadId={er.message.threadId}
                  userEmail={userEmail}
                />
                {!er.executedRules[0]?.automated && (
                  <Badge className="mt-2" color="yellow">
                    Applied manually
                  </Badge>
                )}
              </TableCell>
              <TableCell>
                <RuleCell
                  executedRules={er.executedRules}
                  message={er.message}
                  setInput={setInput}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <TablePagination totalPages={totalPages} />
    </div>
  );
}

function EmailCell({
  from,
  subject,
  snippet,
  threadId,
  messageId,
  userEmail,
  createdAt,
}: {
  from: string;
  subject: string;
  snippet: string;
  threadId: string;
  messageId: string;
  userEmail: string;
  createdAt: Date;
}) {
  return (
    <div className="flex flex-1 flex-col justify-center">
      <div className="flex items-center justify-between">
        <div className="font-semibold">{from}</div>
        <DateCell createdAt={createdAt} />
      </div>
      <div className="mt-1 flex items-center font-medium">
        <span>{subject}</span>
        <OpenInGmailButton
          messageId={messageId}
          threadId={threadId}
          userEmail={userEmail}
        />
        <ViewEmailButton
          className="ml-2"
          messageId={messageId}
          size="xs"
          threadId={threadId}
        />
      </div>
      <div className="mt-1 text-muted-foreground">{decodeSnippet(snippet)}</div>
    </div>
  );
}

function RuleCell({
  executedRules,
  message,
  setInput,
}: {
  executedRules: GetExecutedRulesResponse["results"][number]["executedRules"];
  message: ParsedMessage;
  setInput: (input: string) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      <div>
        <ResultsDisplay results={executedRules} />
      </div>
      <FixWithChat
        message={message}
        results={executedRules}
        setInput={setInput}
      />
    </div>
  );
}

function OpenInGmailButton({
  messageId,
  threadId,
  userEmail,
}: {
  messageId: string;
  threadId: string;
  userEmail: string;
}) {
  const { provider } = useAccount();

  if (!isGoogleProvider(provider)) {
    return null;
  }

  return (
    <Link
      className="ml-2 text-muted-foreground hover:text-foreground"
      href={getEmailUrlForMessage(messageId, threadId, userEmail, provider)}
      target="_blank"
    >
      <ExternalLinkIcon className="h-4 w-4" />
    </Link>
  );
}
