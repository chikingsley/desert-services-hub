import type { EmailMessage } from "@email/types";

export interface LinkRequest {
  triggerEmail: EmailMessage;
  docusignSubject: string;
  docusignSender: string | null;
  originalRecipient: string | null;
}

export interface FoundLink {
  request: LinkRequest;
  email: EmailMessage;
  foundInMailbox: string;
  signingUrl: string;
  securityCode: string | null;
}

export interface ParsedArgs {
  hoursBack: number;
  pollIntervalMs: number;
  doPoll: boolean;
  intervalDisplay: string;
  sinceDate: Date;
}
