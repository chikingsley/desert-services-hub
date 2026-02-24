"use client";

import { usePostHog } from "posthog-js/react";
import { Button } from "@/components/Button";
import { landingPageAnalytics } from "@/hooks/useAnalytics";

export function CTAButtons() {
  const posthog = usePostHog();
  return (
    <div className="mt-10 flex flex-col justify-center gap-2 md:flex-row">
      <div>
        <Button
          color="blue"
          link={{ href: "/login" }}
          onClick={() => landingPageAnalytics.getStartedClicked(posthog)}
          size="2xl"
        >
          Get Started for Free
        </Button>
      </div>
      <div>
        <Button
          color="transparent"
          link={{ href: "/sales", target: "_blank" }}
          onClick={() => landingPageAnalytics.talkToSalesClicked(posthog)}
          size="2xl"
        >
          Talk to sales
        </Button>
      </div>
    </div>
  );
}
