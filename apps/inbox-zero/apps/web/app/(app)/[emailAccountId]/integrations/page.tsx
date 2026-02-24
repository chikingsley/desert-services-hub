"use client";

import { Integrations } from "@/app/(app)/[emailAccountId]/integrations/Integrations";
import { PageHeader } from "@/components/PageHeader";
import { PageWrapper } from "@/components/PageWrapper";
import { usePremium } from "@/components/PremiumAlert";
import { Button } from "@/components/ui/button";
import { useIntegrationsEnabled } from "@/hooks/useFeatureFlags";
import { hasTierAccess } from "@/utils/premium";
import { IntegrationsPremiumAlert } from "./IntegrationsPremiumAlert";
import { RequestAccessDialog } from "./RequestAccessDialog";

export default function IntegrationsPage() {
  const integrationsEnabled = useIntegrationsEnabled();
  const { tier } = usePremium();

  const hasAccess = hasTierAccess({
    tier: tier || null,
    minimumTier: "PLUS_MONTHLY",
  });

  // Feature flag check - return null for client-side (notFound() is server-only)
  if (!integrationsEnabled) {
    return null;
  }

  return (
    <PageWrapper>
      <div className="flex items-center justify-between gap-2">
        <PageHeader
          description="Connect to external services to help the AI assistant draft better replies by accessing relevant data from your tools."
          title="Integrations"
        />
        {hasAccess && (
          <div className="shrink-0">
            <RequestAccessDialog
              trigger={
                <Button variant="outline">Request an Integration</Button>
              }
            />
          </div>
        )}
      </div>

      <div className="mt-8 space-y-4">
        {!hasAccess && <IntegrationsPremiumAlert />}
        <Integrations />
      </div>
    </PageWrapper>
  );
}
