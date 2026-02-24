"use client";

import Link from "next/link";
import { usePostHog } from "posthog-js/react";
import { Button } from "@/components/new-landing/common/Button";
import { Chat } from "@/components/new-landing/icons/Chat";
import { landingPageAnalytics } from "@/hooks/useAnalytics";
import { cn } from "@/utils";

interface CallToActionProps {
  buttonSize?: "xl" | "lg";
  className?: string;
  text?: string;
}

export function CallToAction({
  text = "Get started",
  buttonSize = "xl",
  className,
}: CallToActionProps) {
  const posthog = usePostHog();

  return (
    <div className={cn("flex items-center justify-center gap-4", className)}>
      <Button asChild size={buttonSize}>
        <Link
          href="/login"
          onClick={() => landingPageAnalytics.getStartedClicked(posthog)}
        >
          <span className="relative z-10">{text}</span>
        </Link>
      </Button>
      <Button asChild size={buttonSize} variant="secondary-two">
        <Link
          href="/sales"
          onClick={() => landingPageAnalytics.talkToSalesClicked(posthog)}
          target="_blank"
        >
          <Chat />
          Talk to sales
        </Link>
      </Button>
    </div>
  );
}
