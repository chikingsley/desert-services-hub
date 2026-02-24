import { OrgAnalyticsConsentBanner } from "@/app/(app)/organization/[organizationId]/OrgAnalyticsConsentBanner";
import { OrganizationTabs } from "@/app/(app)/organization/[organizationId]/OrganizationTabs";
import { OrgStats } from "@/app/(app)/organization/[organizationId]/stats/OrgStats";
import { PageWrapper } from "@/components/PageWrapper";

export default async function OrgStatsPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;

  return (
    <PageWrapper>
      <OrganizationTabs organizationId={organizationId} />
      <OrgAnalyticsConsentBanner />
      <div className="mt-6">
        <OrgStats organizationId={organizationId} />
      </div>
    </PageWrapper>
  );
}
