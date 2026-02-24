import { CheckCircleIcon, ClockIcon, MailIcon } from "lucide-react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { TabsToolbar } from "@/components/TabsToolbar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GmailProvider } from "@/providers/GmailProvider";
import { REPLY_ZERO_ONBOARDING_COOKIE } from "@/utils/cookies";
import { checkUserOwnsEmailAccount } from "@/utils/email-account";
import { prefixPath } from "@/utils/path";
import prisma from "@/utils/prisma";
import { isAnalyzingReplyTracker } from "@/utils/redis/reply-tracker-analyzing";
import { CONVERSATION_STATUS_TYPES } from "@/utils/reply-tracker/conversation-status-config";
import { AwaitingReply } from "./AwaitingReply";
import type { TimeRange } from "./date-filter";
import { NeedsReply } from "./NeedsReply";
import { Resolved } from "./Resolved";
import { TimeRangeFilter } from "./TimeRangeFilter";

export const maxDuration = 300;

export default async function ReplyTrackerPage(props: {
  params: Promise<{ emailAccountId: string }>;
  searchParams: Promise<{
    page?: string;
    timeRange?: TimeRange;
    enabled?: boolean;
  }>;
}) {
  const { emailAccountId } = await props.params;
  await checkUserOwnsEmailAccount({ emailAccountId });

  const searchParams = await props.searchParams;

  const cookieStore = await cookies();
  const viewedOnboarding =
    cookieStore.get(REPLY_ZERO_ONBOARDING_COOKIE)?.value === "true";

  if (!viewedOnboarding) {
    redirect(prefixPath(emailAccountId, "/reply-zero/onboarding"));
  }

  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      email: true,
      rules: {
        where: {
          systemType: {
            in: CONVERSATION_STATUS_TYPES,
          },
          enabled: true,
        },
        select: { id: true },
      },
    },
  });

  const trackerRule = emailAccount?.rules[0];

  if (!trackerRule) {
    redirect(prefixPath(emailAccountId, "/reply-zero/onboarding"));
  }

  const isAnalyzing = await isAnalyzingReplyTracker({ emailAccountId });

  const page = Number(searchParams.page || "1");
  const timeRange = searchParams.timeRange || "all";

  return (
    <GmailProvider>
      <Tabs className="flex h-full flex-col" defaultValue="needsReply">
        <TabsToolbar>
          <div className="w-full overflow-x-auto">
            <div className="flex items-center justify-between gap-2">
              <TabsList>
                <TabsTrigger
                  className="flex items-center gap-2"
                  value="needsReply"
                >
                  <MailIcon className="h-4 w-4" />
                  To Reply
                </TabsTrigger>
                <TabsTrigger
                  className="flex items-center gap-2"
                  value="awaitingReply"
                >
                  <ClockIcon className="h-4 w-4" />
                  Waiting
                </TabsTrigger>
                {/* <TabsTrigger
                value="needsAction"
                className="flex items-center gap-2"
              >
                <AlertCircleIcon className="h-4 w-4" />
                Needs Action
              </TabsTrigger> */}

                <TabsTrigger
                  className="flex items-center gap-2"
                  value="resolved"
                >
                  <CheckCircleIcon className="size-4" />
                  Done
                </TabsTrigger>
              </TabsList>

              <div className="flex items-center gap-2">
                <TimeRangeFilter />
              </div>
            </div>
          </div>
        </TabsToolbar>

        <TabsContent className="mt-0 flex-1" value="needsReply">
          <NeedsReply
            emailAccountId={emailAccountId}
            isAnalyzing={isAnalyzing}
            page={page}
            timeRange={timeRange}
            userEmail={emailAccount.email}
          />
        </TabsContent>

        <TabsContent className="mt-0 flex-1" value="awaitingReply">
          <AwaitingReply
            emailAccountId={emailAccountId}
            isAnalyzing={isAnalyzing}
            page={page}
            timeRange={timeRange}
            userEmail={emailAccount.email}
          />
        </TabsContent>

        {/* <TabsContent value="needsAction" className="mt-0 flex-1">
        <NeedsAction userId={userId} userEmail={userEmail} page={page} />
      </TabsContent> */}

        <TabsContent className="mt-0 flex-1" value="resolved">
          <Resolved
            emailAccountId={emailAccountId}
            page={page}
            timeRange={timeRange}
            userEmail={emailAccount.email}
          />
        </TabsContent>
      </Tabs>
    </GmailProvider>
  );
}
