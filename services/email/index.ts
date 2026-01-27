/**
 * Email Service - Utility Functions
 *
 * Import clients directly from their modules:
 *   import { GraphEmailClient } from './services/email/client';
 *   import { GraphGroupsClient } from './services/email/groups';
 *   import type { EmailConfig } from './services/email/types';
 *
 * This file provides utility functions for common operations.
 */
import { GraphEmailClient } from "./client";
import { GraphGroupsClient } from "./groups";
import type {
  EmailConfig,
  EmailMessage,
  EmailResult,
  MailboxResult,
  SendEmailOptions,
} from "./types";

// Re-export client classes and types
export { GraphEmailClient } from "./client";
export { GraphGroupsClient } from "./groups";
export type {
  EmailConfig,
  EmailMessage,
  EmailResult,
  MailboxResult,
  SendEmailOptions,
} from "./types";

// ============================================================================
// Constants
// ============================================================================

const MAX_SEARCH_PREVIEW = 5;
const MAX_LIST_PREVIEW = 10;
const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_DAYS_BACK = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ============================================================================
// Formatting Helpers
// ============================================================================

/**
 * Format multi-mailbox search results into readable text
 */
export function formatSearchResults(results: MailboxResult[]): string {
  const totalEmails = results.reduce((sum, r) => sum + r.emails.length, 0);

  if (totalEmails === 0) {
    return "No emails found matching your search.";
  }

  const lines: string[] = [
    `Found ${totalEmails} emails across ${results.length} mailboxes:\n`,
  ];

  for (const { mailbox, emails } of results) {
    if (emails.length === 0) {
      continue;
    }

    lines.push(`**${mailbox}** (${emails.length} results)`);
    for (const email of emails.slice(0, MAX_SEARCH_PREVIEW)) {
      const date = email.receivedDateTime
        ? new Date(email.receivedDateTime).toLocaleDateString()
        : "";
      const from = email.fromName || email.fromEmail || "Unknown";
      lines.push(`  - "${email.subject}" from ${from} (${date})`);
      if (email.preview) {
        lines.push(`    ${email.preview}`);
      }
      lines.push(`    ID: ${email.id}`);
    }
    if (emails.length > MAX_SEARCH_PREVIEW) {
      lines.push(`  ... and ${emails.length - MAX_SEARCH_PREVIEW} more`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Format single-mailbox email list into readable text
 */
export function formatEmailList(emails: EmailResult[]): string {
  if (emails.length === 0) {
    return "No emails found.";
  }

  const lines: string[] = [`Found ${emails.length} emails:\n`];

  for (const email of emails.slice(0, MAX_LIST_PREVIEW)) {
    const date = email.receivedDateTime
      ? new Date(email.receivedDateTime).toLocaleDateString()
      : "";
    const from = email.fromName || email.fromEmail || "Unknown";
    lines.push(`- "${email.subject}" from ${from} (${date})`);
    if (email.preview) {
      lines.push(`  ${email.preview}`);
    }
    lines.push(`  ID: ${email.id}`);
  }

  if (emails.length > MAX_LIST_PREVIEW) {
    lines.push(`\n... and ${emails.length - MAX_LIST_PREVIEW} more`);
  }

  return lines.join("\n");
}

/**
 * Convert EmailMessage to EmailResult (simplified format)
 */
export function toEmailResult(email: EmailMessage): EmailResult {
  return {
    id: email.id,
    subject: email.subject,
    fromName: email.fromName ?? undefined,
    fromEmail: email.fromEmail,
    receivedDateTime: email.receivedDateTime.toISOString(),
  };
}

/**
 * Convert mailbox search results to MailboxResult format
 */
export function toMailboxResults(
  results: Array<{ mailbox: string; emails: EmailMessage[] }>
): MailboxResult[] {
  return results.map(({ mailbox, emails }) => ({
    mailbox,
    emails: emails.map(toEmailResult),
  }));
}

/**
 * Load email config from environment variables
 */
export function getConfig(): EmailConfig {
  const azureTenantId = process.env.AZURE_TENANT_ID;
  const azureClientId = process.env.AZURE_CLIENT_ID;
  const azureClientSecret = process.env.AZURE_CLIENT_SECRET;

  if (!(azureTenantId && azureClientId && azureClientSecret)) {
    throw new Error(
      "Missing Azure credentials. Set AZURE_TENANT_ID, AZURE_CLIENT_ID, and AZURE_CLIENT_SECRET in .env"
    );
  }

  const batchSizeEnv = process.env.EMAIL_BATCH_SIZE;
  const daysBackEnv = process.env.EMAIL_DAYS_BACK;

  return {
    azureTenantId,
    azureClientId,
    azureClientSecret,
    batchSize: batchSizeEnv
      ? Number.parseInt(batchSizeEnv, 10)
      : DEFAULT_BATCH_SIZE,
    daysBack: daysBackEnv
      ? Number.parseInt(daysBackEnv, 10)
      : DEFAULT_DAYS_BACK,
  };
}

/**
 * Create an email client with config from environment
 */
export function createClient(config?: Partial<EmailConfig>): GraphEmailClient {
  const envConfig = getConfig();
  return new GraphEmailClient({ ...envConfig, ...config });
}

/**
 * Create a groups client with config from environment
 */
export function createGroupsClient(): GraphGroupsClient {
  const config = getConfig();
  return new GraphGroupsClient(
    config.azureTenantId,
    config.azureClientId,
    config.azureClientSecret
  );
}

/**
 * Test connection using app authentication
 */
export async function testAppConnection(mailbox: string): Promise<boolean> {
  try {
    const client = createClient();
    console.log("Testing Graph API connection...");
    const emails = await client.getEmails(mailbox, undefined, 1);
    console.log(
      `Connection successful! Found ${emails.length} recent email(s).`
    );

    const email = emails[0];
    if (email) {
      console.log(
        `Most recent email: "${email.subject}" from ${email.fromEmail}`
      );
    }

    return true;
  } catch (error) {
    console.error("Connection failed:", error);
    return false;
  }
}

/**
 * Test connection using user sign-in (device code flow)
 */
export async function testUserConnection(): Promise<boolean> {
  try {
    const client = createClient();
    await client.initUserAuth();

    const emails = await client.getEmails(undefined, undefined, 1);
    console.log(`Found ${emails.length} recent email(s) in your mailbox.`);

    const email = emails[0];
    if (email) {
      console.log(
        `Most recent email: "${email.subject}" from ${email.fromEmail}`
      );
    }

    return true;
  } catch (error) {
    console.error("Connection failed:", error);
    return false;
  }
}

/**
 * Fetch emails with user authentication
 */
export async function fetchUserEmails(options?: {
  daysBack?: number;
  maxEmails?: number;
}): Promise<EmailMessage[]> {
  const daysBack = options?.daysBack ?? DEFAULT_DAYS_BACK;
  const client = createClient({ daysBack });
  await client.initUserAuth();

  const since = new Date(Date.now() - daysBack * MS_PER_DAY);
  return client.getAllEmailsPaginated(undefined, since, options?.maxEmails);
}

/**
 * Send email with user authentication
 */
export async function sendUserEmail(
  options: Omit<SendEmailOptions, "userId">
): Promise<void> {
  const client = createClient();
  await client.initUserAuth();
  await client.sendEmail(options);
}

/**
 * List all users in the tenant (requires app auth)
 */
export function listUsers(): Promise<
  Array<{ id: string; email: string; displayName: string }>
> {
  const client = createClient();
  return client.listUsers();
}
