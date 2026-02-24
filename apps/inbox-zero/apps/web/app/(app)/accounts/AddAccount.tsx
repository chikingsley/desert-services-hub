"use client";

import Image from "next/image";
import { useState } from "react";
import { toastError } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { getAccountLinkingUrl } from "@/utils/account-linking";
import { isGoogleProvider } from "@/utils/email/provider-types";

export function AddAccount() {
  const [isLoadingGoogle, setIsLoadingGoogle] = useState(false);
  const [isLoadingMicrosoft, setIsLoadingMicrosoft] = useState(false);

  const handleAddAccount = async (provider: "google" | "microsoft") => {
    const setLoading = isGoogleProvider(provider)
      ? setIsLoadingGoogle
      : setIsLoadingMicrosoft;
    setLoading(true);

    try {
      const url = await getAccountLinkingUrl(provider);
      window.location.href = url;
    } catch (error) {
      console.error(`Error initiating ${provider} link:`, error);
      toastError({
        title: `Error initiating ${isGoogleProvider(provider) ? "Google" : "Microsoft"} link`,
        description: "Please try again or contact support",
      });
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[90px] flex-col items-center justify-center gap-3">
      <div className="flex items-center gap-2">
        <Button
          className="w-full"
          disabled={isLoadingGoogle || isLoadingMicrosoft}
          loading={isLoadingGoogle}
          onClick={() => handleAddAccount("google")}
          variant="outline"
        >
          <Image
            alt=""
            height={24}
            src="/images/google.svg"
            unoptimized
            width={24}
          />
          <span className="ml-2">Add Google</span>
        </Button>
        <Button
          className="w-full"
          disabled={isLoadingGoogle || isLoadingMicrosoft}
          loading={isLoadingMicrosoft}
          onClick={() => handleAddAccount("microsoft")}
          variant="outline"
        >
          <Image
            alt=""
            height={24}
            src="/images/microsoft.svg"
            unoptimized
            width={24}
          />
          <span className="ml-2">Add Microsoft</span>
        </Button>
      </div>
    </div>
  );
}
