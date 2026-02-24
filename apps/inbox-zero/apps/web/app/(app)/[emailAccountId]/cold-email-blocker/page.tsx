import { Suspense } from "react";
import { ColdEmailContent } from "@/app/(app)/[emailAccountId]/cold-email-blocker/ColdEmailContent";
import { PermissionsCheck } from "@/app/(app)/[emailAccountId]/PermissionsCheck";
import { PageHeader } from "@/components/PageHeader";
import { PageWrapper } from "@/components/PageWrapper";
import { GmailProvider } from "@/providers/GmailProvider";

export default function ColdEmailBlockerPage() {
  return (
    <PageWrapper>
      <PageHeader title="Cold Email Blocker" />
      <GmailProvider>
        <Suspense>
          <PermissionsCheck />
          <div className="mt-4">
            <ColdEmailContent />
          </div>
        </Suspense>
      </GmailProvider>
    </PageWrapper>
  );
}
