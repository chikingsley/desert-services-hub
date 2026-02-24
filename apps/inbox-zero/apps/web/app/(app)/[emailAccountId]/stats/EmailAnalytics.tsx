"use client";

import { Mail, Send } from "lucide-react";
import type { DateRange } from "react-day-picker";
import useSWR from "swr";
import { BarListCard } from "@/app/(app)/[emailAccountId]/stats/BarListCard";
import { getDateRangeParams } from "@/app/(app)/[emailAccountId]/stats/params";
import type { RecipientsResponse } from "@/app/api/user/stats/recipients/route";
import type { SendersResponse } from "@/app/api/user/stats/senders/route";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccount } from "@/providers/EmailAccountProvider";
import { getGmailSearchUrl } from "@/utils/url";

export function EmailAnalytics(props: {
  dateRange?: DateRange | undefined;
  refreshInterval: number;
}) {
  const { userEmail } = useAccount();

  const params = getDateRangeParams(props.dateRange);

  const { data, isLoading, error } = useSWR<SendersResponse, { error: string }>(
    `/api/user/stats/senders?${new URLSearchParams(params as any)}`,
    {
      refreshInterval: props.refreshInterval,
    }
  );

  const {
    data: dataRecipients,
    isLoading: isLoadingRecipients,
    error: errorRecipients,
  } = useSWR<RecipientsResponse, { error: string }>(
    `/api/user/stats/recipients?${new URLSearchParams(params as any)}`,
    {
      refreshInterval: props.refreshInterval,
    }
  );

  function formatEmailItem(item: { name: string; value: number }) {
    return {
      ...item,
      href: getGmailSearchUrl(item.name, userEmail),
      target: "_blank",
    };
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2 sm:gap-4">
      <LoadingContent
        error={error}
        loading={isLoading}
        loadingComponent={<Skeleton className="h-[377px] rounded" />}
      >
        {data && (
          <BarListCard
            icon={
              <Mail className="size-4 translate-y-[-0.5px] text-neutral-500" />
            }
            tabs={[
              {
                id: "emailAddress",
                label: "Email address",
                data: data.mostActiveSenderEmails.map(formatEmailItem),
              },
              {
                id: "domain",
                label: "Domain",
                data: data.mostActiveSenderDomains.map(formatEmailItem),
              },
            ]}
            title="Received"
          />
        )}
      </LoadingContent>
      <LoadingContent
        error={errorRecipients}
        loading={isLoadingRecipients}
        loadingComponent={<Skeleton className="h-[377px] w-full rounded" />}
      >
        {dataRecipients && (
          <BarListCard
            icon={<Send className="size-4 text-neutral-500" />}
            tabs={[
              {
                id: "emailAddress",
                label: "Email address",
                data:
                  dataRecipients.mostActiveRecipientEmails.map(
                    formatEmailItem
                  ) || [],
              },
            ]}
            title="Sent"
          />
        )}
      </LoadingContent>
    </div>
  );
}
