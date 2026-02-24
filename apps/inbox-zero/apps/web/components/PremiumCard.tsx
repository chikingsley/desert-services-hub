"use client";

import { AlertTriangleIcon, CreditCardIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { HoverCard } from "@/components/HoverCard";
import { MutedText } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useUser } from "@/hooks/useUser";
import { cn } from "@/utils";
import { isPremium } from "@/utils/premium";

interface PremiumData {
  lemonSqueezyRenewsAt?: Date | string | null;
  lemonSqueezySubscriptionId?: number | string | null;
  stripeSubscriptionId?: string | null;
  stripeSubscriptionStatus?: string | null;
  tier?: string | null;
}

interface PremiumExpiredCardProps {
  onDismiss?: () => void;
  premium: PremiumData | null | undefined;
}

export function PremiumExpiredCardContent({
  premium,
  onDismiss,
  isCollapsed = false,
}: PremiumExpiredCardProps & { isCollapsed?: boolean }) {
  // Convert string dates to Date objects if needed
  const lemonSqueezyRenewsAt = premium?.lemonSqueezyRenewsAt
    ? typeof premium.lemonSqueezyRenewsAt === "string"
      ? new Date(premium.lemonSqueezyRenewsAt)
      : premium.lemonSqueezyRenewsAt
    : null;

  const isUserPremium = isPremium(
    lemonSqueezyRenewsAt,
    premium?.stripeSubscriptionStatus || null
  );

  if (isUserPremium) {
    return null;
  }

  const getSubscriptionMessage = () => {
    const UPGRADE_MESSAGE = {
      title: "Upgrade to Premium",
      description: "Upgrade to Premium to enable your AI email assistant.",
    };

    if (!premium) {
      return UPGRADE_MESSAGE;
    }

    const status = premium.stripeSubscriptionStatus;
    const hasLemonSqueezyExpired =
      lemonSqueezyRenewsAt && lemonSqueezyRenewsAt < new Date();

    // Check if user never had a subscription
    const hasNoSubscription = !(
      status ||
      premium.stripeSubscriptionId ||
      premium.lemonSqueezySubscriptionId
    );

    if (!premium || hasNoSubscription) {
      return {
        title: "Upgrade to Premium",
        description: "Upgrade to Premium to enable your AI email assistant.",
      };
    }

    if (status === "past_due") {
      return {
        title: "Payment Past Due",
        description: "Update your payment method to continue service",
      };
    }

    if (status === "canceled" || status === "cancelled") {
      return {
        title: "Subscription Cancelled",
        description: "Reactivate to resume AI email management",
      };
    }

    if (status === "incomplete" || status === "incomplete_expired") {
      return {
        title: "Payment Incomplete",
        description: "Complete your payment to activate service",
      };
    }

    if (status === "unpaid") {
      return {
        title: "Payment Required",
        description: "Update payment to continue AI features",
      };
    }

    if (hasLemonSqueezyExpired || status === "expired") {
      return {
        title: "Subscription Expired",
        description: "Renew your subscription to continue",
      };
    }

    // Default fallback
    return {
      title: "Subscription Issue",
      description: "Please check your subscription status",
    };
  };

  const { title, description } = getSubscriptionMessage();

  const isNewUser = !(
    premium &&
    (premium.stripeSubscriptionStatus ||
      premium.stripeSubscriptionId ||
      premium.lemonSqueezySubscriptionId)
  );

  const buttonText = isNewUser ? "Upgrade" : "Reactivate";
  const buttonHref = "/settings";

  // When collapsed, show only the alert icon with a hover card
  if (isCollapsed) {
    return (
      <HoverCard
        className="w-64"
        content={
          <div className="space-y-2">
            <p className="font-semibold text-orange-800 text-sm dark:text-orange-200">
              {title}
            </p>
            <MutedText>{description}</MutedText>
            <Button
              asChild
              className="mt-2 h-8 w-full border-0 bg-orange-600 text-white shadow-sm hover:bg-orange-700"
              size="sm"
            >
              <Link
                className="flex items-center justify-center gap-1.5"
                href={buttonHref}
              >
                <CreditCardIcon className="h-3.5 w-3.5" />
                <span className="font-medium text-xs">{buttonText}</span>
              </Link>
            </Button>
          </div>
        }
      >
        <Link
          className="flex items-center justify-center rounded-lg bg-orange-100 p-2 transition-colors hover:bg-orange-200 dark:bg-orange-900/30 dark:hover:bg-orange-900/50"
          href={buttonHref}
        >
          <AlertTriangleIcon className="h-5 w-5 text-orange-600 dark:text-orange-400" />
        </Link>
      </HoverCard>
    );
  }

  return (
    <Card
      className={cn(
        "border-orange-200 bg-gradient-to-tr from-transparent via-orange-50/80 to-orange-500/15 shadow-sm",
        "dark:border-orange-900 dark:from-orange-950/50 dark:via-orange-900/20 dark:to-orange-800/10"
      )}
    >
      <div className="p-3">
        <div className="flex items-start gap-2">
          <AlertTriangleIcon className="mt-0.5 h-4 w-4 flex-shrink-0 text-orange-600 dark:text-orange-400" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-orange-800 text-sm leading-tight dark:text-orange-200">
              {title}
            </p>
            <p className="mt-1 text-orange-700/80 text-xs dark:text-orange-300/80">
              {description}
            </p>
          </div>

          {onDismiss && (
            <button
              aria-label="Dismiss banner"
              className="flex-shrink-0 rounded p-1 text-orange-600 transition-colors hover:bg-orange-100 focus:outline-none focus:ring-2 focus:ring-orange-300 dark:text-orange-400 dark:focus:ring-orange-700 dark:hover:bg-orange-900/20"
              onClick={onDismiss}
              type="button"
            >
              <XIcon className="h-3 w-3" />
            </button>
          )}
        </div>

        <div className="mt-3">
          <Button
            asChild
            className="h-8 w-full border-0 bg-orange-600 text-white shadow-sm hover:bg-orange-700"
            size="sm"
          >
            <Link
              className="flex items-center justify-center gap-1.5"
              href={buttonHref}
            >
              <CreditCardIcon className="h-3.5 w-3.5" />
              <span className="font-medium text-xs">{buttonText}</span>
            </Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function PremiumCard({
  isCollapsed = false,
}: {
  isCollapsed?: boolean;
}) {
  const [dismissed, setDismissed] = useState(false);
  const { data: user, isLoading } = useUser();

  if (isLoading || dismissed || !user) {
    return null;
  }

  return (
    <div className={cn("px-3 pt-4", isCollapsed && "flex justify-center")}>
      <PremiumExpiredCardContent
        isCollapsed={isCollapsed}
        onDismiss={isCollapsed ? undefined : () => setDismissed(true)}
        premium={user.premium}
      />
    </div>
  );
}
