import "../../styles/globals.css";
import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import type React from "react";
import { AssessUser } from "@/app/(app)/[emailAccountId]/assess";
import { ErrorMessages } from "@/app/(app)/ErrorMessages";
import { SentryIdentify } from "@/app/(app)/sentry-identify";
import { CommandK } from "@/components/CommandK";
import { EmailViewer } from "@/components/EmailViewer";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AnnouncementDialog } from "@/components/feature-announcements/AnnouncementDialog";
import { SideNavWithTopNav } from "@/components/SideNavWithTopNav";
import { AppProviders } from "@/providers/AppProviders";
import { PostHogIdentify } from "@/providers/PostHogProvider";
import { QueueInitializer } from "@/store/QueueInitializer";
import { auth } from "@/utils/auth";
import { captureException } from "@/utils/error";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";

const logger = createScopedLogger("AppLayout");

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["400", "500", "600", "700"], // font-normal, font-medium, font-semibold, font-bold
  preload: true,
  display: "swap",
});

export const viewport = {
  themeColor: "#FFF",
  // safe area for iOS PWA
  userScalable: false,
  initialScale: 1,
  maximumScale: 1,
  minimumScale: 1,
  width: "device-width",
  height: "device-height",
  viewportFit: "cover",
};

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user.email) {
    redirect("/login");
  }

  const cookieStore = await cookies();
  const isClosed = cookieStore.get("left-sidebar:state")?.value === "false";

  after(async () => {
    const email = session.user.email;
    try {
      await prisma.user.update({
        where: { email },
        data: { lastLogin: new Date() },
      });
    } catch (error) {
      logger.error("Failed to update last login", { email, error });
      captureException(error, { userEmail: email });
    }
  });

  return (
    <div className={inter.variable}>
      <div className="font-inter">
        <AppProviders>
          <SideNavWithTopNav defaultOpen={!isClosed}>
            <ErrorMessages />
            {children}
          </SideNavWithTopNav>
          <EmailViewer />
          <AnnouncementDialog />
          <ErrorBoundary extra={{ component: "AppLayout" }}>
            <PostHogIdentify />

            <CommandK />
            <QueueInitializer />
            <AssessUser />
            <SentryIdentify email={session.user.email} />
          </ErrorBoundary>
        </AppProviders>
      </div>
    </div>
  );
}
