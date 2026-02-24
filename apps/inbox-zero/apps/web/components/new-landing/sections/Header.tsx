"use client";

import Link from "next/link";
import { usePostHog } from "posthog-js/react";
import { Button } from "@/components/new-landing/common/Button";
import { Logo } from "@/components/new-landing/common/Logo";
import { HeaderLinks } from "@/components/new-landing/HeaderLinks";
import { landingPageAnalytics } from "@/hooks/useAnalytics";
import { cn } from "@/utils";

interface HeaderProps {
  className: string;
}

export function Header({ className }: HeaderProps) {
  const posthog = usePostHog();

  return (
    <header
      className={cn(
        "mx-auto flex h-16 items-center justify-between bg-white",
        className
      )}
    >
      <div className="hidden md:block">
        <Logo />
      </div>
      <div className="block md:hidden">
        <Logo variant="mobile" />
      </div>
      <HeaderLinks />
      <div className="flex items-center gap-3">
        <Button asChild variant="secondary">
          <Link
            href="/login"
            onClick={() => landingPageAnalytics.logInClicked(posthog)}
          >
            Log in
          </Link>
        </Button>
        <Button asChild>
          <Link
            href="/login"
            onClick={() => landingPageAnalytics.getStartedClicked(posthog)}
          >
            <span className="relative z-10">Get started free</span>
          </Link>
        </Button>
      </div>
    </header>
  );
}
