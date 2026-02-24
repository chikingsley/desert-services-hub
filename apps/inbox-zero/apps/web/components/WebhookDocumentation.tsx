"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { MutedText } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function WebhookDocumentationDialog({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Webhook Payload</DialogTitle>
        </DialogHeader>
        <WebhookPayloadDocumentation />
      </DialogContent>
    </Dialog>
  );
}

export function WebhookPayloadDocumentation() {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  const payloadExample = {
    email: {
      threadId: "thread_abc123",
      messageId: "message_xyz789",
      subject: "Important Contract Document",
      from: "client@company.com",
      cc: "team@company.com",
      bcc: "archive@company.com",
      headerMessageId: "<CAF=4sK9...@mail.gmail.com>",
    },
    executedRule: {
      id: "exec_rule_123",
      ruleId: "rule_456",
      reason: "Email matched rule: Archive contracts",
      automated: true,
      createdAt: "2024-01-15T10:30:00.000Z",
    },
  };

  const payloadJson = JSON.stringify(payloadExample, null, 2);

  return (
    <div className="space-y-4">
      <MutedText>
        When a rule with a webhook action is triggered, we'll send a POST
        request to your URL with the following payload:
      </MutedText>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-medium">Webhook Payload Structure</h4>
          <Button
            onClick={() => copyToClipboard(payloadJson)}
            size="sm"
            variant="ghost"
          >
            {copied ? (
              <Check className="h-4 w-4" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        </div>

        <pre className="overflow-x-auto rounded-md bg-muted p-4 text-sm">
          <code>{payloadJson}</code>
        </pre>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h5 className="mb-2 font-medium">Email Fields</h5>
            <div className="space-y-1">
              <MutedText>
                <code>threadId</code> - Gmail/Outlook thread ID
              </MutedText>
              <MutedText>
                <code>messageId</code> - Unique message ID
              </MutedText>
              <MutedText>
                <code>subject</code> - Email subject line
              </MutedText>
              <MutedText>
                <code>from</code> - Sender's email address
              </MutedText>
              <MutedText>
                <code>cc/bcc</code> - Optional CC/BCC recipients
              </MutedText>
              <MutedText>
                <code>headerMessageId</code> - Email Message-ID header
              </MutedText>
            </div>
          </div>

          <div>
            <h5 className="mb-2 font-medium">Rule Execution Fields</h5>
            <div className="space-y-1">
              <MutedText>
                <code>id</code> - Execution ID
              </MutedText>
              <MutedText>
                <code>ruleId</code> - Rule that was triggered
              </MutedText>
              <MutedText>
                <code>reason</code> - Why the rule was triggered
              </MutedText>
              <MutedText>
                <code>automated</code> - Whether rule ran automatically
              </MutedText>
              <MutedText>
                <code>createdAt</code> - When the rule was executed (ISO 8601)
              </MutedText>
            </div>
          </div>
        </div>

        <div className="rounded-md bg-blue-50 p-3 dark:bg-blue-950/30">
          <div className="text-blue-600 text-sm dark:text-blue-400">
            <strong>Authentication:</strong> Each request includes an{" "}
            <code>X-Webhook-Secret</code> header with your webhook secret for
            verification.
          </div>
        </div>
      </div>
    </div>
  );
}

export function WebhookDocumentationLink() {
  return (
    <WebhookDocumentationDialog>
      <Button
        className="h-auto p-0 text-blue-600 text-xs hover:text-blue-800"
        size="xs"
        variant="link"
      >
        View payload structure
      </Button>
    </WebhookDocumentationDialog>
  );
}
