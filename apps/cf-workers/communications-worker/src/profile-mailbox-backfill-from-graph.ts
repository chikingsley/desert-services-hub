/* eslint-disable func-style */
import { graphGet } from "../../../../lib/graph/http";
import {
  DEFAULT_MAILBOX_EMAILS,
  buildMailboxProfilerScenario,
  createLocalProfilerDatabase,
  profileMailboxWriteAmplification,
} from "./lib/mailbox-write-profiler";

const DEFAULT_PAGE_SIZE = 1000;
const DEFAULT_SINCE_ISO = "2025-01-01T00:00:00.000Z";

interface GraphEmailAddress {
  address?: string;
}

interface GraphRecipient {
  emailAddress?: GraphEmailAddress;
}

interface GraphMessageSummary {
  ccRecipients?: GraphRecipient[];
  from?: { emailAddress?: GraphEmailAddress };
  hasAttachments?: boolean;
  id: string;
  receivedDateTime?: string;
  toRecipients?: GraphRecipient[];
}

interface GraphListResponse {
  "@odata.nextLink"?: string;
  value: GraphMessageSummary[];
}

interface MailboxGraphBackfillStats {
  mailboxEmail: string;
  messagesSinceCutoff: number;
  pagesFetched: number;
  totalCcRecipients: number;
  totalMessagesWithAttachments: number;
  totalToRecipients: number;
  uniqueSenderDomains: number;
  uniqueSenders: number;
}

interface ParsedArgs {
  help?: boolean;
  mailboxes: string[];
  maxPages?: number;
  pageSize: number;
  sinceIso: string;
}

function parseInteger(name: string, rawValue: string): number {
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`Expected positive integer for --${name}`);
  }
  return parsed;
}

function normalizeMailboxList(rawValue: string | undefined): string[] {
  const value = rawValue?.trim();
  if (!value) {
    return [...DEFAULT_MAILBOX_EMAILS];
  }
  return [
    ...new Set(
      value
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    mailboxes: [...DEFAULT_MAILBOX_EMAILS],
    pageSize: DEFAULT_PAGE_SIZE,
    sinceIso: DEFAULT_SINCE_ISO,
  };

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
      continue;
    }

    const [rawKey, ...rawValueParts] = arg.split("=");
    if (!rawKey?.startsWith("--")) {
      throw new Error(`Unexpected argument "${arg}"`);
    }
    const key = rawKey.slice(2);
    const rawValue = rawValueParts.length > 0 ? rawValueParts.join("=") : undefined;

    switch (key) {
      case "mailboxes": {
        parsed.mailboxes = normalizeMailboxList(rawValue);
        break;
      }
      case "max-pages": {
        if (!rawValue) {
          throw new Error("Missing value for --max-pages");
        }
        parsed.maxPages = parseInteger(key, rawValue);
        break;
      }
      case "page-size": {
        if (!rawValue) {
          throw new Error("Missing value for --page-size");
        }
        parsed.pageSize = parseInteger(key, rawValue);
        break;
      }
      case "since": {
        if (!rawValue) {
          throw new Error("Missing value for --since");
        }
        parsed.sinceIso = new Date(rawValue).toISOString();
        break;
      }
      default: {
        throw new Error(`Unknown argument "--${key}"`);
      }
    }
  }

  return parsed;
}

function usage(): string {
  return `Usage:
  bun run profile:mailbox-graph -- [options]

Options:
  --since=<iso-date>           Default: ${DEFAULT_SINCE_ISO}
  --mailboxes=<csv>            Default: ${DEFAULT_MAILBOX_EMAILS.join(",")}
  --page-size=<number>         Default: ${DEFAULT_PAGE_SIZE}
  --max-pages=<number>         Optional safety cap per mailbox
  --help

Examples:
  bun run profile:mailbox-graph -- --since=2025-01-01T00:00:00.000Z
  bun run profile:mailbox-graph -- --mailboxes=chi@desertservices.net,dawn@desertservices.net --max-pages=50
`;
}

function extractSender(address: GraphMessageSummary["from"]): string | null {
  const sender = address?.emailAddress?.address?.trim().toLowerCase();
  return sender && sender.length > 0 ? sender : null;
}

function senderDomain(sender: string | null): string | null {
  if (!sender?.includes("@")) {
    return null;
  }
  return sender.split("@")[1] ?? null;
}

async function fetchMailboxBackfillStats(
  mailboxEmail: string,
  sinceIso: string,
  pageSize: number,
  maxPages?: number,
): Promise<MailboxGraphBackfillStats> {
  const filter = encodeURIComponent(`receivedDateTime ge ${sinceIso}`);
  const select = encodeURIComponent(
    "id,receivedDateTime,hasAttachments,toRecipients,ccRecipients,from",
  );
  const userPath = encodeURIComponent(mailboxEmail);
  let nextUrl =
    `users/${userPath}/messages?$filter=${filter}` +
    `&$select=${select}` +
    `&$orderby=receivedDateTime desc` +
    `&$top=${pageSize}`;

  let pagesFetched = 0;
  let messagesSinceCutoff = 0;
  let totalMessagesWithAttachments = 0;
  let totalToRecipients = 0;
  let totalCcRecipients = 0;
  const uniqueSenders = new Set<string>();
  const uniqueSenderDomains = new Set<string>();

  while (nextUrl) {
    if (maxPages && pagesFetched >= maxPages) {
      break;
    }

    const response = await graphGet<GraphListResponse>(nextUrl);
    pagesFetched += 1;

    for (const message of response.value) {
      messagesSinceCutoff += 1;
      if (message.hasAttachments) {
        totalMessagesWithAttachments += 1;
      }
      totalToRecipients += message.toRecipients?.length ?? 0;
      totalCcRecipients += message.ccRecipients?.length ?? 0;

      const sender = extractSender(message.from);
      if (!sender) {
        continue;
      }
      uniqueSenders.add(sender);
      const domain = senderDomain(sender);
      if (domain) {
        uniqueSenderDomains.add(domain);
      }
    }

    nextUrl = response["@odata.nextLink"] ?? "";
  }

  return {
    mailboxEmail,
    messagesSinceCutoff,
    pagesFetched,
    totalCcRecipients,
    totalMessagesWithAttachments,
    totalToRecipients,
    uniqueSenderDomains: uniqueSenderDomains.size,
    uniqueSenders: uniqueSenders.size,
  };
}

const main = async (): Promise<void> => {
  let args: ParsedArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n\n${usage()}`);
    process.exitCode = 1;
    return;
  }

  if (args.help) {
    process.stdout.write(usage());
    return;
  }

  const mailboxStats: MailboxGraphBackfillStats[] = [];
  for (const mailboxEmail of args.mailboxes) {
    mailboxStats.push(
      await fetchMailboxBackfillStats(mailboxEmail, args.sinceIso, args.pageSize, args.maxPages),
    );
  }

  const totalMessages = mailboxStats.reduce((sum, stats) => sum + stats.messagesSinceCutoff, 0);
  const totalWithAttachments = mailboxStats.reduce(
    (sum, stats) => sum + stats.totalMessagesWithAttachments,
    0,
  );
  const totalToRecipients = mailboxStats.reduce((sum, stats) => sum + stats.totalToRecipients, 0);
  const totalCcRecipients = mailboxStats.reduce((sum, stats) => sum + stats.totalCcRecipients, 0);

  const localDb = await createLocalProfilerDatabase();
  try {
    const calibration = await profileMailboxWriteAmplification(
      localDb.db,
      buildMailboxProfilerScenario({
        attachmentsPerEmail: 1,
        ccRecipientsPerEmail: 1,
        emailsPerMailbox: 5,
        mailboxEmails: args.mailboxes,
        repeatBackfillPasses: 1,
        simulateAttachmentIntake: true,
        simulateBodyLinkScan: true,
        toRecipientsPerEmail: 2,
        uniqueSenderDomains: 120,
        uniqueSenders: 500,
      }),
    );

    const estimatedFreshWrites = totalMessages * calibration.summary.freshPassWritesPerEmail;
    const estimatedFreshReads = totalMessages * calibration.summary.freshPassReadsPerEmail;
    const estimatedRepeatWrites =
      totalMessages * (calibration.summary.repeatPassWritesPerEmail ?? 0);
    const estimatedRepeatReads = totalMessages * (calibration.summary.repeatPassReadsPerEmail ?? 0);

    process.stdout.write(
      `${JSON.stringify(
        {
          calibration: calibration.summary,
          estimatedD1Usage: {
            estimatedFreshReads,
            estimatedFreshWrites,
            estimatedRepeatReads,
            estimatedRepeatWrites,
          },
          mailboxStats,
          notes: [
            "Mailbox counts come from Microsoft Graph paging since the requested cutoff date.",
            "D1 usage is an estimate based on the local synthetic mailbox profiler, not a replay of real attachment/body-link distributions.",
            "If max-pages is set, mailbox counts may be partial.",
          ],
          sinceIso: args.sinceIso,
          totals: {
            averageCcRecipientsPerMessage:
              totalMessages > 0 ? totalCcRecipients / totalMessages : 0,
            averageToRecipientsPerMessage:
              totalMessages > 0 ? totalToRecipients / totalMessages : 0,
            mailboxCount: args.mailboxes.length,
            messageCount: totalMessages,
            messagesWithAttachments: totalWithAttachments,
          },
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await localDb.shutdown();
  }
};

await main();
