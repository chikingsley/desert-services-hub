"use client";

import { CrownIcon } from "lucide-react";
import { usePremiumModal } from "@/app/(app)/premium/PremiumModal";
import { Button } from "@/components/ui/button";
import { ActionCard } from "@/components/ui/card";

export function IntegrationsPremiumAlert() {
  const { PremiumModal, openModal } = usePremiumModal();

  return (
    <>
      <ActionCard
        action={
          <Button onClick={openModal} variant="primaryBlack">
            Upgrade
          </Button>
        }
        description="Connect your CRM and tools to help the AI draft better replies and generate richer meeting briefs."
        icon={<CrownIcon className="h-5 w-5" />}
        title="Plus Plan Required"
      />
      <PremiumModal />
    </>
  );
}
