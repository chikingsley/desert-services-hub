"use client";

import { BotIcon, CoinsIcon, CpuIcon } from "lucide-react";
import { LoadingContent } from "@/components/LoadingContent";
import { usePremium } from "@/components/PremiumAlert";
import { StatsCards } from "@/components/StatsCards";
import { env } from "@/env";
import { isPremium } from "@/utils/premium";
import type { RedisUsage } from "@/utils/redis/usage";
import { formatStat } from "@/utils/stats";

export function Usage(props: { usage: RedisUsage | null }) {
  const { premium, isLoading, error } = usePremium();

  return (
    <LoadingContent error={error} loading={isLoading}>
      <StatsCards
        stats={[
          {
            name: "Unsubscribe Credits",
            value: isPremium(
              premium?.lemonSqueezyRenewsAt || null,
              premium?.stripeSubscriptionStatus || null
            )
              ? "Unlimited"
              : formatStat(
                  premium?.unsubscribeCredits ??
                    env.NEXT_PUBLIC_FREE_UNSUBSCRIBE_CREDITS
                ),
            subvalue: "credits",
            icon: <CoinsIcon className="h-4 w-4" />,
          },
          {
            name: "LLM API Calls",
            value: formatStat(props.usage?.openaiCalls),
            subvalue: "calls",
            icon: <BotIcon className="h-4 w-4" />,
          },
          {
            name: "LLM Tokens Used",
            value: formatStat(props.usage?.openaiTokensUsed),
            subvalue: "tokens",
            icon: <CpuIcon className="h-4 w-4" />,
          },
        ]}
      />
    </LoadingContent>
  );
}
