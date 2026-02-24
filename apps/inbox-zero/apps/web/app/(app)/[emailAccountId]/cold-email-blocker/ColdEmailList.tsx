"use client";

import { CircleXIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { useCallback } from "react";
import useSWR from "swr";
import { DateCell } from "@/app/(app)/[emailAccountId]/assistant/DateCell";
import type { ColdEmailsResponse } from "@/app/api/user/cold-email/route";
import { AlertBasic } from "@/components/Alert";
import { Checkbox } from "@/components/Checkbox";
import { EmailMessageCellWithData } from "@/components/EmailMessageCell";
import { EnableFeatureCard } from "@/components/EnableFeatureCard";
import { LoadingContent } from "@/components/LoadingContent";
import { TablePagination } from "@/components/TablePagination";
import { toastError, toastSuccess } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ViewEmailButton } from "@/components/ViewEmailButton";
import { SystemType } from "@/generated/prisma/enums";
import { useRules } from "@/hooks/useRules";
import { useToggleSelect } from "@/hooks/useToggleSelect";
import { useAccount } from "@/providers/EmailAccountProvider";
import { markNotColdEmailAction } from "@/utils/actions/cold-email";
import { toggleRuleAction } from "@/utils/actions/rule";
import { isColdEmailBlockerEnabled } from "@/utils/cold-email/cold-email-blocker-enabled";

export function ColdEmailList() {
  const searchParams = useSearchParams();
  const page = searchParams.get("page") || "1";
  const { data, isLoading, error, mutate } = useSWR<ColdEmailsResponse>(
    `/api/user/cold-email?page=${page}`
  );

  const { selected, isAllSelected, onToggleSelect, onToggleSelectAll } =
    useToggleSelect(data?.coldEmails || []);

  const { emailAccountId, userEmail } = useAccount();
  const { executeAsync: markNotColdEmail, isExecuting } = useAction(
    markNotColdEmailAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Marked not cold email!" });
      },
      onError: () => {
        toastError({ description: "Error marking not cold email!" });
      },
    }
  );

  const markNotColdEmailSelected = useCallback(async () => {
    const calls = Array.from(selected.keys())
      .map((id) => data?.coldEmails.find((c) => c.id === id))
      .filter(Boolean)
      .map((c) => markNotColdEmail({ sender: c!.fromEmail }));

    await Promise.all(calls);
    mutate();
  }, [selected, data?.coldEmails, mutate, markNotColdEmail]);

  return (
    <LoadingContent error={error} loading={isLoading}>
      {data?.coldEmails.length ? (
        <div>
          {Array.from(selected.values()).filter(Boolean).length > 0 && (
            <div className="m-2 flex items-center space-x-1.5">
              <div>
                <Button
                  loading={isExecuting}
                  onClick={markNotColdEmailSelected}
                  size="sm"
                >
                  Mark Not Cold Email
                </Button>
              </div>
            </div>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-center">
                  <Checkbox
                    checked={isAllSelected}
                    onChange={onToggleSelectAll}
                  />
                </TableHead>
                <TableHead>Email</TableHead>
                <TableHead>AI Reason</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.coldEmails.map((coldEmail) => (
                <Row
                  isExecuting={isExecuting}
                  key={coldEmail.id}
                  markNotColdEmail={markNotColdEmail}
                  mutate={mutate}
                  onToggleSelect={onToggleSelect}
                  row={coldEmail}
                  selected={selected}
                  userEmail={userEmail}
                />
              ))}
            </TableBody>
          </Table>

          <TablePagination totalPages={data.totalPages} />
        </div>
      ) : (
        <NoColdEmails />
      )}
    </LoadingContent>
  );
}

function Row({
  row,
  userEmail,
  mutate,
  selected,
  onToggleSelect,
  markNotColdEmail,
  isExecuting,
}: {
  row: ColdEmailsResponse["coldEmails"][number];
  userEmail: string;
  mutate: () => void;
  selected: Map<string, boolean>;
  onToggleSelect: (id: string) => void;
  markNotColdEmail: (input: { sender: string }) => Promise<unknown>;
  isExecuting: boolean;
}) {
  return (
    <TableRow key={row.id}>
      <TableCell className="text-center">
        <Checkbox
          checked={selected.get(row.id)}
          onChange={() => onToggleSelect(row.id)}
        />
      </TableCell>
      <TableCell>
        <EmailMessageCellWithData
          messageId={row.messageId || ""}
          sender={row.fromEmail}
          threadId={row.threadId || ""}
          userEmail={userEmail}
        />
      </TableCell>
      <TableCell>{row.reason || "-"}</TableCell>
      <TableCell>
        <DateCell createdAt={row.createdAt} />
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end space-x-2">
          {row.threadId && (
            <ViewEmailButton
              messageId={row.messageId || row.threadId}
              threadId={row.threadId}
            />
          )}
          <Button
            Icon={CircleXIcon}
            loading={isExecuting}
            onClick={async () => {
              await markNotColdEmail({ sender: row.fromEmail });
              mutate();
            }}
          >
            Not cold email
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function NoColdEmails() {
  const { emailAccountId } = useAccount();
  const { data: rules, mutate: mutateRules } = useRules();

  const { executeAsync: enableColdEmailBlocker } = useAction(
    toggleRuleAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Cold email blocker enabled!" });
        mutateRules();
      },
      onError: () => {
        toastError({ description: "Error enabling cold email blocker" });
      },
    }
  );

  if (!isColdEmailBlockerEnabled(rules || [])) {
    return (
      <div className="mb-10">
        <EnableFeatureCard
          buttonText="Enable"
          description="Our AI identifies cold outreach from senders you've never communicated with before. You can customize the prompt after enabling."
          hideBorder
          imageAlt="Cold email blocker"
          imageSrc="/images/illustrations/calling-help.svg"
          onEnable={async () => {
            await enableColdEmailBlocker({
              systemType: SystemType.COLD_EMAIL,
              enabled: true,
            });
          }}
          title="Cold Email Blocker"
        />
      </div>
    );
  }

  return (
    <div className="p-2">
      <AlertBasic
        description={`We haven't marked any of your emails as cold emails yet!`}
        title="No cold emails!"
      />
    </div>
  );
}
