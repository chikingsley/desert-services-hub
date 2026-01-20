#!/usr/bin/env bun
/**
 * Desert Email CLI
 *
 * Command-line interface for email and M365 group operations.
 * All sent emails include your signature automatically (use --no-signature to skip).
 *
 * Usage:
 *   bun services/email/cli.ts <command> [options]
 *
 * Email Commands:
 *   search <query>                    Search emails in your mailbox
 *   search-all <query>                Search across all org mailboxes
 *   send                              Send an email
 *   reply <messageId>                 Reply to an email
 *   get <messageId>                   Get full email content
 *   thread <messageId>                Get email thread
 *   folders                           List mail folders
 *
 * Mailbox Shortcuts (emails):
 *   contracts [query]                 Search contracts@desertservices.net mailbox
 *   estimating [query]                Search estimating@desertservices.net mailbox
 *
 * M365 Group Commands (conversations):
 *   groups                            List all M365 groups
 *   ic [query]                        InternalContracts group shortcut
 *   group-conversations <name>        List conversations in a group
 *   search-group <name> <query>       Search group conversations
 *
 * Known Groups: ic, internal-contracts, dust-control, all-company, accounting, sales
 *
 * Examples:
 *   bun services/email/cli.ts contracts                    # List contracts mailbox
 *   bun services/email/cli.ts contracts "Layton"           # Search contracts mailbox
 *   bun services/email/cli.ts estimating "bid"             # Search estimating mailbox
 *   bun services/email/cli.ts ic                           # List InternalContracts group
 *   bun services/email/cli.ts ic "Helen"                   # Search InternalContracts group
 */
import { parseArgs } from "node:util";
import { GraphEmailClient } from "./client";
import { GraphGroupsClient } from "./groups";
import {
  getLogoAttachment,
  getTemplate,
  listTemplates,
} from "./templates/index";

// ============================================================================
// Configuration
// ============================================================================

/**
 * Default user email for commands that require a mailbox but none is specified.
 */
const DEFAULT_USER = "chi@desertservices.net";

/**
 * Azure AD configuration for Microsoft Graph API authentication.
 * Values are loaded from environment variables.
 */
const emailConfig = {
  azureTenantId: process.env.AZURE_TENANT_ID ?? "",
  azureClientId: process.env.AZURE_CLIENT_ID ?? "",
  azureClientSecret: process.env.AZURE_CLIENT_SECRET ?? "",
};

/**
 * Test data for email templates.
 * Each key corresponds to a template name, and the value contains
 * placeholder values for generating test emails.
 */
const TEMPLATE_TEST_DATA: Record<string, Record<string, string>> = {
  "dust-permit-issued": {
    recipientName: "LeAnn",
    accountName: "Caliente Construction",
    projectName: "Kiwanis Playground",
    actionStatus: "processed and approved",
    permitStatus: "Active",
    applicationNumber: "D0064940",
    permitNumber: "F054321",
    siteAddress: "6111 S All-America Way, Tempe AZ 85283",
    acreage: "1.2",
    issueDate: "December 18, 2025",
    expirationDate: "December 18, 2026",
    showPermitInfo: "true",
  },
  "dust-permit-submitted": {
    recipientName: "LeAnn",
    accountName: "Caliente Construction",
    projectName: "Kiwanis Playground",
    applicationNumber: "D0064940",
    siteAddress: "6111 S All-America Way, Tempe AZ 85283",
    acreage: "1.2",
  },
};

/**
 * Known shared mailbox addresses for convenience commands.
 * Maps short names to full email addresses for quick access.
 *
 * @example
 * // Access the contracts mailbox
 * const mailbox = KNOWN_MAILBOXES.contracts; // "contracts@desertservices.net"
 */
const KNOWN_MAILBOXES = {
  contracts: "contracts@desertservices.net",
  estimating: "estimating@desertservices.net",
  chi: "chi@desertservices.net",
  tim: "tim@desertservices.net",
} as const;

type KnownMailboxName = keyof typeof KNOWN_MAILBOXES;

/**
 * Resolves a mailbox identifier to a full email address.
 * Accepts either a known mailbox name (e.g., "contracts") or a raw email address.
 *
 * Note: Currently unused but retained for potential future use with dynamic mailbox resolution.
 *
 * @param mailboxOrName - A known mailbox name or full email address
 * @returns The resolved email address
 *
 * @example
 * _resolveMailbox("contracts");           // "contracts@desertservices.net"
 * _resolveMailbox("john@example.com");    // "john@example.com"
 */
function _resolveMailbox(mailboxOrName: string): string {
  const knownMailbox = KNOWN_MAILBOXES[mailboxOrName as KnownMailboxName];
  return knownMailbox ?? mailboxOrName;
}

/**
 * Known M365 Group IDs for convenience commands.
 * Maps short group names to their Azure AD group IDs.
 *
 * Note: Groups are different from mailboxes - they have conversations, not emails.
 * Use group commands (group-conversations, search-group) to access group content.
 *
 * @example
 * // Access the InternalContracts group ID
 * const groupId = KNOWN_GROUPS.ic; // "962f9440-9bde-4178-b538-edc7f8d3ecce"
 */
const KNOWN_GROUPS = {
  ic: "962f9440-9bde-4178-b538-edc7f8d3ecce", // InternalContracts
  "internal-contracts": "962f9440-9bde-4178-b538-edc7f8d3ecce",
  "dust-control": "f1e9ccce-5259-47b0-8547-f2c04fc8d241",
  "all-company": "4355ce9c-990b-48ff-9d99-857f4aadd11d",
  accounting: "d52d73ed-1c23-4f7a-8b31-c762fea6798c",
  sales: "1806c924-7489-41cd-ad43-f43d0b7cf92d",
} as const;

type KnownGroupName = keyof typeof KNOWN_GROUPS;

/**
 * Resolves a group identifier to an Azure AD group ID.
 * Accepts either a known group name (e.g., "ic") or a raw group ID (UUID).
 *
 * @param groupIdOrName - A known group name or raw Azure AD group ID
 * @returns The resolved Azure AD group ID (UUID)
 *
 * @example
 * resolveGroupId("ic");                                      // "962f9440-9bde-4178-b538-edc7f8d3ecce"
 * resolveGroupId("962f9440-9bde-4178-b538-edc7f8d3ecce");    // "962f9440-9bde-4178-b538-edc7f8d3ecce"
 */
function resolveGroupId(groupIdOrName: string): string {
  const knownId = KNOWN_GROUPS[groupIdOrName as KnownGroupName];
  return knownId ?? groupIdOrName;
}

// ============================================================================
// Client Initialization
// ============================================================================

let appClient: GraphEmailClient | null = null;
let userClient: GraphEmailClient | null = null;

/**
 * Gets or creates a singleton GraphEmailClient with app-only authentication.
 * Uses client credentials flow for org-wide access without user interaction.
 *
 * @returns The initialized GraphEmailClient instance
 *
 * @example
 * const client = getAppClient();
 * const emails = await client.searchEmails({ query: "invoice", userId: "user@domain.com" });
 */
function getAppClient(): GraphEmailClient {
  if (appClient) {
    return appClient;
  }
  appClient = new GraphEmailClient(emailConfig);
  appClient.initAppAuth();
  return appClient;
}

/**
 * Gets or creates a singleton GraphEmailClient with delegated user authentication.
 * Uses device code flow which requires user interaction on first auth.
 * Tokens are cached in data/.token-cache.json for subsequent runs.
 *
 * @returns Promise resolving to the initialized GraphEmailClient instance
 *
 * @example
 * const client = await getUserClient();
 * await client.sendEmail({ to: [{ email: "user@example.com" }], subject: "Hello", body: "Hi there" });
 */
async function getUserClient(): Promise<GraphEmailClient> {
  if (userClient) {
    return userClient;
  }
  userClient = new GraphEmailClient(emailConfig);
  await userClient.initUserAuth();
  return userClient;
}

let groupsClient: GraphGroupsClient | null = null;

/**
 * Gets or creates a singleton GraphGroupsClient for M365 group operations.
 * Groups contain conversations (threads/posts), not traditional emails.
 *
 * @returns The initialized GraphGroupsClient instance
 *
 * @example
 * const client = getGroupsClient();
 * const groups = await client.listGroups();
 */
function getGroupsClient(): GraphGroupsClient {
  if (groupsClient) {
    return groupsClient;
  }
  groupsClient = new GraphGroupsClient(
    emailConfig.azureTenantId,
    emailConfig.azureClientId,
    emailConfig.azureClientSecret
  );
  return groupsClient;
}

// ============================================================================
// Command Implementations
// ============================================================================

/**
 * Searches for emails in a specific mailbox and displays results.
 * Outputs date, subject, sender, and message ID for each match.
 *
 * @param query - Search query (searches subject and body)
 * @param userId - Email address of the mailbox to search
 * @param limit - Maximum number of results to return
 * @returns Promise that resolves when search results are displayed
 *
 * @example
 * // CLI: bun services/email/cli.ts search "invoice" --user contracts@desertservices.net
 * await searchCommand("invoice", "contracts@desertservices.net", 10);
 */
async function searchCommand(query: string, userId: string, limit: number) {
  const client = getAppClient();
  const emails = await client.searchEmails({ query, userId, limit });

  if (emails.length === 0) {
    console.log("No emails found.");
    return;
  }

  console.log(`Found ${emails.length} emails:\n`);
  for (const email of emails) {
    const date = new Date(email.receivedDateTime).toLocaleDateString();
    console.log(`[${date}] ${email.subject}`);
    console.log(`  From: ${email.fromEmail}`);
    console.log(`  ID: ${email.id}\n`);
  }
}

/**
 * Searches for emails across all mailboxes in the organization.
 * Requires app-only authentication with appropriate permissions.
 * Results are grouped by mailbox.
 *
 * @param query - Search query (searches subject and body)
 * @param limit - Maximum number of results per mailbox
 * @returns Promise that resolves when search results are displayed
 *
 * @example
 * // CLI: bun services/email/cli.ts search-all "DocuSign contract" --limit 5
 * await searchAllCommand("DocuSign contract", 5);
 */
async function searchAllCommand(query: string, limit: number) {
  const client = getAppClient();
  console.log("Searching all mailboxes (this may take a moment)...\n");
  const results = await client.searchAllMailboxes({ query, limit });

  const totalEmails = results.reduce((sum, r) => sum + r.emails.length, 0);
  if (totalEmails === 0) {
    console.log("No emails found.");
    return;
  }

  console.log(
    `Found ${totalEmails} emails across ${results.length} mailboxes:\n`
  );
  for (const result of results) {
    if (result.emails.length === 0) {
      continue;
    }
    console.log(`📬 ${result.mailbox} (${result.emails.length} emails)`);
    for (const email of result.emails) {
      console.log(`  - ${email.subject}`);
    }
    console.log();
  }
}

/**
 * Sends an email using delegated user authentication.
 * Automatically includes a signature unless skipSignature is true.
 *
 * @param options - Email sending options
 * @param options.to - Comma-separated list of recipient email addresses
 * @param options.cc - Optional comma-separated list of CC recipient email addresses
 * @param options.subject - Email subject line
 * @param options.body - Email body content (plain text)
 * @param options.skipSignature - If true, omits the automatic signature
 * @returns Promise that resolves when email is sent
 *
 * @example
 * // CLI: bun services/email/cli.ts send --to "user@example.com" --subject "Hello" --body "Hi there"
 * await sendCommand({ to: "user@example.com", subject: "Hello", body: "Hi there", skipSignature: false });
 */
async function sendCommand(options: {
  to: string;
  cc?: string;
  subject: string;
  body: string;
  skipSignature: boolean;
  attachmentPaths?: string;
}) {
  const client = await getUserClient();

  const toRecipients = options.to
    .split(",")
    .map((email) => ({ email: email.trim() }));
  const ccRecipients = options.cc
    ? options.cc.split(",").map((email) => ({ email: email.trim() }))
    : undefined;

  // Load file attachments if provided
  const attachments: Array<{
    name: string;
    contentType: string;
    contentBytes: string;
  }> = [];

  if (options.attachmentPaths) {
    const paths = options.attachmentPaths.split(",").map((p) => p.trim());
    for (const filePath of paths) {
      const file = Bun.file(filePath);
      if (!(await file.exists())) {
        console.error(`Attachment not found: ${filePath}`);
        process.exit(1);
      }
      const buffer = await file.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");
      const fileName = filePath.split("/").pop() ?? "attachment";
      attachments.push({
        name: fileName,
        contentType: file.type || "application/octet-stream",
        contentBytes: base64,
      });
      console.log(`  Attached: ${fileName}`);
    }
  }

  await client.sendEmail({
    to: toRecipients,
    cc: ccRecipients,
    subject: options.subject,
    body: options.body,
    skipSignature: options.skipSignature,
    attachments: attachments.length > 0 ? attachments : undefined,
  });

  const attInfo =
    attachments.length > 0 ? ` with ${attachments.length} attachment(s)` : "";
  console.log(`✓ Email sent to ${options.to}${attInfo}`);
}

/**
 * Replies to an existing email using delegated user authentication.
 * Supports both single reply and reply-all modes.
 *
 * @param options - Reply options
 * @param options.messageId - ID of the email to reply to
 * @param options.body - Reply body content (plain text)
 * @param options.userId - Email address of the mailbox containing the original email
 * @param options.replyAll - If true, replies to all recipients
 * @param options.skipSignature - If true, omits the automatic signature
 * @returns Promise that resolves when reply is sent
 *
 * @example
 * // CLI: bun services/email/cli.ts reply <messageId> --body "Thanks for the update"
 * await replyCommand({ messageId: "AAMk...", body: "Thanks", userId: "chi@desertservices.net", replyAll: false, skipSignature: false });
 */
async function replyCommand(options: {
  messageId: string;
  body: string;
  userId: string;
  replyAll: boolean;
  skipSignature: boolean;
}) {
  const client = await getUserClient();

  await client.replyToEmail({
    messageId: options.messageId,
    body: options.body,
    userId: options.userId,
    replyAll: options.replyAll,
    skipSignature: options.skipSignature,
  });

  const action = options.replyAll ? "Reply-all" : "Reply";
  console.log(`✓ ${action} sent successfully`);
}

/**
 * Retrieves and displays the full content of a single email.
 * Shows subject, sender, recipients, date, and full body content.
 *
 * @param messageId - ID of the email message to retrieve
 * @param userId - Email address of the mailbox containing the email
 * @returns Promise that resolves when email content is displayed
 *
 * @example
 * // CLI: bun services/email/cli.ts get <messageId> --user contracts@desertservices.net
 * await getCommand("AAMkAGI2...", "contracts@desertservices.net");
 */
async function getCommand(messageId: string, userId: string) {
  const client = getAppClient();
  const email = await client.getEmail(messageId, userId);

  if (email === null) {
    console.log("Email not found.");
    return;
  }

  console.log(`Subject: ${email.subject}`);
  console.log(`From: ${email.fromName} <${email.fromEmail}>`);
  console.log(`To: ${email.toRecipients.map((r) => r.email).join(", ")}`);
  if (email.ccRecipients.length > 0) {
    console.log(`Cc: ${email.ccRecipients.map((r) => r.email).join(", ")}`);
  }
  console.log(`Date: ${new Date(email.receivedDateTime).toLocaleString()}`);
  console.log("\n--- Body ---\n");
  console.log(email.bodyContent);
}

/**
 * Retrieves and displays all messages in an email thread.
 * Uses a message ID to find all related messages in the conversation.
 *
 * @param messageId - ID of any message in the thread
 * @param userId - Email address of the mailbox containing the thread
 * @returns Promise that resolves when thread messages are displayed
 *
 * @example
 * // CLI: bun services/email/cli.ts thread <messageId>
 * await threadCommand("AAMkAGI2...", "chi@desertservices.net");
 */
async function threadCommand(messageId: string, userId: string) {
  const client = getAppClient();
  const thread = await client.getThreadByMessageId(messageId, userId);

  if (thread.length === 0) {
    console.log("Thread not found.");
    return;
  }

  console.log(`Thread with ${thread.length} messages:\n`);
  for (const email of thread) {
    const date = new Date(email.receivedDateTime).toLocaleString();
    console.log(`[${date}] ${email.fromEmail}`);
    console.log(`  Subject: ${email.subject}`);
    console.log(`  ID: ${email.id}\n`);
  }
}

/**
 * Lists all mail folders in a mailbox.
 * Displays folder name and ID for each folder.
 *
 * @param userId - Email address of the mailbox to list folders for
 * @returns Promise that resolves when folders are displayed
 *
 * @example
 * // CLI: bun services/email/cli.ts folders --user contracts@desertservices.net
 * await foldersCommand("contracts@desertservices.net");
 */
async function foldersCommand(userId: string) {
  const client = getAppClient();
  const folders = await client.listFolders(userId);

  console.log(`Mail folders for ${userId}:\n`);
  for (const folder of folders) {
    console.log(`- ${folder.displayName}`);
    console.log(`  ID: ${folder.id}\n`);
  }
}

/**
 * Lists all available email templates.
 * Indicates which templates have test data available for preview.
 *
 * @returns Promise that resolves when template list is displayed
 *
 * @example
 * // CLI: bun services/email/cli.ts templates
 * await templatesCommand();
 */
async function templatesCommand() {
  const templates = await listTemplates();
  console.log("Available email templates:\n");
  for (const template of templates.sort()) {
    const hasTestData = template in TEMPLATE_TEST_DATA;
    console.log(`  ${template}${hasTestData ? " (has test data)" : ""}`);
  }
  console.log("\nUsage: bun services/email/cli.ts template <name>");
}

/**
 * Generates a test email from a template and sends it to the default user.
 * Only works for templates that have predefined test data.
 * Useful for previewing email templates before using them in production.
 *
 * @param templateName - Name of the email template to generate
 * @returns Promise that resolves when test email is sent
 *
 * @example
 * // CLI: bun services/email/cli.ts template dust-permit-issued
 * await templateCommand("dust-permit-issued");
 */
async function templateCommand(templateName: string) {
  const testData = TEMPLATE_TEST_DATA[templateName];
  if (!testData) {
    console.error(`No test data for template: ${templateName}`);
    console.log("\nTemplates with test data:");
    for (const name of Object.keys(TEMPLATE_TEST_DATA)) {
      console.log(`  - ${name}`);
    }
    return;
  }

  console.log(`Generating ${templateName} template...`);
  const html = await getTemplate(templateName, testData);
  const logo = await getLogoAttachment();

  const client = await getUserClient();
  const subject = `[TEST] ${templateName} - ${testData.projectName || "Test"}`;

  console.log(`Sending test email: "${subject}"`);
  console.log(`To: ${DEFAULT_USER}`);

  await client.sendEmail({
    to: [{ email: DEFAULT_USER }],
    subject,
    body: html,
    bodyType: "html",
    attachments: [logo],
    skipSignature: true, // Template already has signature
  });

  console.log("\n✓ Test email sent!");
}

/**
 * Sends an email using an HTML template with custom recipients and variables.
 * Templates are loaded from services/email/templates/*.hbs
 *
 * @param options - Options for sending the templated email
 * @param options.templateName - Name of the template file (without .hbs extension)
 * @param options.to - Comma-separated list of recipient email addresses
 * @param options.cc - Optional comma-separated list of CC recipients
 * @param options.subject - Email subject line
 * @param options.vars - JSON string of template variables
 * @param options.attachmentPaths - Optional comma-separated list of file paths to attach
 * @returns Promise that resolves when email is sent
 *
 * @example
 * // CLI: bun services/email/cli.ts send-template dust-permit-issued \
 * //   --to "leann@company.com" --subject "Dust Permit Issued - Project X" \
 * //   --vars '{"recipientName":"LeAnn","projectName":"Project X",...}'
 */
async function sendTemplateCommand(options: {
  templateName: string;
  to: string;
  cc?: string;
  subject: string;
  vars: string;
  attachmentPaths?: string;
}) {
  // Parse template variables from JSON
  let templateVars: Record<string, string | number>;
  try {
    templateVars = JSON.parse(options.vars);
  } catch {
    console.error("Error: Invalid JSON in --vars parameter");
    console.error(
      'Example: --vars \'{"recipientName":"John","projectName":"Test"}\''
    );
    process.exit(1);
  }

  console.log(`Loading template: ${options.templateName}`);
  const html = await getTemplate(options.templateName, templateVars);
  const logo = await getLogoAttachment();

  const toRecipients = options.to
    .split(",")
    .map((email) => ({ email: email.trim() }));
  const ccRecipients = options.cc
    ? options.cc.split(",").map((email) => ({ email: email.trim() }))
    : undefined;

  // Load any additional file attachments
  const attachments: Array<{
    name: string;
    contentType: string;
    contentBytes: string;
    contentId?: string;
    isInline?: boolean;
  }> = [logo];

  if (options.attachmentPaths) {
    const paths = options.attachmentPaths.split(",").map((p) => p.trim());
    for (const filePath of paths) {
      const file = Bun.file(filePath);
      if (!(await file.exists())) {
        console.error(`Attachment not found: ${filePath}`);
        process.exit(1);
      }
      const buffer = await file.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");
      const fileName = filePath.split("/").pop() ?? "attachment";
      attachments.push({
        name: fileName,
        contentType: file.type || "application/octet-stream",
        contentBytes: base64,
      });
      console.log(`  Attached: ${fileName}`);
    }
  }

  const client = await getUserClient();

  console.log(`Sending email: "${options.subject}"`);
  console.log(`To: ${options.to}`);
  if (options.cc) {
    console.log(`Cc: ${options.cc}`);
  }

  await client.sendEmail({
    to: toRecipients,
    cc: ccRecipients,
    subject: options.subject,
    body: html,
    bodyType: "html",
    attachments,
    skipSignature: true, // Template already has signature
  });

  console.log("\n✓ Email sent!");
}

// ============================================================================
// Group Command Implementations
// ============================================================================

/**
 * Lists all M365 groups in the organization.
 * Displays group name and ID for each group.
 *
 * @returns Promise that resolves when group list is displayed
 *
 * @example
 * // CLI: bun services/email/cli.ts groups
 * await groupsCommand();
 */
async function groupsCommand() {
  const client = getGroupsClient();
  const groups = await client.listGroups();

  if (groups.length === 0) {
    console.log("No groups found.");
    return;
  }

  console.log(`${groups.length} M365 groups:\n`);
  for (const group of groups) {
    console.log(`- ${group.displayName}`);
    console.log(`  ID: ${group.id}\n`);
  }
}

/**
 * Lists conversations in an M365 group.
 * Displays topic, last activity date, and conversation ID for each.
 *
 * @param groupId - Azure AD group ID (UUID)
 * @param limit - Maximum number of conversations to return
 * @param since - Optional date filter to only show conversations after this date
 * @returns Promise that resolves when conversations are displayed
 *
 * @example
 * // CLI: bun services/email/cli.ts group-conversations ic --limit 20
 * await groupConversationsCommand("962f9440-9bde-4178-b538-edc7f8d3ecce", 20);
 */
async function groupConversationsCommand(
  groupId: string,
  limit: number,
  since?: Date
) {
  const client = getGroupsClient();
  const conversations = await client.getGroupConversations(groupId, {
    top: limit,
    since,
  });

  if (conversations.length === 0) {
    console.log("No conversations found.");
    return;
  }

  console.log(`${conversations.length} conversations:\n`);
  for (const conv of conversations) {
    console.log(`- ${conv.topic}`);
    console.log(`  Last: ${conv.lastDeliveredDateTime}`);
    console.log(`  ID: ${conv.id}\n`);
  }
}

/**
 * Retrieves and displays the full content of a group conversation.
 * Shows all threads and posts with sender, date, and content.
 * Optionally includes attachment metadata.
 *
 * @param groupId - Azure AD group ID (UUID)
 * @param conversationId - ID of the conversation to retrieve
 * @param includeAttachments - If true, includes attachment metadata in output
 * @returns Promise that resolves when conversation is displayed
 *
 * @example
 * // CLI: bun services/email/cli.ts group-conversation ic <conversationId> --attachments
 * await groupConversationCommand("962f9440-...", "AAQkAGI2...", true);
 */
async function groupConversationCommand(
  groupId: string,
  conversationId: string,
  includeAttachments: boolean
) {
  const client = getGroupsClient();
  const conversation = await client.getFullConversation(
    groupId,
    conversationId,
    includeAttachments
  );

  console.log(`Topic: ${conversation.topic}`);
  console.log(`Last Updated: ${conversation.lastDeliveredDateTime}`);
  console.log(`Has Attachments: ${conversation.hasAttachments}`);
  console.log(`\n${"=".repeat(60)}\n`);

  for (const thread of conversation.threads) {
    console.log(`Thread: ${thread.topic || "(no topic)"}`);
    console.log("-".repeat(40));
    for (const post of thread.posts) {
      console.log(
        `From: ${post.from.name || post.from.address} (${post.receivedDateTime})`
      );
      console.log(post.bodyContent);
      if (post.attachments && post.attachments.length > 0) {
        console.log("\nAttachments:");
        for (const att of post.attachments) {
          console.log(
            `  - ${att.name} (${att.contentType}, ${att.size} bytes)`
          );
        }
      }
      console.log();
    }
  }
}

/**
 * Searches for conversations in an M365 group by topic.
 * Performs case-insensitive substring matching on conversation topics.
 *
 * @param groupId - Azure AD group ID (UUID)
 * @param query - Search query to match against conversation topics
 * @param limit - Maximum number of conversations to search through
 * @returns Promise that resolves when search results are displayed
 *
 * @example
 * // CLI: bun services/email/cli.ts search-group ic "Helen"
 * await searchGroupCommand("962f9440-9bde-4178-b538-edc7f8d3ecce", "Helen", 50);
 */
async function searchGroupCommand(
  groupId: string,
  query: string,
  limit: number
) {
  const client = getGroupsClient();
  const conversations = await client.getGroupConversations(groupId, {
    top: limit,
  });

  // Filter by topic (case-insensitive search)
  const queryLower = query.toLowerCase();
  const matches = conversations.filter((c) =>
    c.topic.toLowerCase().includes(queryLower)
  );

  if (matches.length === 0) {
    console.log(`No conversations found matching "${query}".`);
    return;
  }

  console.log(`${matches.length} conversations matching "${query}":\n`);
  for (const conv of matches) {
    console.log(`- ${conv.topic}`);
    console.log(`  Last: ${conv.lastDeliveredDateTime}`);
    console.log(`  ID: ${conv.id}\n`);
  }
}

// ============================================================================
// Command Handlers (parse args and call implementations)
// ============================================================================

type CommandHandler = (args: string[]) => Promise<void>;

const handlers: Record<string, CommandHandler> = {
  search: async (args) => {
    const { values, positionals } = parseArgs({
      args,
      options: {
        user: { type: "string", short: "u", default: DEFAULT_USER },
        limit: { type: "string", short: "l", default: "10" },
      },
      allowPositionals: true,
    });
    const query = positionals[0];
    if (!query) {
      console.error("Error: Query required. Usage: search <query>");
      process.exit(1);
    }
    await searchCommand(
      query,
      values.user as string,
      Number.parseInt(values.limit as string, 10)
    );
  },

  "search-all": async (args) => {
    const { values, positionals } = parseArgs({
      args,
      options: {
        limit: { type: "string", short: "l", default: "5" },
      },
      allowPositionals: true,
    });
    const query = positionals[0];
    if (!query) {
      console.error("Error: Query required. Usage: search-all <query>");
      process.exit(1);
    }
    await searchAllCommand(query, Number.parseInt(values.limit as string, 10));
  },

  send: async (args) => {
    const { values } = parseArgs({
      args,
      options: {
        to: { type: "string" },
        cc: { type: "string" },
        subject: { type: "string", short: "s" },
        body: { type: "string", short: "b" },
        attachments: { type: "string", short: "a" },
        "no-signature": { type: "boolean", default: false },
      },
    });
    if (!(values.to && values.subject && values.body)) {
      console.error("Error: --to, --subject, and --body are required");
      console.error(
        "Usage: send --to <email> --subject <text> --body <text> [--attachments <paths>]"
      );
      process.exit(1);
    }
    await sendCommand({
      to: values.to,
      cc: values.cc,
      subject: values.subject,
      body: values.body,
      skipSignature: values["no-signature"] ?? false,
      attachmentPaths: values.attachments,
    });
  },

  reply: async (args) => {
    const { values, positionals } = parseArgs({
      args,
      options: {
        body: { type: "string", short: "b" },
        user: { type: "string", short: "u", default: DEFAULT_USER },
        "reply-all": { type: "boolean", default: false },
        "no-signature": { type: "boolean", default: false },
      },
      allowPositionals: true,
    });
    const messageId = positionals[0];
    if (!(messageId && values.body)) {
      console.error("Error: messageId and --body are required");
      console.error("Usage: reply <messageId> --body <text>");
      process.exit(1);
    }
    await replyCommand({
      messageId,
      body: values.body,
      userId: values.user as string,
      replyAll: values["reply-all"] ?? false,
      skipSignature: values["no-signature"] ?? false,
    });
  },

  get: async (args) => {
    const { values, positionals } = parseArgs({
      args,
      options: {
        user: { type: "string", short: "u", default: DEFAULT_USER },
      },
      allowPositionals: true,
    });
    const messageId = positionals[0];
    if (!messageId) {
      console.error("Error: messageId required. Usage: get <messageId>");
      process.exit(1);
    }
    await getCommand(messageId, values.user as string);
  },

  thread: async (args) => {
    const { values, positionals } = parseArgs({
      args,
      options: {
        user: { type: "string", short: "u", default: DEFAULT_USER },
      },
      allowPositionals: true,
    });
    const messageId = positionals[0];
    if (!messageId) {
      console.error("Error: messageId required. Usage: thread <messageId>");
      process.exit(1);
    }
    await threadCommand(messageId, values.user as string);
  },

  folders: async (args) => {
    const { values } = parseArgs({
      args,
      options: {
        user: { type: "string", short: "u", default: DEFAULT_USER },
      },
    });
    await foldersCommand(values.user as string);
  },

  templates: async (_args) => {
    await templatesCommand();
  },

  template: async (args) => {
    const templateName = args[0];
    if (!templateName) {
      console.error("Error: Template name required. Usage: template <name>");
      console.error("Run 'templates' to see available templates.");
      process.exit(1);
    }
    await templateCommand(templateName);
  },

  "send-template": async (args) => {
    const { values, positionals } = parseArgs({
      args,
      options: {
        to: { type: "string" },
        cc: { type: "string" },
        subject: { type: "string", short: "s" },
        vars: { type: "string", short: "v" },
        attachments: { type: "string", short: "a" },
      },
      allowPositionals: true,
    });
    const templateName = positionals[0];
    if (!(templateName && values.to && values.subject && values.vars)) {
      console.error(
        "Error: Template name, --to, --subject, and --vars are required"
      );
      console.error(
        "Usage: send-template <template> --to <email> --subject <text> --vars <json>"
      );
      console.error(
        '\nExample: send-template dust-permit-issued --to "user@example.com" \\'
      );
      console.error('  --subject "Dust Permit Issued - Project X" \\');
      console.error(
        '  --vars \'{"recipientName":"John","projectName":"Project X",...}\''
      );
      console.error("\nRun 'templates' to see available templates.");
      process.exit(1);
    }
    await sendTemplateCommand({
      templateName,
      to: values.to,
      cc: values.cc,
      subject: values.subject,
      vars: values.vars,
      attachmentPaths: values.attachments,
    });
  },

  // M365 Group Commands
  groups: async (_args) => {
    await groupsCommand();
  },

  "group-conversations": async (args) => {
    const { values, positionals } = parseArgs({
      args,
      options: {
        limit: { type: "string", short: "l", default: "50" },
        since: { type: "string" },
      },
      allowPositionals: true,
    });
    const groupIdOrName = positionals[0];
    if (!groupIdOrName) {
      console.error(
        "Error: Group ID or name required. Usage: group-conversations <groupId|name>"
      );
      console.error(`Known groups: ${Object.keys(KNOWN_GROUPS).join(", ")}`);
      process.exit(1);
    }
    await groupConversationsCommand(
      resolveGroupId(groupIdOrName),
      Number.parseInt(values.limit as string, 10),
      values.since ? new Date(values.since) : undefined
    );
  },

  "group-conversation": async (args) => {
    const { values, positionals } = parseArgs({
      args,
      options: {
        attachments: { type: "boolean", default: false },
      },
      allowPositionals: true,
    });
    const groupIdOrName = positionals[0];
    const conversationId = positionals[1];
    if (!(groupIdOrName && conversationId)) {
      console.error(
        "Error: Group ID/name and Conversation ID required. Usage: group-conversation <groupId|name> <conversationId>"
      );
      process.exit(1);
    }
    await groupConversationCommand(
      resolveGroupId(groupIdOrName),
      conversationId,
      values.attachments ?? false
    );
  },

  "search-group": async (args) => {
    const { values, positionals } = parseArgs({
      args,
      options: {
        limit: { type: "string", short: "l", default: "50" },
      },
      allowPositionals: true,
    });
    const groupIdOrName = positionals[0];
    const query = positionals[1];
    if (!(groupIdOrName && query)) {
      console.error(
        "Error: Group ID/name and query required. Usage: search-group <groupId|name> <query>"
      );
      console.error(`Known groups: ${Object.keys(KNOWN_GROUPS).join(", ")}`);
      process.exit(1);
    }
    await searchGroupCommand(
      resolveGroupId(groupIdOrName),
      query,
      Number.parseInt(values.limit as string, 10)
    );
  },

  // Shortcuts
  ic: async (args) => {
    const { values, positionals } = parseArgs({
      args,
      options: {
        limit: { type: "string", short: "l", default: "20" },
      },
      allowPositionals: true,
    });
    const query = positionals[0];
    const limit = Number.parseInt(values.limit as string, 10);
    if (query) {
      await searchGroupCommand(
        KNOWN_GROUPS["internal-contracts"],
        query,
        limit
      );
    } else {
      await groupConversationsCommand(
        KNOWN_GROUPS["internal-contracts"],
        limit
      );
    }
  },

  "internal-contracts": async (args) => {
    const icHandler = handlers.ic;
    if (icHandler) {
      await icHandler(args);
    }
  },

  contracts: async (args) => {
    const { values, positionals } = parseArgs({
      args,
      options: {
        limit: { type: "string", short: "l", default: "20" },
      },
      allowPositionals: true,
    });
    const query = positionals[0] ?? "*";
    await searchCommand(
      query,
      KNOWN_MAILBOXES.contracts,
      Number.parseInt(values.limit as string, 10)
    );
  },

  estimating: async (args) => {
    const { values, positionals } = parseArgs({
      args,
      options: {
        limit: { type: "string", short: "l", default: "20" },
      },
      allowPositionals: true,
    });
    const query = positionals[0] ?? "*";
    await searchCommand(
      query,
      KNOWN_MAILBOXES.estimating,
      Number.parseInt(values.limit as string, 10)
    );
  },
};

// ============================================================================
// Help Text
// ============================================================================

function showHelp() {
  console.log(`
Desert Email CLI

Usage: bun services/email/cli.ts <command> [options]

Email Commands:
  search <query>              Search emails in your mailbox
  search-all <query>          Search across all org mailboxes
  send                        Send an email (supports attachments)
  send-template <name>        Send email using HTML template
  reply <messageId>           Reply to an email
  get <messageId>             Get full email content
  thread <messageId>          Get email thread
  folders                     List mail folders

Template Commands:
  templates                   List available email templates
  template <name>             Send test email from template (to self)
  send-template <name>        Send template to recipients

Mailbox Shortcuts (emails):
  contracts [query]           Search contracts@desertservices.net mailbox
  estimating [query]          Search estimating@desertservices.net mailbox

M365 Group Commands (conversations):
  groups                      List all M365 groups
  ic [query]                  InternalContracts group (list or search)
  group-conversations <name>  List conversations in a group
  group-conversation <name> <cid>  Get full conversation
  search-group <name> <query> Search group conversations

Known Groups: ic, internal-contracts, dust-control, all-company, accounting, sales
Known Mailboxes: contracts, estimating, chi, tim

Options:
  --user, -u <email>          Mailbox to search (default: ${DEFAULT_USER})
  --to <emails>               Recipients (comma-separated)
  --cc <emails>               CC recipients (comma-separated)
  --subject, -s <text>        Email subject
  --body, -b <text>           Email body
  --vars, -v <json>           Template variables as JSON
  --attachments, -a <paths>   File attachments (comma-separated paths)
  --limit, -l <number>        Max results (default: 10)
  --reply-all                 Reply to all recipients
  --no-signature              Skip auto-signature

Examples:
  bun services/email/cli.ts contracts                    # List contracts mailbox emails
  bun services/email/cli.ts contracts "Layton"           # Search contracts mailbox
  bun services/email/cli.ts estimating "bid"             # Search estimating mailbox
  bun services/email/cli.ts ic                           # List InternalContracts group
  bun services/email/cli.ts ic "Helen"                   # Search InternalContracts group
  bun services/email/cli.ts search-group dust-control "permit"

  # Send dust permit email using template:
  bun services/email/cli.ts send-template dust-permit-issued \\
    --to "contact@gc.com" --subject "Dust Permit Issued - Project X" \\
    --vars '{"recipientName":"John","projectName":"Project X",...}' \\
    --attachments "/path/to/permit.pdf"
`);
}

// ============================================================================
// Main
// ============================================================================

/**
 * Main entry point for the CLI.
 * Parses command-line arguments and dispatches to the appropriate command handler.
 * Displays help if no command is provided or if --help/-h is passed.
 *
 * @returns Promise that resolves when command execution completes
 *
 * @example
 * // Run from command line:
 * // bun services/email/cli.ts search "invoice" --user chi@desertservices.net
 * // bun services/email/cli.ts contracts "Layton"
 * // bun services/email/cli.ts ic "Helen"
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "--help" || command === "-h") {
    showHelp();
    return;
  }

  const handler = handlers[command];
  if (!handler) {
    console.error(`Unknown command: ${command}`);
    console.error("Run with --help for usage information.");
    process.exit(1);
  }

  try {
    await handler(args.slice(1));
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
