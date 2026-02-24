"use client";

import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { DateCell } from "@/app/(app)/[emailAccountId]/assistant/DateCell";
import type { ColdEmailsResponse } from "@/app/api/user/cold-email/route";
import { AlertBasic } from "@/components/Alert";
import { EmailMessageCellWithData } from "@/components/EmailMessageCell";
import { LoadingContent } from "@/components/LoadingContent";
import { TablePagination } from "@/components/TablePagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ViewEmailButton } from "@/components/ViewEmailButton";
import { ColdEmailStatus } from "@/generated/prisma/enums";
import { useAccount } from "@/providers/EmailAccountProvider";

export function ColdEmailRejected() {
  const searchParams = useSearchParams();
  const page = searchParams.get("page") || "1";
  const { data, isLoading, error } = useSWR<ColdEmailsResponse>(
    `/api/user/cold-email?page=${page}&status=${ColdEmailStatus.USER_REJECTED_COLD}`
  );

  const { userEmail } = useAccount();

  return (
    <LoadingContent error={error} loading={isLoading}>
      {data?.coldEmails.length ? (
        <div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>AI Reason</TableHead>
                <TableHead>Date</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.coldEmails.map((coldEmail) => (
                <Row key={coldEmail.id} row={coldEmail} userEmail={userEmail} />
              ))}
            </TableBody>
          </Table>

          <TablePagination totalPages={data.totalPages} />
        </div>
      ) : (
        <NoRejectedColdEmails />
      )}
    </LoadingContent>
  );
}

function Row({
  row,
  userEmail,
}: {
  row: ColdEmailsResponse["coldEmails"][number];
  userEmail: string;
}) {
  return (
    <TableRow key={row.id}>
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
          <ViewEmailButton
            messageId={row.messageId || ""}
            threadId={row.threadId || ""}
          />
        </div>
      </TableCell>
    </TableRow>
  );
}

function NoRejectedColdEmails() {
  return (
    <div className="p-2">
      <AlertBasic
        description="When you mark an AI-detected cold email as 'Not a cold email', it will appear here."
        title="No emails marked as 'Not a cold email'"
      />
    </div>
  );
}
