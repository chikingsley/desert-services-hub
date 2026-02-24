"use client";

import Link from "next/link";
import useSWR from "swr";
import type { CleanHistoryResponse } from "@/app/api/clean/history/route";
import { LoadingContent } from "@/components/LoadingContent";
import { MutedText } from "@/components/Typography";
import { useAccount } from "@/providers/EmailAccountProvider";
import { formatDateSimple } from "@/utils/date";
import { prefixPath } from "@/utils/path";

export function CleanHistory() {
  const { emailAccountId } = useAccount();
  const { data, error, isLoading } =
    useSWR<CleanHistoryResponse>("/api/clean/history");

  return (
    <LoadingContent error={error} loading={isLoading}>
      {data?.result.length ? (
        <div className="space-y-2">
          {data.result.map((job) => (
            <Link
              className="block w-full cursor-pointer rounded-md border p-3 text-left transition-colors hover:bg-muted/50"
              href={prefixPath(emailAccountId, `/clean/run?jobId=${job.id}`)}
              key={job.id}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium">
                    {formatDateSimple(new Date(job.createdAt))}
                  </h4>
                </div>
                <MutedText>{job._count.threads} emails processed</MutedText>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <MutedText className="p-4 text-center">No history yet</MutedText>
      )}
    </LoadingContent>
  );
}
