"use client";

import Image from "next/image";
import { useState } from "react";
import type { GetCalendarAuthUrlResponse } from "@/app/api/google/calendar/auth-url/route";
import { toastError } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { useAccount } from "@/providers/EmailAccountProvider";
import { CALENDAR_ONBOARDING_RETURN_COOKIE } from "@/utils/calendar/constants";
import { captureException } from "@/utils/error";
import { fetchWithAccount } from "@/utils/fetch";

export function ConnectCalendar({
  onboardingReturnPath,
}: {
  onboardingReturnPath?: string;
}) {
  const { emailAccountId } = useAccount();
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);
  const [isConnectingMicrosoft, setIsConnectingMicrosoft] = useState(false);

  const setOnboardingReturnCookie = () => {
    if (onboardingReturnPath) {
      document.cookie = `${CALENDAR_ONBOARDING_RETURN_COOKIE}=${encodeURIComponent(onboardingReturnPath)}; path=/; max-age=180; SameSite=Lax; Secure`;
    }
  };

  const handleConnectGoogle = async () => {
    setIsConnectingGoogle(true);
    try {
      const response = await fetchWithAccount({
        url: "/api/google/calendar/auth-url",
        emailAccountId,
        init: { headers: { "Content-Type": "application/json" } },
      });

      if (!response.ok) {
        throw new Error("Failed to initiate Google calendar connection");
      }

      const data: GetCalendarAuthUrlResponse = await response.json();
      setOnboardingReturnCookie();
      window.location.href = data.url;
    } catch (error) {
      captureException(error, {
        extra: { context: "Google Calendar OAuth initiation" },
      });
      toastError({
        title: "Error initiating Google calendar connection",
        description: "Please try again or contact support",
      });
      setIsConnectingGoogle(false);
    }
  };

  const handleConnectMicrosoft = async () => {
    setIsConnectingMicrosoft(true);
    try {
      const response = await fetchWithAccount({
        url: "/api/outlook/calendar/auth-url",
        emailAccountId,
        init: { headers: { "Content-Type": "application/json" } },
      });

      if (!response.ok) {
        throw new Error("Failed to initiate Microsoft calendar connection");
      }

      const data: GetCalendarAuthUrlResponse = await response.json();
      setOnboardingReturnCookie();
      window.location.href = data.url;
    } catch (error) {
      captureException(error, {
        extra: { context: "Microsoft Calendar OAuth initiation" },
      });
      toastError({
        title: "Error initiating Microsoft calendar connection",
        description: "Please try again or contact support",
      });
      setIsConnectingMicrosoft(false);
    }
  };

  return (
    <div className="flex flex-wrap gap-2 md:flex-nowrap">
      <Button
        className="flex w-full items-center gap-2 md:w-auto"
        disabled={isConnectingGoogle || isConnectingMicrosoft}
        onClick={handleConnectGoogle}
        variant="outline"
      >
        <Image
          alt="Google"
          height={16}
          src="/images/google.svg"
          unoptimized
          width={16}
        />
        {isConnectingGoogle ? "Connecting..." : "Add Google Calendar"}
      </Button>

      <Button
        className="flex w-full items-center gap-2 md:w-auto"
        disabled={isConnectingGoogle || isConnectingMicrosoft}
        onClick={handleConnectMicrosoft}
        variant="outline"
      >
        <Image
          alt="Microsoft"
          height={16}
          src="/images/microsoft.svg"
          unoptimized
          width={16}
        />
        {isConnectingMicrosoft ? "Connecting..." : "Add Outlook Calendar"}
      </Button>
    </div>
  );
}
