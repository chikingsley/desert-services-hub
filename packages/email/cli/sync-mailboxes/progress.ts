import type { GroupProgress, MailboxProgress } from "./types";

const ICONS = {
  complete: "\u2713",
  error: "\u2717",
  default: "\u2192",
} as const;

export function progressIcon(
  phase: MailboxProgress["phase"] | GroupProgress["phase"]
): string {
  if (phase === "complete") {
    return ICONS.complete;
  }
  if (phase === "error") {
    return ICONS.error;
  }
  return ICONS.default;
}

export function formatMailboxProgress(args: {
  mailbox: string;
  progress: MailboxProgress;
}): string | null {
  const icon = progressIcon(args.progress.phase);
  const p = args.progress;

  if (p.phase === "fetching") {
    return `${icon} [${args.mailbox}] Fetching emails...`;
  }

  if (p.phase === "storing" && p.emailsStored !== undefined) {
    const total = p.emailsFetched ?? p.emailsStored;
    return `${icon} [${args.mailbox}] Storing... ${p.emailsStored}/${total}`;
  }

  if (p.phase === "complete") {
    return `${icon} [${args.mailbox}] Done: ${p.emailsStored} emails, ${p.attachmentsStored} attachments`;
  }

  if (p.phase === "error") {
    return `${icon} [${args.mailbox}] Error: ${p.error}`;
  }

  return null;
}

export function formatGroupProgress(args: {
  group: string;
  progress: GroupProgress;
}): string | null {
  const icon = progressIcon(args.progress.phase);
  const p = args.progress;

  if (p.phase === "fetching") {
    return `${icon} [${args.group}] Fetching conversations...`;
  }

  if (p.phase === "storing" && p.postsStored !== undefined) {
    return `${icon} [${args.group}] Storing... ${p.postsStored} posts from ${p.conversationsFetched} conversations`;
  }

  if (p.phase === "complete") {
    return `${icon} [${args.group}] Done: ${p.postsStored} posts, ${p.attachmentsStored} attachments`;
  }

  if (p.phase === "error") {
    return `${icon} [${args.group}] Error: ${p.error}`;
  }

  return null;
}
