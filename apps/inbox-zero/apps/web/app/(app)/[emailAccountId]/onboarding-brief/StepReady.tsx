"use client";

import { CheckIcon, ExternalLinkIcon, Sparkles } from "lucide-react";
import Link from "next/link";
import { IconCircle } from "@/app/(app)/[emailAccountId]/onboarding/IconCircle";
import { PageHeading, TypographyP } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { CardBasic } from "@/components/ui/card";
import { useAccount } from "@/providers/EmailAccountProvider";
import { isGoogleProvider } from "@/utils/email/provider-types";
import { getGmailBasicSearchUrl } from "@/utils/url";

const PRICING_FEATURES = [
  "Briefs for every external meeting",
  "Google Calendar & Outlook",
  "LinkedIn & web research",
  "Sent 1-24 hours before (you choose)",
];

export function StepReady() {
  const { emailAccount } = useAccount();

  return (
    <>
      <div className="flex justify-center">
        <IconCircle size="lg">
          <Sparkles className="size-6" />
        </IconCircle>
      </div>

      <div className="text-center">
        <PageHeading className="mt-4">
          Ready to walk into every meeting prepared?
        </PageHeading>
        <TypographyP className="mx-auto mt-2 max-w-lg">
          You'll get a brief like this before every external meeting,
          automatically.
        </TypographyP>
      </div>

      <div className="mt-8 flex flex-col items-center">
        <CardBasic className="mt-4 w-full p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                Meeting Briefs Pro
              </p>
              <p className="mt-1 font-bold text-3xl text-foreground">
                Internal
                <span className="font-normal text-base text-muted-foreground">
                  access
                </span>
              </p>
              <p className="mt-1 text-muted-foreground text-sm">
                Billing flow is disabled in this internal fork.
              </p>
            </div>
            <div className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 font-semibold text-blue-700 text-sm">
              Internal mode
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            {PRICING_FEATURES.map((feature) => (
              <div className="flex items-center gap-2.5" key={feature}>
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-green-50">
                  <CheckIcon className="h-3 w-3 text-green-600" />
                </div>
                <span className="text-foreground">{feature}</span>
              </div>
            ))}
          </div>
        </CardBasic>
      </div>

      <div className="mt-8 flex flex-col gap-3">
        <Button asChild className="w-full" size="lg">
          <Link href="/setup">Continue</Link>
        </Button>

        {emailAccount?.email &&
          isGoogleProvider(emailAccount?.account?.provider) && (
            <Button asChild className="w-full" size="lg" variant="outline">
              <Link
                href={getGmailBasicSearchUrl(
                  emailAccount.email,
                  "from:(getinboxzero.com) subject:(Briefing for)"
                )}
                rel="noopener noreferrer"
                target="_blank"
              >
                <ExternalLinkIcon className="mr-2 h-4 w-4" />
                View test brief in Gmail
              </Link>
            </Button>
          )}
      </div>
    </>
  );
}
