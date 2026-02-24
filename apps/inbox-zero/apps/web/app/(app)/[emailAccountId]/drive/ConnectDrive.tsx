"use client";

import Image from "next/image";
import { useState } from "react";
import type { GetDriveAuthUrlResponse } from "@/app/api/google/drive/auth-url/route";
import { toastError } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAccount } from "@/providers/EmailAccountProvider";
import { captureException } from "@/utils/error";
import { fetchWithAccount } from "@/utils/fetch";

export function ConnectDrive() {
  const { emailAccountId } = useAccount();
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);
  const [isConnectingMicrosoft, setIsConnectingMicrosoft] = useState(false);
  const [googleDialogOpen, setGoogleDialogOpen] = useState(false);

  const handleConnectGoogle = async (access: "limited" | "full") => {
    setIsConnectingGoogle(true);
    try {
      const accessParam = access === "full" ? "?access=full" : "";
      const response = await fetchWithAccount({
        url: `/api/google/drive/auth-url${accessParam}`,
        emailAccountId,
        init: { headers: { "Content-Type": "application/json" } },
      });

      if (!response.ok) {
        throw new Error("Failed to initiate Google Drive connection");
      }

      const data: GetDriveAuthUrlResponse = await response.json();

      if (!data?.url) {
        throw new Error("Invalid auth URL");
      }

      window.location.href = data.url;
    } catch (error) {
      captureException(error, {
        extra: { context: "Google Drive OAuth initiation" },
      });
      toastError({
        title: "Error initiating Google Drive connection",
        description: "Please try again or contact support",
      });
      setIsConnectingGoogle(false);
    }
  };

  const handleConnectMicrosoft = async () => {
    setIsConnectingMicrosoft(true);
    try {
      const response = await fetchWithAccount({
        url: "/api/outlook/drive/auth-url",
        emailAccountId,
        init: { headers: { "Content-Type": "application/json" } },
      });

      if (!response.ok) {
        throw new Error("Failed to initiate OneDrive connection");
      }

      const data: GetDriveAuthUrlResponse = await response.json();

      if (!data?.url) {
        throw new Error("Invalid auth URL");
      }

      window.location.href = data.url;
    } catch (error) {
      captureException(error, {
        extra: { context: "OneDrive OAuth initiation" },
      });
      toastError({
        title: "Error initiating OneDrive connection",
        description: "Please try again or contact support",
      });
      setIsConnectingMicrosoft(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap gap-2 md:flex-nowrap">
        <Button
          className="flex w-full items-center gap-2 md:w-auto"
          disabled={isConnectingGoogle || isConnectingMicrosoft}
          loading={isConnectingGoogle}
          onClick={() => setGoogleDialogOpen(true)}
          variant="outline"
        >
          <Image
            alt="Google Drive"
            height={16}
            src="/images/google.svg"
            unoptimized
            width={16}
          />
          {isConnectingGoogle ? "Connecting..." : "Add Google Drive"}
        </Button>

        <Button
          className="flex w-full items-center gap-2 md:w-auto"
          disabled={isConnectingGoogle || isConnectingMicrosoft}
          loading={isConnectingMicrosoft}
          onClick={handleConnectMicrosoft}
          variant="outline"
        >
          <Image
            alt="OneDrive"
            height={16}
            src="/images/microsoft.svg"
            unoptimized
            width={16}
          />
          {isConnectingMicrosoft ? "Connecting..." : "Add OneDrive"}
        </Button>
      </div>

      <Dialog onOpenChange={setGoogleDialogOpen} open={googleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect Google Drive</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4 rounded-md border p-3">
              <div>
                <p className="font-medium text-sm">Standard</p>
                <p className="text-muted-foreground text-xs">
                  You&apos;ll need to create new folders for filing
                </p>
              </div>
              <Button
                disabled={isConnectingGoogle}
                loading={isConnectingGoogle}
                onClick={() => {
                  setGoogleDialogOpen(false);
                  handleConnectGoogle("limited");
                }}
                size="sm"
              >
                Connect
              </Button>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-md border p-3">
              <div>
                <p className="font-medium text-sm">Full access</p>
                <p className="text-muted-foreground text-xs">
                  Use your existing folders
                </p>
                <p className="mt-1 text-amber-600 text-xs">
                  Google will show a warning — we&apos;re working on
                  verification
                </p>
              </div>
              <Button
                disabled={isConnectingGoogle}
                loading={isConnectingGoogle}
                onClick={() => {
                  setGoogleDialogOpen(false);
                  handleConnectGoogle("full");
                }}
                size="sm"
                variant="outline"
              >
                Connect
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
