"use client";

import useSWR from "swr";
import type { NoReplyResponse } from "@/app/api/user/no-reply/route";
import { EmailList } from "@/components/email-list/EmailList";
import { LoadingContent } from "@/components/LoadingContent";
import { PageHeading } from "@/components/Typography";

export default function NoReplyPage() {
  const { data, isLoading, error, mutate } = useSWR<
    NoReplyResponse,
    { error: string }
  >("/api/user/no-reply");

  return (
    <div>
      <div className="border-border border-b px-8 py-6">
        <PageHeading>Emails Sent With No Reply</PageHeading>
      </div>
      <LoadingContent error={error} loading={isLoading}>
        {data && (
          <div>
            <EmailList
              hideActionBarWhenEmpty
              refetch={() => mutate()}
              threads={data as any}
            />
          </div>
        )}
      </LoadingContent>
    </div>
  );
}
