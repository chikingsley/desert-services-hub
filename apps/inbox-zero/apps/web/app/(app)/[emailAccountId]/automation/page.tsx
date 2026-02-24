import { SparklesIcon } from "lucide-react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AIChatButton } from "@/app/(app)/[emailAccountId]/assistant/AIChatButton";
import { AllRulesDisabledBanner } from "@/app/(app)/[emailAccountId]/assistant/AllRulesDisabledBanner";
import { History } from "@/app/(app)/[emailAccountId]/assistant/History";
import { Process } from "@/app/(app)/[emailAccountId]/assistant/Process";
import { RulesTab } from "@/app/(app)/[emailAccountId]/assistant/RulesTabNew";
import { SettingsTab } from "@/app/(app)/[emailAccountId]/assistant/settings/SettingsTab";
import {
  getStepNumber,
  STEP_KEYS,
} from "@/app/(app)/[emailAccountId]/onboarding/steps";
import { PermissionsCheck } from "@/app/(app)/[emailAccountId]/PermissionsCheck";
import { PageHeader } from "@/components/PageHeader";
import { PageWrapper } from "@/components/PageWrapper";
import { TabSelect } from "@/components/TabSelect";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { DismissibleVideoCard } from "@/components/VideoCard";
import { EmailProvider } from "@/providers/EmailProvider";
import { ASSISTANT_ONBOARDING_COOKIE } from "@/utils/cookies";
import { checkUserOwnsEmailAccount } from "@/utils/email-account";
import { prefixPath } from "@/utils/path";
import prisma from "@/utils/prisma";

export const maxDuration = 300; // Applies to the actions

const tabOptions = (emailAccountId: string) => [
  {
    id: "rules",
    label: "Rules",
    href: `/${emailAccountId}/automation?tab=rules`,
  },
  {
    id: "test",
    label: "Test",
    href: `/${emailAccountId}/automation?tab=test`,
  },
  {
    id: "history",
    label: "History",
    href: `/${emailAccountId}/automation?tab=history`,
  },
  {
    id: "settings",
    label: "Settings",
    href: `/${emailAccountId}/automation?tab=settings`,
  },
];

export default async function AutomationPage({
  params,
  searchParams,
}: {
  params: Promise<{ emailAccountId: string }>;
  searchParams: Promise<{ tab: string }>;
}) {
  const { emailAccountId } = await params;
  const { tab } = await searchParams;
  await checkUserOwnsEmailAccount({ emailAccountId });

  // onboarding redirect
  const cookieStore = await cookies();
  const viewedOnboarding =
    cookieStore.get(ASSISTANT_ONBOARDING_COOKIE)?.value === "true";

  if (!viewedOnboarding) {
    const hasRule = await prisma.rule.findFirst({
      where: { emailAccountId },
      select: { id: true },
    });

    if (!hasRule) {
      redirect(
        prefixPath(
          emailAccountId,
          `/onboarding?step=${getStepNumber(STEP_KEYS.LABELS)}`
        )
      );
    }
  }

  return (
    <EmailProvider>
      <Suspense>
        <PermissionsCheck />

        <PageWrapper>
          <div className="flex items-center justify-between">
            <div>
              <PageHeader
                title="AI Assistant"
                video={{
                  title: "Getting started with AI Personal Assistant",
                  description:
                    "Learn how to use the AI Personal Assistant to automatically label, archive, and more.",
                  muxPlaybackId: "VwIP7UAw4MXDjkvmLjJzGsY00ee9jxIZVI952DoBBfp8",
                }}
              />
            </div>

            <div className="ml-4">
              <AIChatButton />
            </div>
          </div>

          <AllRulesDisabledBanner />

          <div className="border-neutral-200 border-b pt-2">
            <TabSelect
              options={tabOptions(emailAccountId)}
              selected={tab ?? "rules"}
            />
          </div>

          <DismissibleVideoCard
            className="my-4"
            description={
              "Learn how to use the AI Assistant to automatically label, archive, and more."
            }
            icon={<SparklesIcon className="h-5 w-5" />}
            muxPlaybackId="VwIP7UAw4MXDjkvmLjJzGsY00ee9jxIZVI952DoBBfp8"
            storageKey="ai-assistant-onboarding-video"
            title="Getting started with AI Assistant"
          />

          <Tabs defaultValue="rules">
            <TabsContent className="mb-10" value="rules">
              <RulesTab />
            </TabsContent>
            <TabsContent className="mb-10" value="settings">
              <SettingsTab />
            </TabsContent>
            <TabsContent className="mb-10" value="test">
              <Process />
            </TabsContent>
            <TabsContent className="mb-10" value="history">
              <History />
            </TabsContent>
          </Tabs>
        </PageWrapper>
      </Suspense>
    </EmailProvider>
  );
}
