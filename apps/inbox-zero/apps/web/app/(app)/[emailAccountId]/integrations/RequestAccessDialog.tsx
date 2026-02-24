"use client";

import { Copy } from "lucide-react";
import { toastSuccess } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { env } from "@/env";

interface RequestAccessDialogProps {
  integrationName?: string;
  trigger?: React.ReactNode;
}

export function RequestAccessDialog({
  integrationName,
  trigger,
}: RequestAccessDialogProps) {
  const isGenericRequest = !integrationName;
  const title = isGenericRequest
    ? "Request an Integration"
    : `Request ${integrationName} Access`;
  const subject = isGenericRequest
    ? "Integration Request"
    : `Request Access: ${integrationName} Integration`;

  const messageBody = isGenericRequest
    ? "Hi,\n\nI would like to request a new integration for Inbox Zero.\n\nIntegration name:\n\nUse case:\n\nThank you!"
    : `Hi,\n\nI'm interested in using the ${integrationName} integration with Inbox Zero.\n\nCould you please let me know when this integration will be available?\n\nThank you!`;

  const handleCopyEmail = async () => {
    await navigator.clipboard.writeText(env.NEXT_PUBLIC_SUPPORT_EMAIL);
    toastSuccess({ description: "Email copied to clipboard" });
  };

  const handleCopyMessage = async () => {
    const message = `Subject: ${subject}\n\n${messageBody}`;
    await navigator.clipboard.writeText(message);
    toastSuccess({ description: "Message copied to clipboard" });
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        {trigger || (
          <Button size="sm" variant="outline">
            Request Access
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {isGenericRequest
              ? "Send us an email to request a new integration."
              : "Send us an email to request access to this integration."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <div className="font-medium text-sm">Email</div>
            <div className="mt-1 flex items-center gap-2">
              <code className="flex-1 rounded bg-muted px-3 py-2 text-sm">
                {env.NEXT_PUBLIC_SUPPORT_EMAIL}
              </code>
              <Button onClick={handleCopyEmail} size="sm" variant="outline">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div>
            <div className="font-medium text-sm">Message</div>
            <div className="mt-1 flex flex-col gap-2">
              <div className="rounded bg-muted px-3 py-2 text-sm">
                <div className="mb-2 font-medium">Subject: {subject}</div>
                <div className="whitespace-pre-wrap text-muted-foreground">
                  {messageBody}
                </div>
              </div>
              <Button
                className="self-end"
                onClick={handleCopyMessage}
                size="sm"
                variant="outline"
              >
                <Copy className="mr-2 h-4 w-4" />
                Copy Message
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
