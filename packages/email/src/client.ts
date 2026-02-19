import type { TokenCredential } from "@azure/identity";
import { ClientSecretCredential } from "@azure/identity";
import type { AuthenticationResult, DeviceCodeRequest } from "@azure/msal-node";
import { PublicClientApplication } from "@azure/msal-node";

/**
 * The only mailboxes permitted for write operations (createDraft, sendDraft, send, reply, forward).
 * Enforced at the client level so no caller can bypass it regardless of code path.
 */
export const WRITABLE_MAILBOXES = [
  "chi@desertservices.net",
  "contracts@desertservices.net",
  "dustpermits@desertservices.net",
] as const;
export type WritableMailbox = (typeof WRITABLE_MAILBOXES)[number];
// Operation modules
import {
  downloadAllAttachments,
  downloadAttachment,
  getAttachments,
  getTrackedAttachments,
  safeDownloadAllAttachments,
  safeDownloadAttachment,
} from "@email/operations/attachments";
import {
  getAllEmailsPaginated,
  getEmailBodiesBatch,
  getEmails,
  streamEmailsPaginated,
} from "@email/operations/fetch";
import {
  createFolder,
  deleteFolder,
  getFolderById,
  listFolders,
  listFoldersRecursive,
  moveFolder,
  renameFolder,
} from "@email/operations/folders";
import {
  CONTRACTS_MAILBOX,
  ESTIMATING_MAILBOXES,
  filterContractsMailbox,
  getActiveMailboxes,
  listUsers,
  searchAllMailboxes,
  searchContractsMailbox,
  searchEstimatingMailboxes,
  searchMailboxes,
} from "@email/operations/org";
import {
  filterEmails,
  filterMyEmails,
  getEmail,
  getMyEmail,
  getMyEmails,
  getMyFolders,
  searchEmails,
  searchMyEmails,
} from "@email/operations/search";
import {
  createDraft,
  createReplyDraft,
  forwardEmail,
  replyToEmail,
  sendDraft,
  sendEmail,
} from "@email/operations/send";
import {
  archiveEmail,
  deleteEmail,
  flagEmail,
  getMasterCategories,
  getMessageStatus,
  markAsRead,
  markAsUnread,
  moveEmail,
  setCategoryOnEmail,
} from "@email/operations/state";
import {
  createSubscription,
  deleteSubscription,
  renewSubscription,
} from "@email/operations/subscriptions";
import {
  getEmailThread,
  getThreadByMessageId,
  translateMessageIdsToImmutable,
} from "@email/operations/threads";
import { RateLimiter } from "@email/rate-limiter";
import { fileCachePlugin } from "@email/token-cache";
import type {
  EmailConfig,
  EmailMessage,
  EmailSearchOptions,
  GraphClientContext,
  SendEmailOptions,
  TrackedEmailAttachment,
} from "@email/types";
import { Client } from "@microsoft/microsoft-graph-client";
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials";

// Re-export types that were previously defined here
export type { AuthMode, MailFolderWithChildren } from "@email/types";

const GRAPH_SCOPES = ["Mail.Read", "Mail.ReadWrite", "Mail.Send", "User.Read"];
const IMMUTABLE_ID_PREFERENCE = 'IdType="ImmutableId"';

/**
 * Microsoft Graph API client for email operations.
 * Thin facade that delegates to focused operation modules in `./operations/`.
 * Implements GraphClientContext so operation functions can access the
 * authenticated client without depending on this class.
 */
export class GraphEmailClient implements GraphClientContext {
  private client: Client | null = null;
  config: EmailConfig;
  authMode: "app" | "user" = "app";
  private credential: TokenCredential | null = null;
  private msalClient: PublicClientApplication | null = null;
  private userAuthAccountUsername: string | null = null;
  private activeMailboxCache: string[] | null = null;
  rateLimiter = new RateLimiter();

  /** Contracts mailbox address for the organization. */
  static readonly CONTRACTS_MAILBOX = CONTRACTS_MAILBOX;

  /** Estimating team mailboxes in priority order. */
  static readonly ESTIMATING_MAILBOXES = ESTIMATING_MAILBOXES;

  constructor(config: EmailConfig) {
    this.config = config;
  }

  // ===========================================================================
  // Authentication
  // ===========================================================================

  /** Initialize with app-only authentication (requires Application permissions). */
  initAppAuth(): void {
    this.credential = new ClientSecretCredential(
      this.config.azureTenantId,
      this.config.azureClientId,
      this.config.azureClientSecret
    );
    this.authMode = "app";
    this.client = null;
  }

  /** Initialize and return MSAL client with file-based token cache. */
  getMsalClient(): Promise<PublicClientApplication> {
    if (!this.msalClient) {
      this.msalClient = new PublicClientApplication({
        auth: {
          authority: `https://login.microsoftonline.com/${this.config.azureTenantId}`,
          clientId: this.config.azureClientId,
        },
        cache: {
          cachePlugin: fileCachePlugin,
        },
      });
    }
    return Promise.resolve(this.msalClient);
  }

  /** Wrap Graph client so every request asks for immutable Outlook IDs. */
  private withImmutableIdPreference(graphClient: Client): Client {
    const baseApi = graphClient.api.bind(graphClient);
    const patched = graphClient as unknown as {
      api: (path: string) => unknown;
    };
    patched.api = (path: string) =>
      (
        baseApi(path) as { header: (key: string, value: string) => unknown }
      ).header("Prefer", IMMUTABLE_ID_PREFERENCE);
    return graphClient;
  }

  /** Initialize with user authentication via Device Code flow. */
  async initUserAuth(preferredUsername?: string): Promise<void> {
    const msalClient = await this.getMsalClient();
    this.authMode = "user";
    this.client = null;

    const accounts = await msalClient.getTokenCache().getAllAccounts();
    let authResult: AuthenticationResult | null = null;

    if (accounts.length > 0) {
      try {
        const targetUsername = preferredUsername?.toLowerCase().trim();
        const account =
          accounts.find((a) => a.username.toLowerCase() === targetUsername) ??
          accounts[0];
        if (!account) {
          throw new Error("Account not found");
        }
        authResult = await msalClient.acquireTokenSilent({
          account,
          scopes: GRAPH_SCOPES,
        });
        this.userAuthAccountUsername = account.username;
        console.log(`Using cached credentials for: ${account.username}\n`);
      } catch {
        console.log("Cached token expired, need to sign in again...\n");
      }
    }

    if (!authResult) {
      const deviceCodeRequest: DeviceCodeRequest = {
        deviceCodeCallback: (response) => {
          console.log("\n=== Microsoft Sign-In ===\n");
          console.log("To sign in, open a browser and go to:");
          console.log(`  ${response.verificationUri}`);
          console.log(`\nEnter this code: ${response.userCode}\n`);
          console.log("Waiting for sign-in...");
        },
        scopes: GRAPH_SCOPES,
      };

      authResult = await msalClient.acquireTokenByDeviceCode(deviceCodeRequest);

      if (authResult?.account) {
        this.userAuthAccountUsername = authResult.account.username;
        console.log(
          `\nSigned in as: ${authResult.account.name} <${authResult.account.username}>\n`
        );
      }
    }

    const authProvider = {
      getAccessToken: async (): Promise<string> => {
        const client = await this.getMsalClient();
        const cachedAccounts = await client.getTokenCache().getAllAccounts();
        if (cachedAccounts.length === 0) {
          throw new Error("No cached accounts found");
        }
        const targetUsername = this.userAuthAccountUsername?.toLowerCase();
        const account =
          cachedAccounts.find(
            (a) => a.username.toLowerCase() === targetUsername
          ) ?? cachedAccounts[0];
        if (!account) {
          throw new Error("No account found");
        }
        const result = await client.acquireTokenSilent({
          account,
          scopes: GRAPH_SCOPES,
        });
        if (!result?.accessToken) {
          throw new Error("Failed to acquire token");
        }
        return result.accessToken;
      },
    };

    this.client = this.withImmutableIdPreference(
      Client.initWithMiddleware({ authProvider })
    );
  }

  // ===========================================================================
  // GraphClientContext implementation
  // ===========================================================================

  /** Get the initialized Microsoft Graph Client instance. */
  getClient(): Client {
    if (!this.client) {
      if (!this.credential) {
        this.initAppAuth();
      }
      const scopes =
        this.authMode === "user"
          ? GRAPH_SCOPES
          : ["https://graph.microsoft.com/.default"];
      const authProvider = new TokenCredentialAuthenticationProvider(
        this.credential as TokenCredential,
        { scopes }
      );
      this.client = this.withImmutableIdPreference(
        Client.initWithMiddleware({ authProvider })
      );
    }
    return this.client;
  }

  /**
   * Enforce the writable mailbox allowlist for app-auth write operations.
   * Called by every write method that accepts a userId.
   * User-auth write ops (sendEmail, replyToEmail, forwardEmail) are safe by
   * construction — they require an interactive device-code login.
   */
  private assertWritableUserId(userId: string, operation: string): void {
    const normalized = userId.toLowerCase().trim();
    if (!(WRITABLE_MAILBOXES as readonly string[]).includes(normalized)) {
      throw new Error(
        `[GraphEmailClient] "${operation}" blocked: mailbox "${userId}" is not in the write allowlist. ` +
          `Allowed: ${WRITABLE_MAILBOXES.join(", ")}`
      );
    }
  }

  /** Get the base API path (/me or /users/{userId}) based on auth mode. */
  getBasePath(userId?: string): string {
    if (this.authMode === "user") {
      return "/me";
    }
    if (!userId) {
      throw new Error("userId required for app authentication");
    }
    return `/users/${userId}`;
  }

  /** Get the API path for messages based on auth mode. */
  getMessagesPath(userId?: string): string {
    return `${this.getBasePath(userId)}/messages`;
  }

  // Fetch
  getEmails(userId?: string, since?: Date, limit?: number) {
    return getEmails(this, userId, since, limit);
  }
  streamEmailsPaginated(options: Parameters<typeof streamEmailsPaginated>[1]) {
    return streamEmailsPaginated(this, options);
  }
  getAllEmailsPaginated(
    userId?: string,
    since?: Date,
    maxEmails?: number,
    options?: { includeBody?: boolean; before?: Date }
  ) {
    return getAllEmailsPaginated(this, userId, since, maxEmails, options);
  }
  getEmailBodiesBatch(emailIds: string[], userId?: string) {
    return getEmailBodiesBatch(this, emailIds, userId);
  }

  // Search
  searchEmails(options: EmailSearchOptions): Promise<EmailMessage[]> {
    return searchEmails(this, options);
  }
  filterEmails(options: Parameters<typeof filterEmails>[1]) {
    return filterEmails(this, options);
  }
  getEmail(messageId: string, userId?: string) {
    return getEmail(this, messageId, userId);
  }
  getMyEmails(options?: Parameters<typeof getMyEmails>[1]) {
    return getMyEmails(this, options);
  }
  searchMyEmails(options: Parameters<typeof searchMyEmails>[1]) {
    return searchMyEmails(this, options);
  }
  filterMyEmails(options: Parameters<typeof filterMyEmails>[1]) {
    return filterMyEmails(this, options);
  }
  getMyEmail(messageId: string) {
    return getMyEmail(this, messageId);
  }
  getMyFolders() {
    return getMyFolders(this);
  }

  // Threads
  translateMessageIdsToImmutable(messageIds: string[], userId?: string) {
    return translateMessageIdsToImmutable(this, messageIds, userId);
  }
  getEmailThread(conversationId: string, userId?: string) {
    return getEmailThread(this, conversationId, userId);
  }
  getThreadByMessageId(messageId: string, userId?: string) {
    return getThreadByMessageId(this, messageId, userId);
  }

  // Attachments
  getAttachments(messageId: string, userId?: string) {
    return getAttachments(this, messageId, userId);
  }
  downloadAttachment(messageId: string, attachmentId: string, userId?: string) {
    return downloadAttachment(this, messageId, attachmentId, userId);
  }
  downloadAllAttachments(messageId: string, userId?: string) {
    return downloadAllAttachments(this, messageId, userId);
  }
  getTrackedAttachments(
    messageId: string,
    userId: string
  ): Promise<TrackedEmailAttachment[]> {
    return getTrackedAttachments(this, messageId, userId);
  }
  safeDownloadAttachment(attachment: TrackedEmailAttachment) {
    return safeDownloadAttachment(this, attachment);
  }
  safeDownloadAllAttachments(messageId: string, userId: string) {
    return safeDownloadAllAttachments(this, messageId, userId);
  }

  // Send
  sendEmail(options: SendEmailOptions) {
    return sendEmail(this, options);
  }
  replyToEmail(options: Parameters<typeof replyToEmail>[1]) {
    return replyToEmail(this, options);
  }
  createDraft(options: Parameters<typeof createDraft>[1]) {
    if (options.userId) this.assertWritableUserId(options.userId, "createDraft");
    return createDraft(this, options);
  }
  sendDraft(draftId: string, userId?: string) {
    if (userId) this.assertWritableUserId(userId, "sendDraft");
    return sendDraft(this, draftId, userId);
  }
  createReplyDraft(options: Parameters<typeof createReplyDraft>[1]) {
    this.assertWritableUserId(options.userId, "createReplyDraft");
    return createReplyDraft(this, options);
  }
  forwardEmail(
    messageId: string,
    to: { email: string; name?: string }[],
    comment?: string
  ) {
    return forwardEmail(this, messageId, to, comment);
  }

  // State (read/unread, archive, move, delete, flag, categories)
  archiveEmail(messageId: string, userId?: string) {
    return archiveEmail(this, messageId, userId);
  }
  moveEmail(messageId: string, destinationFolderId: string, userId?: string) {
    return moveEmail(this, messageId, destinationFolderId, userId);
  }
  deleteEmail(messageId: string, userId?: string) {
    return deleteEmail(this, messageId, userId);
  }
  markAsRead(messageId: string, userId?: string) {
    return markAsRead(this, messageId, userId);
  }
  markAsUnread(messageId: string, userId?: string) {
    return markAsUnread(this, messageId, userId);
  }
  flagEmail(
    messageId: string,
    flagStatus: "flagged" | "complete" | "notFlagged",
    userId?: string
  ) {
    return flagEmail(this, messageId, flagStatus, userId);
  }
  setCategoryOnEmail(messageId: string, categories: string[], userId?: string) {
    return setCategoryOnEmail(this, messageId, categories, userId);
  }
  getMasterCategories(userId?: string) {
    return getMasterCategories(this, userId);
  }
  getMessageStatus(messageId: string, userId?: string) {
    return getMessageStatus(this, messageId, userId);
  }

  // Folders
  listFolders(userId?: string) {
    return listFolders(this, userId);
  }
  getFolderById(folderId: string, userId?: string) {
    return getFolderById(this, folderId, userId);
  }
  listFoldersRecursive(userId?: string, maxDepth?: number) {
    return listFoldersRecursive(this, userId, maxDepth);
  }
  createFolder(displayName: string, userId?: string, parentFolderId?: string) {
    return createFolder(this, displayName, userId, parentFolderId);
  }
  deleteFolder(folderId: string, userId?: string) {
    return deleteFolder(this, folderId, userId);
  }
  renameFolder(folderId: string, newName: string, userId?: string) {
    return renameFolder(this, folderId, newName, userId);
  }
  moveFolder(folderId: string, destinationFolderId: string, userId?: string) {
    return moveFolder(this, folderId, destinationFolderId, userId);
  }

  // Subscriptions
  createSubscription(request: Parameters<typeof createSubscription>[1]) {
    return createSubscription(this, request);
  }
  renewSubscription(subscriptionId: string, expirationDateTime: string) {
    return renewSubscription(this, subscriptionId, expirationDateTime);
  }
  deleteSubscription(subscriptionId: string) {
    return deleteSubscription(this, subscriptionId);
  }

  // Org / multi-mailbox
  listUsers() {
    return listUsers(this);
  }
  getActiveMailboxes(): Promise<string[]> {
    if (this.activeMailboxCache) {
      return Promise.resolve(this.activeMailboxCache);
    }
    return getActiveMailboxes(this).then((m) => {
      this.activeMailboxCache = m;
      return m;
    });
  }
  searchAllMailboxes(options: Parameters<typeof searchAllMailboxes>[1]) {
    return searchAllMailboxes(this, options);
  }
  searchMailboxes(options: Parameters<typeof searchMailboxes>[1]) {
    return searchMailboxes(this, options);
  }
  searchContractsMailbox(
    options: Parameters<typeof searchContractsMailbox>[1]
  ) {
    return searchContractsMailbox(this, options);
  }
  searchEstimatingMailboxes(
    options: Parameters<typeof searchEstimatingMailboxes>[1]
  ) {
    return searchEstimatingMailboxes(this, options);
  }
  filterContractsMailbox(
    options: Parameters<typeof filterContractsMailbox>[1]
  ) {
    return filterContractsMailbox(this, options);
  }
}
