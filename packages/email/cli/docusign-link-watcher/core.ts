import { parseArgs } from "node:util";
import type { EmailMessage } from "@email/types";
import { createClient } from "./client";
import {
  CONTRACTS_MAILBOX,
  DEFAULT_HOURS_BACK,
  DEFAULT_POLL_INTERVAL_SEC,
  MAX_POLL_ATTEMPTS,
} from "./constants";
import { extractDocuSignContext } from "./parsers";
import { printSummary, reportFoundLink } from "./reporter";
import { findTriggerEmails, searchForNewLink } from "./search";
import type { FoundLink, LinkRequest, ParsedArgs } from "./types";

export function parseCliArgs(): ParsedArgs {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      hours: { type: "string", default: String(DEFAULT_HOURS_BACK) },
      interval: { type: "string", default: String(DEFAULT_POLL_INTERVAL_SEC) },
      poll: { type: "boolean", default: false },
    },
  });

  const hoursBack = Number.parseInt(values.hours as string, 10);
  const pollInterval = Number.parseInt(values.interval as string, 10);
  const safeHours = Number.isNaN(hoursBack) ? DEFAULT_HOURS_BACK : hoursBack;
  const safeInterval = Number.isNaN(pollInterval)
    ? DEFAULT_POLL_INTERVAL_SEC
    : pollInterval;

  return {
    doPoll: values.poll ?? false,
    hoursBack: safeHours,
    intervalDisplay: `${safeInterval}s`,
    pollIntervalMs: safeInterval * 1000,
    sinceDate: new Date(Date.now() - safeHours * 60 * 60 * 1000),
  };
}

function buildRequestsFromTriggers(
  triggerEmails: EmailMessageLike[]
): LinkRequest[] {
  return triggerEmails.map((triggerEmail) => {
    const request = extractDocuSignContext(triggerEmail);
    console.log(`- ${request.docusignSubject}`);
    console.log(
      `  Requested at: ${new Date(triggerEmail.receivedDateTime).toLocaleString()}`
    );
    if (request.docusignSender) {
      console.log(`  DocuSign from: ${request.docusignSender}`);
    }
    return request;
  });
}

type EmailMessageLike = EmailMessage;

async function findInitialMatches(
  client: ReturnType<typeof createClient>,
  requests: LinkRequest[],
  sinceDate: Date
): Promise<{ found: FoundLink[]; pending: LinkRequest[] }> {
  const found: FoundLink[] = [];
  const pending: LinkRequest[] = [];

  for (const request of requests) {
    console.log(`Searching for new link: "${request.docusignSubject}"...`);
    const foundLink = await searchForNewLink(client, request, sinceDate);
    if (foundLink) {
      found.push(foundLink);
      reportFoundLink(foundLink);
    } else {
      pending.push(request);
      console.log("  Not found yet.\n");
    }
  }

  return { found, pending };
}

async function pollPendingRequests(
  client: ReturnType<typeof createClient>,
  pending: LinkRequest[],
  sinceDate: Date,
  pollIntervalMs: number
): Promise<{ found: FoundLink[]; pending: LinkRequest[] }> {
  let remaining = [...pending];
  const found: FoundLink[] = [];
  let attempts = 0;

  while (remaining.length > 0 && attempts < MAX_POLL_ATTEMPTS) {
    attempts += 1;
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

    console.log(
      `\n[Poll ${attempts}] Checking ${remaining.length} pending request(s)...`
    );

    const nextPending: LinkRequest[] = [];
    for (const request of remaining) {
      const foundLink = await searchForNewLink(client, request, sinceDate);
      if (foundLink) {
        found.push(foundLink);
        reportFoundLink(foundLink);
      } else {
        nextPending.push(request);
      }
    }
    remaining = nextPending;
  }

  if (remaining.length > 0) {
    console.log(
      `\nTimed out waiting for ${remaining.length} link(s). Run again later.`
    );
  }

  return { found, pending: remaining };
}

async function runOnce(args: ParsedArgs): Promise<void> {
  console.log("DocuSign Link Watcher");
  console.log(
    `Looking back ${args.hoursBack} hours (since ${args.sinceDate.toLocaleString()})`
  );
  console.log(
    `Mode: ${args.doPoll ? `polling every ${args.intervalDisplay}` : "single check"}\n`
  );

  const client = createClient();
  console.log(
    `Scanning ${CONTRACTS_MAILBOX} for "requested new link" emails...`
  );
  const triggerEmails = await findTriggerEmails(client, args.sinceDate);

  if (triggerEmails.length === 0) {
    console.log("No 'requested new link' emails found.");
    return;
  }

  console.log(`Found ${triggerEmails.length} link request(s):\n`);
  const requests = buildRequestsFromTriggers(triggerEmails);

  const initial = await findInitialMatches(client, requests, args.sinceDate);
  const found = [...initial.found];
  let pending = [...initial.pending];

  if (args.doPoll && pending.length > 0) {
    console.log(
      `\nPolling for ${pending.length} pending request(s) every ${args.intervalDisplay}...`
    );
    const polled = await pollPendingRequests(
      client,
      pending,
      args.sinceDate,
      args.pollIntervalMs
    );
    found.push(...polled.found);
    pending = polled.pending;
  }

  printSummary(found, pending);
  return;
}

export async function runWatcher(args: ParsedArgs): Promise<void> {
  await runOnce(args);
}
