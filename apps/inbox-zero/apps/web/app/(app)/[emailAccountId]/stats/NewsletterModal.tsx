import type { ZodPeriod } from "@inboxzero/tinybird";
import { ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import { usePostHog } from "posthog-js/react";
import type { DateRange } from "react-day-picker";
import useSWR from "swr";
import { MoreDropdown } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/common";
import type { Row } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/types";
import { BarChart } from "@/app/(app)/[emailAccountId]/stats/BarChart";
import { getDateRangeParams } from "@/app/(app)/[emailAccountId]/stats/params";
import type {
  SenderEmailsQuery,
  SenderEmailsResponse,
} from "@/app/api/user/stats/sender-emails/route";
import { AlertBasic } from "@/components/Alert";
import { EmailList } from "@/components/email-list/EmailList";
import { LoadingContent } from "@/components/LoadingContent";
import { Tooltip } from "@/components/Tooltip";
import { SectionHeader } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLabels } from "@/hooks/useLabels";
import { useThreads } from "@/hooks/useThreads";
import { useAccount } from "@/providers/EmailAccountProvider";
import { onAutoArchive } from "@/utils/actions/client";
import { COLORS } from "@/utils/colors";
import { getGmailFilterSettingsUrl } from "@/utils/url";

export function NewsletterModal(props: {
  newsletter?: Pick<Row, "name" | "unsubscribeLink" | "autoArchived">;
  onClose: (isOpen: boolean) => void;
  refreshInterval?: number;
  mutate: () => Promise<any>;
}) {
  const { newsletter, refreshInterval, onClose, mutate } = props;

  const { emailAccountId, userEmail } = useAccount();

  const { userLabels } = useLabels();

  const posthog = usePostHog();

  return (
    <Dialog onOpenChange={onClose} open={!!newsletter}>
      <DialogContent className="lg:min-w-[880px] xl:min-w-[1280px]">
        {newsletter && (
          <>
            <DialogHeader>
              <DialogTitle>Stats for {newsletter.name}</DialogTitle>
            </DialogHeader>

            <div className="flex space-x-2">
              <Button size="sm" variant="outline">
                <a
                  href={newsletter.unsubscribeLink || undefined}
                  rel="noreferrer"
                  target="_blank"
                >
                  Unsubscribe
                </a>
              </Button>
              <Tooltip content="Auto archive emails using Gmail filters">
                <Button
                  onClick={() => {
                    onAutoArchive({
                      emailAccountId,
                      from: newsletter.name,
                    });
                  }}
                  size="sm"
                  variant="outline"
                >
                  Auto Archive
                </Button>
              </Tooltip>
              {newsletter.autoArchived && (
                <Button asChild size="sm" variant="outline">
                  <Link
                    href={getGmailFilterSettingsUrl(userEmail)}
                    target="_blank"
                  >
                    <ExternalLinkIcon className="mr-2 h-4 w-4" />
                    View Auto Archive Filter
                  </Link>
                </Button>
              )}
              <MoreDropdown
                emailAccountId={emailAccountId}
                item={newsletter}
                labels={userLabels}
                mutate={mutate}
                posthog={posthog}
                userEmail={userEmail}
              />
            </div>

            <div>
              <EmailsChart
                fromEmail={newsletter.name}
                period="week"
                refreshInterval={refreshInterval}
              />
            </div>
            <div className="lg:max-w-[820px] xl:max-w-[1220px]">
              <Emails
                fromEmail={newsletter.name}
                refreshInterval={refreshInterval}
              />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function useSenderEmails(props: {
  fromEmail: string;
  dateRange?: DateRange | undefined;
  period: ZodPeriod;
  refreshInterval?: number;
}) {
  const params: SenderEmailsQuery = {
    ...props,
    ...getDateRangeParams(props.dateRange),
  };
  const { data, isLoading, error } = useSWR<
    SenderEmailsResponse,
    { error: string }
  >(`/api/user/stats/sender-emails/?${new URLSearchParams(params as any)}`, {
    refreshInterval: props.refreshInterval,
  });

  return { data, isLoading, error };
}

function EmailsChart(props: {
  fromEmail: string;
  dateRange?: DateRange | undefined;
  period: ZodPeriod;
  refreshInterval?: number;
}) {
  const { data, isLoading, error } = useSenderEmails(props);

  return (
    <LoadingContent error={error} loading={isLoading}>
      {data && (
        <BarChart
          config={{
            Emails: { label: "Emails", color: COLORS.analytics.green },
          }}
          data={data.result}
          xAxisKey="startOfPeriod"
        />
      )}
    </LoadingContent>
  );
}

function Emails(props: { fromEmail: string; refreshInterval?: number }) {
  return (
    <>
      <SectionHeader>Emails</SectionHeader>
      <Tabs className="mt-2" defaultValue="unarchived" searchParam="modal-tab">
        <TabsList>
          <TabsTrigger value="unarchived">Unarchived</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>

        <div className="mt-2">
          <TabsContent value="unarchived">
            <UnarchivedEmails fromEmail={props.fromEmail} />
          </TabsContent>
          <TabsContent value="all">
            <AllEmails fromEmail={props.fromEmail} />
          </TabsContent>
        </div>
      </Tabs>
    </>
  );
}

function UnarchivedEmails({
  fromEmail,
  refreshInterval,
}: {
  fromEmail: string;
  refreshInterval?: number;
}) {
  const { data, isLoading, error, mutate } = useThreads({
    fromEmail,
    refreshInterval,
  });

  return (
    <LoadingContent error={error} loading={isLoading}>
      {data && (
        <EmailList
          emptyMessage={
            <AlertBasic
              description={`There are no unarchived emails. Switch to the "All" to view all emails from this sender.`}
              title="No unarchived emails"
            />
          }
          hideActionBarWhenEmpty
          refetch={() => mutate()}
          threads={data.threads}
        />
      )}
    </LoadingContent>
  );
}

function AllEmails({
  fromEmail,
  refreshInterval,
}: {
  fromEmail: string;
  refreshInterval?: number;
}) {
  const { data, isLoading, error, mutate } = useThreads({
    fromEmail,
    type: "all",
    refreshInterval,
  });

  return (
    <LoadingContent error={error} loading={isLoading}>
      {data && (
        <EmailList
          emptyMessage={
            <AlertBasic
              description="There are no emails from this sender."
              title="No emails"
            />
          }
          hideActionBarWhenEmpty
          refetch={() => mutate()}
          threads={data.threads}
        />
      )}
    </LoadingContent>
  );
}
