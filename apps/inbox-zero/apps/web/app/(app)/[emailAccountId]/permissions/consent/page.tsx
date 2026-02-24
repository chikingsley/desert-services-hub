"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { toastError } from "@/components/Toast";
import { PageHeading, TypographyP } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/providers/EmailAccountProvider";
import { getAccountLinkingUrl } from "@/utils/account-linking";

export default function PermissionsConsentPage() {
  const { provider, isLoading: accountLoading } = useAccount();
  const [isReconnecting, setIsReconnecting] = useState(false);

  const handleReconnect = async () => {
    setIsReconnecting(true);

    try {
      const accountProvider = provider === "microsoft" ? "microsoft" : "google";
      const url = await getAccountLinkingUrl(accountProvider);
      window.location.href = url;
    } catch (error) {
      console.error("Error initiating reconnection:", error);
      toastError({
        title: "Error initiating reconnection",
        description: "Please try again or contact support",
      });
    } finally {
      setIsReconnecting(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center sm:p-20 md:p-32">
      <PageHeading className="text-center">
        We are missing permissions 😔
      </PageHeading>

      <TypographyP className="mx-auto mt-4 max-w-prose text-center">
        You must sign in and give access to all permissions for Inbox Zero to
        work.
      </TypographyP>

      <Button
        className="mt-4"
        disabled={isReconnecting || accountLoading}
        loading={isReconnecting}
        onClick={handleReconnect}
      >
        Reconnect account
      </Button>

      <p className="mt-8 text-center text-muted-foreground">
        Having trouble?{" "}
        <Link className="underline hover:text-primary" href="/logout">
          Sign out
        </Link>{" "}
        and sign back in again.
      </p>

      <div className="mt-8">
        <Image
          alt=""
          className="dark:brightness-90 dark:invert"
          height={400}
          src="/images/illustrations/falling.svg"
          unoptimized
          width={400}
        />
      </div>
    </div>
  );
}
