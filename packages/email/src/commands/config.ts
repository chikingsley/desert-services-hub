/**
 * Email CLI shared configuration and client initialization.
 *
 * Constants, mailbox/group mappings, and singleton Graph clients.
 * Write-mailbox enforcement lives in GraphEmailClient — not here.
 */
import { GraphEmailClient, WRITABLE_MAILBOXES } from "@email/client";
import { GraphGroupsClient } from "@email/groups";

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_USER = "chi@desertservices.net";

export const KNOWN_MAILBOXES = {
  chi: "chi@desertservices.net",
  contracts: "contracts@desertservices.net",
  estimating: "estimating@desertservices.net",
  tim: "tim@desertservices.net",
} as const;

export type KnownMailboxName = keyof typeof KNOWN_MAILBOXES;

export const KNOWN_GROUPS = {
  accounting: "d52d73ed-1c23-4f7a-8b31-c762fea6798c",
  "all-company": "4355ce9c-990b-48ff-9d99-857f4aadd11d",
  "dust-control": "f1e9ccce-5259-47b0-8547-f2c04fc8d241",
  ic: "962f9440-9bde-4178-b538-edc7f8d3ecce",
  "internal-contracts": "962f9440-9bde-4178-b538-edc7f8d3ecce",
  sales: "1806c924-7489-41cd-ad43-f43d0b7cf92d",
} as const;

export type KnownGroupName = keyof typeof KNOWN_GROUPS;

export const TEMPLATE_TEST_DATA: Record<string, Record<string, string>> = {
  "dust-permit-issued": {
    accountName: "Caliente Construction",
    acreage: "1.2",
    actionStatus: "processed and approved",
    applicationNumber: "D0064940",
    expirationDate: "December 18, 2026",
    issueDate: "December 18, 2025",
    permitNumber: "F054321",
    permitStatus: "Active",
    projectName: "Kiwanis Playground",
    recipientName: "LeAnn",
    showPermitInfo: "true",
    siteAddress: "6111 S All-America Way, Tempe AZ 85283",
  },
  "dust-permit-submitted": {
    accountName: "Caliente Construction",
    acreage: "1.2",
    applicationNumber: "D0064940",
    projectName: "Kiwanis Playground",
    recipientName: "LeAnn",
    siteAddress: "6111 S All-America Way, Tempe AZ 85283",
  },
};

// ============================================================================
// Azure Config
// ============================================================================

const emailConfig = {
  azureClientId: process.env.AZURE_CLIENT_ID ?? "",
  azureClientSecret: process.env.AZURE_CLIENT_SECRET ?? "",
  azureTenantId: process.env.AZURE_TENANT_ID ?? "",
};

// ============================================================================
// Resolvers
// ============================================================================

export function resolveMailbox(mailboxOrName: string): string {
  const knownMailbox = KNOWN_MAILBOXES[mailboxOrName as KnownMailboxName];
  return knownMailbox ?? mailboxOrName;
}

export function resolveGroupId(groupIdOrName: string): string {
  const knownId = KNOWN_GROUPS[groupIdOrName as KnownGroupName];
  return knownId ?? groupIdOrName;
}

/**
 * Early CLI-level guard for folder/state operations (moveEmail, createFolder, etc.)
 * that are not guarded at the GraphEmailClient level.
 *
 * For outgoing email operations (createDraft, sendDraft, createReplyDraft),
 * GraphEmailClient enforces the allowlist itself — no need to call this.
 */
export function assertWritableMailbox(
  userId: string | undefined,
  operation: string
): void {
  if (!userId) {
    throw new Error(
      `Operation "${operation}" requires explicit --user. ` +
        `Allowed mailboxes: ${WRITABLE_MAILBOXES.join(", ")}`
    );
  }
  if (!(WRITABLE_MAILBOXES as readonly string[]).includes(userId.toLowerCase().trim())) {
    throw new Error(
      `Operation "${operation}" not allowed on mailbox "${userId}". ` +
        `Write operations are restricted to: ${WRITABLE_MAILBOXES.join(", ")}`
    );
  }
}

export function assertSendEnabled(operation: string): void {
  if (process.env.EMAIL_CLI_ENABLE_SEND === "1") {
    return;
  }
  throw new Error(
    `Operation "${operation}" is disabled by policy. ` +
      "Set EMAIL_CLI_ENABLE_SEND=1 to enable sending."
  );
}

// ============================================================================
// Singleton Clients
// ============================================================================

let appClient: GraphEmailClient | null = null;
let userClient: GraphEmailClient | null = null;
let groupsClient: GraphGroupsClient | null = null;

export function getAppClient(): GraphEmailClient {
  if (appClient) {
    return appClient;
  }
  appClient = new GraphEmailClient(emailConfig);
  appClient.initAppAuth();
  return appClient;
}

export async function getUserClient(): Promise<GraphEmailClient> {
  if (userClient) {
    return userClient;
  }
  userClient = new GraphEmailClient(emailConfig);
  await userClient.initUserAuth();
  return userClient;
}

export async function getUserClientForMailbox(
  userId: string
): Promise<GraphEmailClient> {
  if (userClient) {
    return userClient;
  }
  userClient = new GraphEmailClient(emailConfig);
  await userClient.initUserAuth(userId);
  return userClient;
}

export function getGroupsClient(): GraphGroupsClient {
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
