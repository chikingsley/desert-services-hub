/**
 * Email CLI shared configuration and client initialization.
 *
 * Constants, mailbox/group mappings, and singleton Graph clients.
 */
import { GraphEmailClient } from "@email/client";
import { GraphGroupsClient } from "@email/groups";

// ============================================================================
// Constants
// ============================================================================

export const DEFAULT_USER = "chi@desertservices.net";

export const WRITABLE_MAILBOXES = [
  "chi@desertservices.net",
  "contracts@desertservices.net",
  "dustpermits@desertservices.net",
] as const;

export const KNOWN_MAILBOXES = {
  contracts: "contracts@desertservices.net",
  estimating: "estimating@desertservices.net",
  chi: "chi@desertservices.net",
  tim: "tim@desertservices.net",
} as const;

export type KnownMailboxName = keyof typeof KNOWN_MAILBOXES;

export const KNOWN_GROUPS = {
  ic: "962f9440-9bde-4178-b538-edc7f8d3ecce",
  "internal-contracts": "962f9440-9bde-4178-b538-edc7f8d3ecce",
  "dust-control": "f1e9ccce-5259-47b0-8547-f2c04fc8d241",
  "all-company": "4355ce9c-990b-48ff-9d99-857f4aadd11d",
  accounting: "d52d73ed-1c23-4f7a-8b31-c762fea6798c",
  sales: "1806c924-7489-41cd-ad43-f43d0b7cf92d",
} as const;

export type KnownGroupName = keyof typeof KNOWN_GROUPS;

export const TEMPLATE_TEST_DATA: Record<string, Record<string, string>> = {
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

// ============================================================================
// Azure Config
// ============================================================================

const emailConfig = {
  azureTenantId: process.env.AZURE_TENANT_ID ?? "",
  azureClientId: process.env.AZURE_CLIENT_ID ?? "",
  azureClientSecret: process.env.AZURE_CLIENT_SECRET ?? "",
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

export function assertWritableMailbox(
  userId: string | undefined,
  operation: string
): void {
  if (!userId) {
    throw new Error(`Operation "${operation}" requires a mailbox (--user)`);
  }
  const normalized = userId.toLowerCase().trim();
  if (
    !WRITABLE_MAILBOXES.includes(
      normalized as (typeof WRITABLE_MAILBOXES)[number]
    )
  ) {
    throw new Error(
      `Operation "${operation}" not allowed on mailbox "${userId}". ` +
        `Write operations are restricted to: ${WRITABLE_MAILBOXES.join(", ")}`
    );
  }
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
