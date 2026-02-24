"use client";

import { ArrowRightIcon, ChromeIcon, MailsIcon } from "lucide-react";
import { useState } from "react";
import { IconCircle } from "@/app/(app)/[emailAccountId]/onboarding/IconCircle";
import { OnboardingImagePreview } from "@/app/(app)/[emailAccountId]/onboarding/ImagePreview";
import { OnboardingWrapper } from "@/app/(app)/[emailAccountId]/onboarding/OnboardingWrapper";
import { PageHeading, TypographyP } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { EXTENSION_URL } from "@/utils/config";

export function StepExtension({ onNext }: { onNext: () => Promise<void> }) {
  const [isLoading, setIsLoading] = useState(false);

  return (
    <div className="grid xl:grid-cols-2">
      <OnboardingWrapper className="py-0">
        <IconCircle className="mx-auto" size="lg">
          <MailsIcon className="size-6" />
        </IconCircle>

        <div className="mt-4 text-center">
          <PageHeading>Install the Inbox Zero Tabs extension</PageHeading>
          <TypographyP className="mx-auto mt-2 max-w-lg">
            Add tabs to Gmail that show only <strong>unhandled emails</strong>{" "}
            by label.
            <br />
            See only emails needing replies, or see only newsletters and archive
            all (or mark as read) in one click.
          </TypographyP>
        </div>

        <div className="mt-8 flex justify-center">
          <Button asChild size="sm">
            <a href={EXTENSION_URL} rel="noopener noreferrer" target="_blank">
              <ChromeIcon className="mr-2 size-4" />
              Install Extension
            </a>
          </Button>
        </div>

        <div className="mt-8 flex justify-center">
          <Button
            loading={isLoading}
            onClick={async () => {
              setIsLoading(true);
              onNext().finally(() => {
                setIsLoading(false);
              });
            }}
            size="sm"
            variant="outline"
          >
            Skip for now <ArrowRightIcon className="ml-2 size-4" />
          </Button>
        </div>
      </OnboardingWrapper>

      <div className="fixed top-0 right-0 hidden h-screen w-1/2 items-center justify-center bg-white xl:flex">
        <OnboardingImagePreview
          alt="Inbox Zero Tabs Extension"
          height={1200}
          src="/images/onboarding/extension.png"
          width={672}
        />
      </div>
    </div>
  );
}
