import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PermissionsCheck } from "@/app/(app)/[emailAccountId]/PermissionsCheck";
import { Chat } from "@/components/assistant-chat/chat";
import { EmailProvider } from "@/providers/EmailProvider";
import { ASSISTANT_ONBOARDING_COOKIE } from "@/utils/cookies";
import { checkUserOwnsEmailAccount } from "@/utils/email-account";
import { prefixPath } from "@/utils/path";
import prisma from "@/utils/prisma";

export const maxDuration = 300; // Applies to the actions

export default async function AssistantPage({
  params,
}: {
  params: Promise<{ emailAccountId: string }>;
}) {
  const { emailAccountId } = await params;
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
      redirect(prefixPath(emailAccountId, "/assistant?onboarding=true"));
    }
  }

  return (
    <EmailProvider>
      <Suspense>
        <PermissionsCheck />

        <div className="flex h-[calc(100vh-theme(spacing.9)-theme(spacing.14)-env(safe-area-inset-bottom))] flex-col md:h-screen">
          <Chat open />
        </div>
      </Suspense>
    </EmailProvider>
  );
}
