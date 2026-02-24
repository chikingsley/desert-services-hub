import { AdminHashEmail } from "@/app/(app)/admin/AdminHashEmail";
import {
  AdminSyncStripe,
  AdminSyncStripeCustomers,
} from "@/app/(app)/admin/AdminSyncStripe";
import { AdminUpgradeUserForm } from "@/app/(app)/admin/AdminUpgradeUserForm";
import { AdminUserControls } from "@/app/(app)/admin/AdminUserControls";
import { AdminUserInfo } from "@/app/(app)/admin/AdminUserInfo";
import { DebugLabels } from "@/app/(app)/admin/DebugLabels";
import { GmailUrlConverter } from "@/app/(app)/admin/GmailUrlConverter";
import { RegisterSSOModal } from "@/app/(app)/admin/RegisterSSOModal";
import { ErrorPage } from "@/components/ErrorPage";
import { PageHeader } from "@/components/PageHeader";
import { PageWrapper } from "@/components/PageWrapper";
import { isAdmin } from "@/utils/admin";
import { auth } from "@/utils/auth";

// NOTE: Turn on Fluid Compute on Vercel to allow for 800 seconds max duration
export const maxDuration = 800;

export default async function AdminPage() {
  const session = await auth();

  if (!isAdmin({ email: session?.user.email })) {
    return (
      <ErrorPage
        description="You do not have permission to access this page."
        title="No Access"
      />
    );
  }

  return (
    <PageWrapper>
      <PageHeader title="Admin" />

      <div className="mt-4 mb-20 space-y-8">
        <AdminUpgradeUserForm />
        <AdminUserControls />
        <AdminUserInfo />
        <AdminHashEmail />
        <GmailUrlConverter />
        <DebugLabels />
        <RegisterSSOModal />

        <div className="flex gap-2">
          <AdminSyncStripe />
          <AdminSyncStripeCustomers />
        </div>
      </div>
    </PageWrapper>
  );
}
