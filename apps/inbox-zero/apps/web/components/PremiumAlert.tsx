"use client";

import { CrownIcon } from "lucide-react";
import Link from "next/link";
import { starterTierName } from "@/app/(app)/premium/config";
import { usePremiumModal } from "@/app/(app)/premium/PremiumModal";
import { Tooltip } from "@/components/Tooltip";
import { Button } from "@/components/ui/button";
import { ActionCard } from "@/components/ui/card";
import { env } from "@/env";
import type { PremiumTier } from "@/generated/prisma/enums";
import { useUser } from "@/hooks/useUser";
import { hasAiAccess, hasUnsubscribeAccess, isPremium } from "@/utils/premium";

export function usePremium() {
  const swrResponse = useUser();
  const { data } = swrResponse;

  const premium = data?.premium;
  const aiApiKey = data?.aiApiKey;

  if (env.NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS) {
    return {
      ...swrResponse,
      premium,
      isPremium: true,
      hasUnsubscribeAccess: true,
      hasAiAccess: true,
      isProPlanWithoutApiKey: false,
      tier: "PROFESSIONAL_ANNUALLY" as const,
    };
  }

  const isUserPremium = !!(
    premium &&
    isPremium(premium.lemonSqueezyRenewsAt, premium.stripeSubscriptionStatus)
  );

  const isProPlanWithoutApiKey =
    (premium?.tier === "PRO_MONTHLY" || premium?.tier === "PRO_ANNUALLY") &&
    !aiApiKey;

  return {
    ...swrResponse,
    premium,
    isPremium: isUserPremium,
    hasUnsubscribeAccess:
      isUserPremium ||
      hasUnsubscribeAccess(premium?.tier || null, premium?.unsubscribeCredits),
    hasAiAccess: hasAiAccess(premium?.tier || null, aiApiKey),
    isProPlanWithoutApiKey,
    tier: premium?.tier,
  };
}

export function PremiumAiAssistantAlert({
  showSetApiKey,
  className,
  tier,
  stripeSubscriptionStatus,
  activeOnly,
}: {
  showSetApiKey: boolean;
  className?: string;
  tier?: PremiumTier | null;
  stripeSubscriptionStatus?: string | null;
  activeOnly?: boolean;
}) {
  const { PremiumModal, openModal } = usePremiumModal();

  const isBasicPlan = tier === "BASIC_MONTHLY" || tier === "BASIC_ANNUALLY";

  const isStripeTrialing =
    stripeSubscriptionStatus && stripeSubscriptionStatus !== "active";

  if (activeOnly && isStripeTrialing) {
    return (
      <div className={className}>
        <ActionCard
          description="This feature is not available on trial plans."
          icon={<CrownIcon className="h-5 w-5" />}
          title="Active Subscription Required"
        />
      </div>
    );
  }

  return (
    <div className={className}>
      {isBasicPlan ? (
        <ActionCard
          action={
            <Button onClick={openModal} variant="primaryBlack">
              Switch Plan
            </Button>
          }
          description={`Switch to the ${starterTierName} plan to use this feature.`}
          icon={<CrownIcon className="h-5 w-5" />}
          title={`${starterTierName} Plan Required`}
        />
      ) : showSetApiKey ? (
        <ActionCard
          action={
            <Button asChild variant="primaryBlack">
              <Link href="/settings">Set API Key</Link>
            </Button>
          }
          description="You need to set an AI API key to use this feature."
          icon={<CrownIcon className="h-5 w-5" />}
          title="API Key Required"
        />
      ) : (
        <ActionCard
          action={
            <Button onClick={openModal} variant="primaryBlack">
              Upgrade
            </Button>
          }
          description={`This is a premium feature. Upgrade to the ${starterTierName} plan.`}
          icon={<CrownIcon className="h-5 w-5" />}
          title="Premium Feature"
        />
      )}
      <PremiumModal />
    </div>
  );
}

export function PremiumAlertWithData({
  className,
  activeOnly,
}: {
  className?: string;
  activeOnly?: boolean;
}) {
  const {
    hasAiAccess,
    isLoading: isLoadingPremium,
    isProPlanWithoutApiKey,
    tier,
    data,
  } = usePremium();

  if (!(isLoadingPremium || hasAiAccess)) {
    return (
      <PremiumAiAssistantAlert
        activeOnly={activeOnly}
        className={className}
        showSetApiKey={isProPlanWithoutApiKey}
        stripeSubscriptionStatus={
          data?.premium?.stripeSubscriptionStatus || null
        }
        tier={tier}
      />
    );
  }

  return null;
}

export function PremiumTooltip(props: {
  children: React.ReactElement<any>;
  showTooltip: boolean;
  openModal: () => void;
}) {
  if (!props.showTooltip) {
    return props.children;
  }

  return (
    <Tooltip
      contentComponent={<PremiumTooltipContent openModal={props.openModal} />}
    >
      <span>{props.children}</span>
    </Tooltip>
  );
}

export function PremiumTooltipContent({
  openModal,
}: {
  openModal: () => void;
}) {
  return (
    <div className="text-center">
      <p>You{"'"}ve hit the free tier limit 🥺</p>
      <p>Upgrade to unlock full access.</p>
      <Button className="mt-1" onClick={openModal} size="xs">
        Upgrade
      </Button>
    </div>
  );
}
