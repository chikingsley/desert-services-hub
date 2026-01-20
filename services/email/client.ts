/**
 * Microsoft Graph Email Client
 *
 * Fetches and sends emails via Microsoft 365 Graph API.
 *
 * Supports two auth modes:
 * 1. App-only (client credentials): Access any mailbox in the tenant
 *    - Requires Mail.Read application permission
 *    - Use for background/automated processing
 *
 * 2. Delegated (user sign-in): Access the signed-in user's mailbox
 *    - Uses device code flow (user signs in via browser)
 *    - Requires Mail.Read delegated permission
 *    - Use for interactive scripts
 */
import { ClientSecretCredential, type TokenCredential } from "@azure/identity";
import {
  type AuthenticationResult,
  type DeviceCodeRequest,
  PublicClientApplication,
} from "@azure/msal-node";
import { Client } from "@microsoft/microsoft-graph-client";
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials";
import { getLogoAttachment, wrapWithSignature } from "./templates/index";
import { fileCachePlugin } from "./token-cache";
import type {
  EmailAttachment,
  EmailConfig,
  EmailMessage,
  EmailSearchOptions,
  Recipient,
  SendEmailOptions,
  TrackedEmailAttachment,
} from "./types";

export type AuthMode = "app" | "user";

const GRAPH_SCOPES = ["Mail.Read", "Mail.ReadWrite", "Mail.Send", "User.Read"];
const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_DAYS_BACK = 30;
const DEFAULT_SEARCH_LIMIT = 50;
const MAX_EMAILS_DEFAULT = 500;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Microsoft Graph API client for email operations.
 *
 * Supports two authentication modes:
 * - App-only (client credentials): Access any mailbox in the tenant
 * - Delegated (user sign-in): Access the signed-in user's mailbox
 *
 * @example
 * // App authentication (org-wide access)
 * const client = new GraphEmailClient({
 *   azureTenantId: 'tenant-id',
 *   azureClientId: 'client-id',
 *   azureClientSecret: 'client-secret',
 * });
 * client.initAppAuth();
 * const emails = await client.searchEmails({ query: 'invoice', userId: 'user@example.com' });
 *
 * @example
 * // User authentication (delegated access)
 * const client = new GraphEmailClient({ azureTenantId, azureClientId, azureClientSecret });
 * await client.initUserAuth();
 * const myEmails = await client.getMyEmails({ limit: 10 });
 */
export class GraphEmailClient {
  private client: Client | null = null;
  private readonly config: EmailConfig;
  private authMode: AuthMode = "app";
  private credential: TokenCredential | null = null;
  private msalClient: PublicClientApplication | null = null;
  private activeMailboxCache: string[] | null = null;

  /**
   * Create a new GraphEmailClient instance.
   *
   * @param config - Azure AD configuration for Microsoft Graph API access
   * @param config.azureTenantId - Azure AD tenant ID
   * @param config.azureClientId - Azure AD application (client) ID
   * @param config.azureClientSecret - Azure AD client secret
   * @param config.batchSize - Number of emails to fetch per request (default: 50)
   * @param config.daysBack - Number of days to look back for emails (default: 30)
   *
   * @example
   * const client = new GraphEmailClient({
   *   azureTenantId: process.env.AZURE_TENANT_ID,
   *   azureClientId: process.env.AZURE_CLIENT_ID,
   *   azureClientSecret: process.env.AZURE_CLIENT_SECRET,
   *   batchSize: 100,
   *   daysBack: 7,
   * });
   */
  constructor(config: EmailConfig) {
    this.config = config;
  }

  /**
   * Initialize with app-only authentication (requires Application permissions).
   *
   * Use this mode for background/automated processing that needs access to
   * any mailbox in the tenant. Requires Mail.Read application permission.
   *
   * @returns void
   *
   * @example
   * const client = new GraphEmailClient(config);
   * client.initAppAuth();
   * // Now can access any mailbox with userId parameter
   * const emails = await client.searchEmails({ query: 'invoice', userId: 'user@example.com' });
   */
  initAppAuth(): void {
    this.credential = new ClientSecretCredential(
      this.config.azureTenantId,
      this.config.azureClientId,
      this.config.azureClientSecret
    );
    this.authMode = "app";
    this.client = null;
  }

  /**
   * Initialize and return MSAL client with file-based token cache.
   *
   * Used internally for user authentication. Tokens are cached to
   * `data/.token-cache.json` so users don't need to sign in repeatedly.
   *
   * @returns Promise resolving to the MSAL PublicClientApplication instance
   */
  getMsalClient(): Promise<PublicClientApplication> {
    if (!this.msalClient) {
      this.msalClient = new PublicClientApplication({
        auth: {
          clientId: this.config.azureClientId,
          authority: `https://login.microsoftonline.com/${this.config.azureTenantId}`,
        },
        cache: {
          cachePlugin: fileCachePlugin,
        },
      });
    }
    return Promise.resolve(this.msalClient);
  }

  /**
   * Initialize with user authentication via Device Code flow.
   *
   * Prompts user to sign in via browser using a device code. Token is cached
   * to disk so subsequent calls use the cached token without re-authentication.
   * Delete `data/.token-cache.json` to force a new sign-in.
   *
   * Requires Mail.Read, Mail.ReadWrite, Mail.Send delegated permissions.
   *
   * @returns Promise that resolves when authentication is complete
   *
   * @example
   * const client = new GraphEmailClient(config);
   * await client.initUserAuth();
   * // User signs in via browser, then:
   * const myEmails = await client.getMyEmails({ limit: 10 });
   */
  async initUserAuth(): Promise<void> {
    const msalClient = await this.getMsalClient();
    this.authMode = "user";
    this.client = null;

    // Check for cached accounts first
    const accounts = await msalClient.getTokenCache().getAllAccounts();

    let authResult: AuthenticationResult | null = null;

    if (accounts.length > 0) {
      // Try to get token silently from cache
      try {
        const account = accounts[0];
        if (!account) {
          throw new Error("Account not found");
        }

        authResult = await msalClient.acquireTokenSilent({
          scopes: GRAPH_SCOPES,
          account,
        });
        console.log(`Using cached credentials for: ${account.username}\n`);
      } catch {
        // Silent auth failed, will fall through to device code
        console.log("Cached token expired, need to sign in again...\n");
      }
    }

    if (!authResult) {
      // Need interactive sign-in
      const deviceCodeRequest: DeviceCodeRequest = {
        scopes: GRAPH_SCOPES,
        deviceCodeCallback: (response) => {
          console.log("\n=== Microsoft Sign-In ===\n");
          console.log("To sign in, open a browser and go to:");
          console.log(`  ${response.verificationUri}`);
          console.log(`\nEnter this code: ${response.userCode}\n`);
          console.log("Waiting for sign-in...");
        },
      };

      authResult = await msalClient.acquireTokenByDeviceCode(deviceCodeRequest);

      if (authResult?.account) {
        console.log(
          `\nSigned in as: ${authResult.account.name} <${authResult.account.username}>\n`
        );
      }
    }

    // Create a custom auth provider that uses MSAL
    const authProvider = {
      getAccessToken: async (): Promise<string> => {
        const client = await this.getMsalClient();
        const cachedAccounts = await client.getTokenCache().getAllAccounts();
        if (cachedAccounts.length === 0) {
          throw new Error("No cached accounts found");
        }

        const account = cachedAccounts[0];
        if (!account) {
          throw new Error("No account found");
        }

        const result = await client.acquireTokenSilent({
          scopes: GRAPH_SCOPES,
          account,
        });

        if (!result?.accessToken) {
          throw new Error("Failed to acquire token");
        }

        return result.accessToken;
      },
    };

    this.client = Client.initWithMiddleware({ authProvider });
  }

  private getClient(): Client {
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

      this.client = Client.initWithMiddleware({ authProvider });
    }
    return this.client;
  }

  /**
   * Get the base API path (/me or /users/{userId}) based on auth mode
   */
  private getBasePath(userId?: string): string {
    if (this.authMode === "user") {
      return "/me";
    }
    if (!userId) {
      throw new Error("userId required for app authentication");
    }
    return `/users/${userId}`;
  }

  /**
   * Get the API path for messages based on auth mode
   */
  private getMessagesPath(userId?: string): string {
    return `${this.getBasePath(userId)}/messages`;
  }

  /**
   * Get recent emails from a mailbox.
   *
   * @param userId - Email address of the mailbox (required for app auth, ignored for user auth)
   * @param since - Only return emails received after this date (default: 30 days ago)
   * @param limit - Maximum number of emails to return (default: 50)
   * @returns Promise resolving to array of email messages
   *
   * @example
   * // App auth - specify userId
   * client.initAppAuth();
   * const emails = await client.getEmails('user@example.com', new Date('2024-01-01'), 100);
   *
   * @example
   * // User auth - userId is ignored, uses /me endpoint
   * await client.initUserAuth();
   * const myEmails = await client.getEmails();
   */
  async getEmails(
    userId?: string,
    since?: Date,
    limit?: number
  ): Promise<EmailMessage[]> {
    const client = this.getClient();
    const effectiveLimit = limit ?? this.config.batchSize ?? DEFAULT_BATCH_SIZE;
    const daysBack = this.config.daysBack ?? DEFAULT_DAYS_BACK;
    const sinceDate = since ?? new Date(Date.now() - daysBack * MS_PER_DAY);
    const dateFilter = `receivedDateTime ge ${sinceDate.toISOString()}`;
    const messagesPath = this.getMessagesPath(userId);
    const displayName = this.authMode === "user" ? "your mailbox" : userId;

    try {
      const response = await client
        .api(messagesPath)
        .filter(dateFilter)
        .orderby("receivedDateTime desc")
        .top(effectiveLimit)
        .select(
          "id,subject,receivedDateTime,from,toRecipients,ccRecipients,body"
        )
        .get();

      if (!response?.value) {
        console.log(`No messages found for ${displayName}`);
        return [];
      }

      const emails = this.parseMessages(response.value);
      console.log(`Retrieved ${emails.length} emails for ${displayName}`);
      return emails;
    } catch (error) {
      console.error(`Error fetching emails for ${displayName}:`, error);
      throw error;
    }
  }

  /**
   * Get all emails with automatic pagination.
   *
   * Fetches emails in batches, following pagination links until maxEmails
   * is reached or no more emails are available.
   *
   * @param userId - Email address of the mailbox (required for app auth)
   * @param since - Only return emails received after this date (default: 30 days ago)
   * @param maxEmails - Maximum total emails to return (default: 500)
   * @returns Promise resolving to array of all fetched email messages
   *
   * @example
   * // Fetch up to 1000 emails from the last week
   * const emails = await client.getAllEmailsPaginated(
   *   'user@example.com',
   *   new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
   *   1000
   * );
   */
  async getAllEmailsPaginated(
    userId?: string,
    since?: Date,
    maxEmails = MAX_EMAILS_DEFAULT
  ): Promise<EmailMessage[]> {
    const client = this.getClient();
    const daysBack = this.config.daysBack ?? DEFAULT_DAYS_BACK;
    const sinceDate = since ?? new Date(Date.now() - daysBack * MS_PER_DAY);
    const dateFilter = `receivedDateTime ge ${sinceDate.toISOString()}`;
    const messagesPath = this.getMessagesPath(userId);
    const displayName = this.authMode === "user" ? "your mailbox" : userId;
    const batchSize = this.config.batchSize ?? DEFAULT_BATCH_SIZE;
    const allEmails: EmailMessage[] = [];

    try {
      let response = await client
        .api(messagesPath)
        .filter(dateFilter)
        .orderby("receivedDateTime desc")
        .top(Math.min(batchSize, maxEmails))
        .select(
          "id,subject,receivedDateTime,from,toRecipients,ccRecipients,body"
        )
        .get();

      while (response?.value && allEmails.length < maxEmails) {
        const emails = this.parseMessages(response.value);
        const remaining = maxEmails - allEmails.length;
        allEmails.push(...emails.slice(0, remaining));

        const nextLink = response["@odata.nextLink"];
        if (allEmails.length >= maxEmails || !nextLink) {
          break;
        }
        response = await client.api(nextLink).get();
      }

      console.log(
        `Retrieved total of ${allEmails.length} emails for ${displayName}`
      );
      return allEmails;
    } catch (error) {
      console.error(
        `Error fetching paginated emails for ${displayName}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Parse multiple messages, filtering out any that fail to parse
   */
  private parseMessages(messages: Record<string, unknown>[]): EmailMessage[] {
    const emails: EmailMessage[] = [];
    for (const msg of messages) {
      const email = this.parseMessage(msg);
      if (email) {
        emails.push(email);
      }
    }
    return emails;
  }

  /**
   * Parse messages and include hasAttachments flag from raw response
   */
  private parseMessagesWithAttachments(
    messages: Record<string, unknown>[]
  ): EmailMessage[] {
    const emails: EmailMessage[] = [];
    for (const msg of messages) {
      const email = this.parseMessage(msg);
      if (email) {
        email.hasAttachments = (msg.hasAttachments as boolean) ?? false;
        emails.push(email);
      }
    }
    return emails;
  }

  private parseMessage(msg: Record<string, unknown>): EmailMessage | null {
    try {
      const from = msg.from as
        | { emailAddress?: { address?: string; name?: string } }
        | undefined;
      const body = msg.body as
        | { content?: string; contentType?: string }
        | undefined;

      return {
        id: (msg.id as string) ?? "",
        subject: (msg.subject as string) ?? "",
        receivedDateTime: msg.receivedDateTime
          ? new Date(msg.receivedDateTime as string)
          : new Date(),
        fromName: from?.emailAddress?.name ?? null,
        fromEmail: from?.emailAddress?.address ?? "",
        toRecipients: this.parseRecipients(
          msg.toRecipients as
            | Array<{ emailAddress?: { address?: string; name?: string } }>
            | undefined
        ),
        ccRecipients: this.parseRecipients(
          msg.ccRecipients as
            | Array<{ emailAddress?: { address?: string; name?: string } }>
            | undefined
        ),
        bodyContent: body?.content ?? "",
        bodyType: body?.contentType === "html" ? "html" : "text",
        conversationId: (msg.conversationId as string) ?? undefined,
      };
    } catch (error) {
      console.warn("Error parsing message:", error);
      return null;
    }
  }

  /**
   * List all users in the tenant.
   *
   * Returns users with their ID, email address, and display name.
   * Only works with app authentication.
   *
   * @returns Promise resolving to array of user objects
   *
   * @example
   * client.initAppAuth();
   * const users = await client.listUsers();
   * // [{ id: '...', email: 'user@example.com', displayName: 'John Doe' }]
   */
  async listUsers(): Promise<
    Array<{ id: string; email: string; displayName: string }>
  > {
    const client = this.getClient();
    try {
      const response = await client.api("/users").get();

      if (!response?.value) {
        return [];
      }

      return response.value
        .filter((u: Record<string, unknown>) => u.mail || u.userPrincipalName)
        .map((u: Record<string, unknown>) => ({
          id: u.id as string,
          email: (u.mail ?? u.userPrincipalName) as string,
          displayName: (u.displayName ?? "") as string,
        }));
    } catch (error) {
      console.error("Error listing users:", error);
      throw error;
    }
  }

  private parseRecipients(
    recipients:
      | Array<{ emailAddress?: { address?: string; name?: string } }>
      | undefined
  ): Recipient[] {
    const result: Recipient[] = [];

    if (recipients) {
      for (const recipient of recipients) {
        if (recipient.emailAddress) {
          result.push({
            name: recipient.emailAddress.name ?? null,
            email: recipient.emailAddress.address ?? "",
          });
        }
      }
    }
    return result;
  }

  // ============================================================================
  // Search & Single Email
  // ============================================================================

  /**
   * Search emails using KQL (Keyword Query Language).
   *
   * Performs a text search across email subject and body. For structured
   * queries (sender, hasAttachments, etc.), use filterEmails() instead.
   *
   * @param options - Search configuration
   * @param options.query - KQL search query (searches subject and body)
   * @param options.userId - Email address of the mailbox (required for app auth)
   * @param options.limit - Maximum results to return (default: 50)
   * @param options.since - Only return emails received after this date
   * @param options.until - Only return emails received before this date
   * @param options.folder - Search in specific folder: 'inbox', 'sentitems', 'drafts', 'deleteditems'
   * @returns Promise resolving to array of matching email messages
   *
   * @example
   * // Simple search (searches subject and body)
   * const results = await client.searchEmails({ query: 'invoice', userId: 'user@example.com' });
   *
   * @example
   * // Search with date range
   * const results = await client.searchEmails({
   *   query: 'quarterly report',
   *   userId: 'user@example.com',
   *   since: new Date('2024-01-01'),
   *   until: new Date('2024-03-31'),
   *   limit: 100,
   * });
   *
   * @example
   * // Search in specific folder
   * const drafts = await client.searchEmails({
   *   query: 'proposal',
   *   userId: 'user@example.com',
   *   folder: 'drafts',
   * });
   */
  async searchEmails(options: EmailSearchOptions): Promise<EmailMessage[]> {
    const client = this.getClient();
    // If folder specified, search within that folder; otherwise search all messages
    const basePath = this.getBasePath(options.userId);
    const messagesPath = options.folder
      ? `${basePath}/mailFolders/${options.folder}/messages`
      : `${basePath}/messages`;
    const limit = options.limit ?? DEFAULT_SEARCH_LIMIT;
    const hasDateFilters = options.since || options.until;

    // MS Graph doesn't allow combining $search with $filter
    // If date filters are present, fetch more and filter locally
    const fetchLimit = hasDateFilters ? limit * 3 : limit;

    try {
      const response = await client
        .api(messagesPath)
        .search(`"${options.query}"`)
        .top(fetchLimit)
        .select(
          "id,subject,receivedDateTime,from,toRecipients,ccRecipients,body,hasAttachments,conversationId"
        )
        .get();

      if (!response?.value) {
        return [];
      }

      let emails = this.parseMessagesWithAttachments(response.value);

      // Apply date filters locally since Graph API doesn't support $filter with $search
      if (options.since) {
        const sinceTime = options.since.getTime();
        emails = emails.filter(
          (e) => new Date(e.receivedDateTime).getTime() >= sinceTime
        );
      }
      if (options.until) {
        const untilTime = options.until.getTime();
        emails = emails.filter(
          (e) => new Date(e.receivedDateTime).getTime() <= untilTime
        );
      }

      return emails.slice(0, limit);
    } catch (error) {
      console.error("Error searching emails:", error);
      throw error;
    }
  }

  /**
   * Filter emails using OData $filter syntax.
   *
   * Use this for structured queries like sender, hasAttachments, date ranges.
   * For text search, use searchEmails() instead.
   *
   * Note: Some filters don't work well with sorting - use simple filters.
   *
   * @param options - Filter configuration
   * @param options.filter - OData filter expression
   * @param options.userId - Email address of the mailbox (required for app auth)
   * @param options.limit - Maximum results to return (default: 50)
   * @returns Promise resolving to array of matching email messages
   *
   * @example
   * // Filter by sender
   * const fromJohn = await client.filterEmails({
   *   filter: "from/emailAddress/address eq 'john@example.com'",
   *   userId: 'user@example.com',
   * });
   *
   * @example
   * // Filter emails with attachments
   * const withAttachments = await client.filterEmails({
   *   filter: 'hasAttachments eq true',
   *   userId: 'user@example.com',
   *   limit: 20,
   * });
   *
   * @example
   * // Filter by date range
   * const recent = await client.filterEmails({
   *   filter: "receivedDateTime ge 2024-01-01T00:00:00Z",
   *   userId: 'user@example.com',
   * });
   */
  async filterEmails(options: {
    filter: string;
    userId?: string;
    limit?: number;
  }): Promise<EmailMessage[]> {
    const client = this.getClient();
    const limit = options.limit ?? DEFAULT_SEARCH_LIMIT;
    const messagesPath = this.getMessagesPath(options.userId);

    try {
      // Note: orderby can cause "InefficientFilter" errors with some filters
      const response = await client
        .api(messagesPath)
        .filter(options.filter)
        .top(limit)
        .select(
          "id,subject,receivedDateTime,from,toRecipients,ccRecipients,body,hasAttachments,conversationId"
        )
        .get();

      if (!response?.value) {
        return [];
      }

      return this.parseMessagesWithAttachments(response.value);
    } catch (error) {
      console.error("Error filtering emails:", error);
      throw error;
    }
  }

  /**
   * Get a single email by ID.
   *
   * @param messageId - The unique ID of the email message
   * @param userId - Email address of the mailbox (required for app auth)
   * @returns Promise resolving to the email message, or null if not found
   *
   * @example
   * const email = await client.getEmail('AAMkAGI2...', 'user@example.com');
   * if (email) {
   *   console.log(email.subject, email.bodyContent);
   * }
   */
  async getEmail(
    messageId: string,
    userId?: string
  ): Promise<EmailMessage | null> {
    const client = this.getClient();
    const basePath = this.getBasePath(userId);

    try {
      const msg = await client
        .api(`${basePath}/messages/${messageId}`)
        .select(
          "id,subject,receivedDateTime,from,toRecipients,ccRecipients,body,hasAttachments,conversationId"
        )
        .get();

      const email = this.parseMessage(msg);
      if (email) {
        email.hasAttachments = msg.hasAttachments ?? false;
      }
      return email;
    } catch (error) {
      console.error("Error fetching email:", error);
      return null;
    }
  }

  // ============================================================================
  // Attachments
  // ============================================================================

  /**
   * List all attachments for an email.
   *
   * Returns metadata about each attachment including ID, name, content type,
   * size, and whether it's an inline attachment.
   *
   * @param messageId - The unique ID of the email message
   * @param userId - Email address of the mailbox (required for app auth)
   * @returns Promise resolving to array of attachment metadata
   *
   * @example
   * const attachments = await client.getAttachments('AAMkAGI2...', 'user@example.com');
   * for (const att of attachments) {
   *   console.log(`${att.name} (${att.size} bytes)`);
   * }
   */
  async getAttachments(
    messageId: string,
    userId?: string
  ): Promise<EmailAttachment[]> {
    const client = this.getClient();
    const basePath = this.getBasePath(userId);

    try {
      const response = await client
        .api(`${basePath}/messages/${messageId}/attachments`)
        .get();

      if (!response?.value) {
        return [];
      }

      return response.value.map((att: Record<string, unknown>) => ({
        id: att.id as string,
        name: att.name as string,
        contentType: att.contentType as string,
        size: att.size as number,
        isInline: (att.isInline as boolean) ?? false,
      }));
    } catch (error) {
      console.error("Error fetching attachments:", error);
      throw error;
    }
  }

  /**
   * Download an attachment's content as a Buffer.
   *
   * @param messageId - The unique ID of the email message
   * @param attachmentId - The unique ID of the attachment
   * @param userId - Email address of the mailbox (required for app auth)
   * @returns Promise resolving to the attachment content as a Buffer
   *
   * @example
   * const attachments = await client.getAttachments(messageId, userId);
   * const pdfAttachment = attachments.find(a => a.name.endsWith('.pdf'));
   * if (pdfAttachment) {
   *   const content = await client.downloadAttachment(messageId, pdfAttachment.id, userId);
   *   await Bun.write('downloaded.pdf', content);
   * }
   */
  async downloadAttachment(
    messageId: string,
    attachmentId: string,
    userId?: string
  ): Promise<Buffer> {
    const client = this.getClient();
    const basePath = this.getBasePath(userId);

    try {
      const response = await client
        .api(`${basePath}/messages/${messageId}/attachments/${attachmentId}`)
        .get();

      if (!response?.contentBytes) {
        throw new Error("Attachment has no content");
      }

      return Buffer.from(response.contentBytes, "base64");
    } catch (error) {
      console.error("Error downloading attachment:", error);
      throw error;
    }
  }

  /**
   * Download all non-inline attachments from an email.
   *
   * Skips inline attachments (like embedded images) and downloads only
   * regular file attachments.
   *
   * @param messageId - The unique ID of the email message
   * @param userId - Email address of the mailbox (required for app auth)
   * @returns Promise resolving to array of downloaded attachments with name, contentType, and content
   *
   * @example
   * const files = await client.downloadAllAttachments('AAMkAGI2...', 'user@example.com');
   * for (const file of files) {
   *   await Bun.write(`downloads/${file.name}`, file.content);
   *   console.log(`Saved ${file.name} (${file.contentType})`);
   * }
   */
  async downloadAllAttachments(
    messageId: string,
    userId?: string
  ): Promise<Array<{ name: string; contentType: string; content: Buffer }>> {
    const attachments = await this.getAttachments(messageId, userId);
    const results: Array<{
      name: string;
      contentType: string;
      content: Buffer;
    }> = [];

    for (const att of attachments) {
      if (att.isInline) {
        continue;
      }
      const content = await this.downloadAttachment(messageId, att.id, userId);
      results.push({
        name: att.name,
        contentType: att.contentType,
        content,
      });
    }

    return results;
  }

  /**
   * Get attachments with source tracking information.
   *
   * Returns attachments that include the source mailbox and message ID,
   * preventing userId mismatch errors when downloading attachments from
   * multi-mailbox searches.
   *
   * @param messageId - The unique ID of the email message
   * @param userId - Email address of the mailbox (required for app auth)
   * @returns Promise resolving to array of tracked attachments
   *
   * @example
   * // Get tracked attachments from a search result
   * const attachments = await client.getTrackedAttachments(messageId, 'user@example.com');
   * for (const att of attachments) {
   *   console.log(`${att.name} from ${att.sourceMailbox}`);
   *   // Download will use the correct mailbox automatically
   *   const content = await client.safeDownloadAttachment(att);
   * }
   */
  async getTrackedAttachments(
    messageId: string,
    userId: string
  ): Promise<TrackedEmailAttachment[]> {
    const attachments = await this.getAttachments(messageId, userId);

    return attachments.map((att) => ({
      ...att,
      sourceMailbox: userId,
      sourceMessageId: messageId,
    }));
  }

  /**
   * Safely download an attachment using its tracked source information.
   *
   * This method prevents the common error of using the wrong userId when
   * downloading attachments from multi-mailbox searches. It automatically
   * uses the sourceMailbox from the tracked attachment.
   *
   * @param attachment - Tracked attachment with source mailbox information
   * @returns Promise resolving to the attachment content as a Buffer
   * @throws Error if attachment doesn't have source tracking info
   *
   * @example
   * // Search across multiple mailboxes
   * const results = await client.searchAllMailboxes({ query: 'invoice' });
   * for (const { mailbox, emails } of results) {
   *   for (const email of emails) {
   *     const attachments = await client.getTrackedAttachments(email.id, mailbox);
   *     for (const att of attachments) {
   *       // Safe - uses correct mailbox automatically
   *       const content = await client.safeDownloadAttachment(att);
   *       await Bun.write(`downloads/${att.name}`, content);
   *     }
   *   }
   * }
   */
  async safeDownloadAttachment(
    attachment: TrackedEmailAttachment
  ): Promise<Buffer> {
    if (!(attachment.sourceMailbox && attachment.sourceMessageId)) {
      throw new Error(
        "Attachment missing source tracking info. Use getTrackedAttachments() instead of getAttachments()."
      );
    }

    return await this.downloadAttachment(
      attachment.sourceMessageId,
      attachment.id,
      attachment.sourceMailbox
    );
  }

  /**
   * Safely download all non-inline attachments from an email using tracked sources.
   *
   * Combines getTrackedAttachments + safeDownloadAttachment for convenience.
   * Prevents userId mismatch errors when downloading from multi-mailbox searches.
   *
   * @param messageId - The unique ID of the email message
   * @param userId - Email address of the mailbox (required for app auth)
   * @returns Promise resolving to array of downloaded attachments with tracking info
   *
   * @example
   * const files = await client.safeDownloadAllAttachments('AAMkAGI2...', 'user@example.com');
   * for (const file of files) {
   *   await Bun.write(`downloads/${file.name}`, file.content);
   *   console.log(`Saved ${file.name} from ${file.sourceMailbox}`);
   * }
   */
  async safeDownloadAllAttachments(
    messageId: string,
    userId: string
  ): Promise<
    Array<{
      name: string;
      contentType: string;
      content: Buffer;
      sourceMailbox: string;
      sourceMessageId: string;
    }>
  > {
    const attachments = await this.getTrackedAttachments(messageId, userId);
    const results: Array<{
      name: string;
      contentType: string;
      content: Buffer;
      sourceMailbox: string;
      sourceMessageId: string;
    }> = [];

    for (const att of attachments) {
      if (att.isInline) {
        continue;
      }
      const content = await this.safeDownloadAttachment(att);
      results.push({
        name: att.name,
        contentType: att.contentType,
        content,
        sourceMailbox: att.sourceMailbox,
        sourceMessageId: att.sourceMessageId,
      });
    }

    return results;
  }

  // ============================================================================
  // My Mailbox (User Auth) - Convenience methods that use /me endpoint
  // ============================================================================

  /**
   * Require user auth for /me operations.
   * @throws Error if not using user authentication
   */
  private requireUserAuth(): void {
    if (this.authMode !== "user") {
      throw new Error(
        "This method requires user authentication (delegated). Call initUserAuth() first."
      );
    }
  }

  /**
   * Get recent emails from signed-in user's mailbox.
   *
   * Requires user authentication (delegated).
   *
   * @param options - Optional query configuration
   * @param options.since - Only return emails received after this date
   * @param options.limit - Maximum number of emails to return
   * @returns Promise resolving to array of email messages
   *
   * @example
   * await client.initUserAuth();
   * const emails = await client.getMyEmails({ limit: 5 });
   *
   * @example
   * const recentEmails = await client.getMyEmails({
   *   since: new Date('2024-01-01'),
   *   limit: 20,
   * });
   */
  async getMyEmails(options?: {
    since?: Date;
    limit?: number;
  }): Promise<EmailMessage[]> {
    this.requireUserAuth();
    const client = this.getClient();
    const limit = options?.limit ?? this.config.batchSize ?? DEFAULT_BATCH_SIZE;
    const daysBack = this.config.daysBack ?? DEFAULT_DAYS_BACK;
    const sinceDate =
      options?.since ?? new Date(Date.now() - daysBack * MS_PER_DAY);
    const dateFilter = `receivedDateTime ge ${sinceDate.toISOString()}`;

    try {
      const response = await client
        .api("/me/messages")
        .filter(dateFilter)
        .orderby("receivedDateTime desc")
        .top(limit)
        .select(
          "id,subject,receivedDateTime,from,toRecipients,ccRecipients,body,hasAttachments,conversationId"
        )
        .get();

      if (!response?.value) {
        return [];
      }

      return this.parseMessagesWithAttachments(response.value);
    } catch (error) {
      console.error("Error fetching my emails:", error);
      throw error;
    }
  }

  /**
   * Search signed-in user's mailbox using KQL.
   *
   * Requires user authentication (delegated).
   *
   * @param options - Search configuration
   * @param options.query - KQL search query (searches subject and body)
   * @param options.limit - Maximum results to return (default: 50)
   * @param options.since - Only return emails received after this date
   * @param options.until - Only return emails received before this date
   * @param options.folder - Search in specific folder: 'inbox', 'sentitems', 'drafts', 'deleteditems'
   * @returns Promise resolving to array of matching email messages
   *
   * @example
   * await client.initUserAuth();
   * const invoices = await client.searchMyEmails({ query: 'invoice' });
   *
   * @example
   * const permits = await client.searchMyEmails({
   *   query: 'permit',
   *   limit: 10,
   *   since: new Date('2024-01-01'),
   *   folder: 'inbox',
   * });
   */
  async searchMyEmails(options: {
    query: string;
    limit?: number;
    since?: Date;
    until?: Date;
    folder?: "inbox" | "sentitems" | "drafts" | "deleteditems";
  }): Promise<EmailMessage[]> {
    this.requireUserAuth();
    const client = this.getClient();
    const messagesPath = options.folder
      ? `/me/mailFolders/${options.folder}/messages`
      : "/me/messages";
    const limit = options.limit ?? DEFAULT_SEARCH_LIMIT;
    const hasDateFilters = options.since || options.until;
    const fetchLimit = hasDateFilters ? limit * 3 : limit;

    try {
      const response = await client
        .api(messagesPath)
        .search(`"${options.query}"`)
        .top(fetchLimit)
        .select(
          "id,subject,receivedDateTime,from,toRecipients,ccRecipients,body,hasAttachments,conversationId"
        )
        .get();

      if (!response?.value) {
        return [];
      }

      let emails = this.parseMessagesWithAttachments(response.value);

      if (options.since) {
        const sinceTime = options.since.getTime();
        emails = emails.filter(
          (e) => new Date(e.receivedDateTime).getTime() >= sinceTime
        );
      }
      if (options.until) {
        const untilTime = options.until.getTime();
        emails = emails.filter(
          (e) => new Date(e.receivedDateTime).getTime() <= untilTime
        );
      }

      return emails.slice(0, limit);
    } catch (error) {
      console.error("Error searching my emails:", error);
      throw error;
    }
  }

  /**
   * Filter signed-in user's mailbox using OData $filter syntax.
   *
   * Requires user authentication (delegated).
   *
   * @param options - Filter configuration
   * @param options.filter - OData filter expression
   * @param options.limit - Maximum results to return (default: 50)
   * @returns Promise resolving to array of matching email messages
   *
   * @example
   * await client.initUserAuth();
   * const withAttachments = await client.filterMyEmails({
   *   filter: 'hasAttachments eq true',
   * });
   *
   * @example
   * const fromJohn = await client.filterMyEmails({
   *   filter: "from/emailAddress/address eq 'john@example.com'",
   *   limit: 20,
   * });
   */
  async filterMyEmails(options: {
    filter: string;
    limit?: number;
  }): Promise<EmailMessage[]> {
    this.requireUserAuth();
    const client = this.getClient();
    const limit = options.limit ?? DEFAULT_SEARCH_LIMIT;

    try {
      const response = await client
        .api("/me/messages")
        .filter(options.filter)
        .top(limit)
        .select(
          "id,subject,receivedDateTime,from,toRecipients,ccRecipients,body,hasAttachments,conversationId"
        )
        .get();

      if (!response?.value) {
        return [];
      }

      return this.parseMessagesWithAttachments(response.value);
    } catch (error) {
      console.error("Error filtering my emails:", error);
      throw error;
    }
  }

  /**
   * Get a single email from signed-in user's mailbox by ID.
   *
   * Requires user authentication (delegated).
   *
   * @param messageId - The unique ID of the email message
   * @returns Promise resolving to the email message, or null if not found
   *
   * @example
   * await client.initUserAuth();
   * const email = await client.getMyEmail('AAMkAGI2...');
   * if (email) {
   *   console.log(email.subject);
   * }
   */
  async getMyEmail(messageId: string): Promise<EmailMessage | null> {
    this.requireUserAuth();
    const client = this.getClient();

    try {
      const msg = await client
        .api(`/me/messages/${messageId}`)
        .select(
          "id,subject,receivedDateTime,from,toRecipients,ccRecipients,body,hasAttachments,conversationId"
        )
        .get();

      const email = this.parseMessage(msg);
      if (email) {
        email.hasAttachments = msg.hasAttachments ?? false;
      }
      return email;
    } catch (error) {
      console.error("Error fetching my email:", error);
      return null;
    }
  }

  /**
   * List mail folders for signed-in user.
   *
   * Requires user authentication (delegated).
   *
   * @returns Promise resolving to array of folder objects with id, displayName, and parentFolderId
   *
   * @example
   * await client.initUserAuth();
   * const folders = await client.getMyFolders();
   * // [{ id: '...', displayName: 'Inbox', parentFolderId: null }, ...]
   */
  async getMyFolders(): Promise<
    Array<{ id: string; displayName: string; parentFolderId: string | null }>
  > {
    this.requireUserAuth();
    const client = this.getClient();

    try {
      const response = await client.api("/me/mailFolders").top(100).get();

      if (!response?.value) {
        return [];
      }

      return response.value.map((folder: Record<string, unknown>) => ({
        id: folder.id as string,
        displayName: folder.displayName as string,
        parentFolderId: (folder.parentFolderId as string) ?? null,
      }));
    } catch (error) {
      console.error("Error listing my folders:", error);
      throw error;
    }
  }

  // ============================================================================
  // Team Mailbox Shortcuts (App Auth)
  // ============================================================================

  /** Contracts mailbox address for the organization. */
  static readonly CONTRACTS_MAILBOX = "contracts@desertservices.net";

  /**
   * Estimating team mailboxes in priority order.
   * Used by searchEstimatingMailboxes() for team-wide searches.
   */
  static readonly ESTIMATING_MAILBOXES = [
    "jared@desertservices.net",
    "jeff@desertservices.net",
    "denise@desertservices.net",
    "estimating@desertservices.net",
  ] as const;

  /**
   * Search the contracts mailbox (contracts@desertservices.net).
   *
   * Requires app authentication.
   *
   * @param options - Search configuration
   * @param options.query - KQL search query
   * @param options.limit - Maximum results to return
   * @param options.since - Only return emails received after this date
   * @param options.until - Only return emails received before this date
   * @returns Promise resolving to array of matching email messages
   *
   * @example
   * client.initAppAuth();
   * const results = await client.searchContractsMailbox({
   *   query: 'signed agreement',
   *   limit: 20,
   * });
   */
  async searchContractsMailbox(options: {
    query: string;
    limit?: number;
    since?: Date;
    until?: Date;
  }): Promise<EmailMessage[]> {
    if (this.authMode !== "app") {
      throw new Error("searchContractsMailbox requires app authentication");
    }

    return await this.searchEmails({
      query: options.query,
      userId: GraphEmailClient.CONTRACTS_MAILBOX,
      limit: options.limit,
      since: options.since,
      until: options.until,
    });
  }

  /**
   * Search estimating team mailboxes in parallel.
   *
   * Searches Jared, Jeff, Denise, and estimating@ mailboxes simultaneously.
   * Requires app authentication.
   *
   * @param options - Search configuration
   * @param options.query - KQL search query
   * @param options.limit - Maximum results per mailbox
   * @param options.since - Only return emails received after this date
   * @param options.until - Only return emails received before this date
   * @returns Promise resolving to array of results grouped by mailbox
   *
   * @example
   * client.initAppAuth();
   * const results = await client.searchEstimatingMailboxes({
   *   query: 'takeoff',
   *   limit: 10,
   * });
   * // [{ mailbox: 'jared@...', emails: [...] }, { mailbox: 'jeff@...', emails: [...] }]
   */
  async searchEstimatingMailboxes(options: {
    query: string;
    limit?: number;
    since?: Date;
    until?: Date;
  }): Promise<Array<{ mailbox: string; emails: EmailMessage[] }>> {
    if (this.authMode !== "app") {
      throw new Error("searchEstimatingMailboxes requires app authentication");
    }

    return await this.searchMailboxes({
      userIds: [...GraphEmailClient.ESTIMATING_MAILBOXES],
      query: options.query,
      limit: options.limit,
      since: options.since,
      until: options.until,
    });
  }

  /**
   * Filter the contracts mailbox using OData $filter syntax.
   *
   * Requires app authentication.
   *
   * @param options - Filter configuration
   * @param options.filter - OData filter expression
   * @param options.limit - Maximum results to return
   * @returns Promise resolving to array of matching email messages
   *
   * @example
   * client.initAppAuth();
   * const withAttachments = await client.filterContractsMailbox({
   *   filter: 'hasAttachments eq true',
   *   limit: 50,
   * });
   */
  async filterContractsMailbox(options: {
    filter: string;
    limit?: number;
  }): Promise<EmailMessage[]> {
    if (this.authMode !== "app") {
      throw new Error("filterContractsMailbox requires app authentication");
    }

    return await this.filterEmails({
      filter: options.filter,
      userId: GraphEmailClient.CONTRACTS_MAILBOX,
      limit: options.limit,
    });
  }

  // ============================================================================
  // Org-Wide Search
  // ============================================================================

  /**
   * Get list of active mailboxes in the organization.
   *
   * Probes each user mailbox to verify access and caches the result.
   * Requires app authentication with Mail.Read application permission.
   *
   * @returns Promise resolving to array of accessible mailbox email addresses
   *
   * @example
   * client.initAppAuth();
   * const mailboxes = await client.getActiveMailboxes();
   * // ['user1@example.com', 'user2@example.com', ...]
   */
  async getActiveMailboxes(): Promise<string[]> {
    if (this.authMode !== "app") {
      throw new Error("getActiveMailboxes requires app authentication");
    }

    // Return cached if available
    if (this.activeMailboxCache) {
      return this.activeMailboxCache;
    }

    const client = this.getClient();
    const users = await this.listUsers();
    const active: string[] = [];

    for (const user of users) {
      try {
        // Quick probe - get 1 message with minimal data
        await client
          .api(`/users/${user.email}/messages`)
          .top(1)
          .select("id")
          .get();
        active.push(user.email);
      } catch {
        // Skip inactive mailboxes silently
      }
    }

    this.activeMailboxCache = active;
    return active;
  }

  /**
   * Search across all mailboxes in the organization in parallel.
   *
   * Discovers all active mailboxes and searches each one simultaneously.
   * Requires app authentication with Mail.Read application permission.
   *
   * @param options - Search configuration
   * @param options.query - KQL search query
   * @param options.limit - Maximum results per mailbox (default: 5)
   * @param options.since - Only return emails received after this date
   * @param options.until - Only return emails received before this date
   * @returns Promise resolving to array of results grouped by mailbox (only mailboxes with results)
   *
   * @example
   * client.initAppAuth();
   * const results = await client.searchAllMailboxes({
   *   query: 'DocuSign contract',
   *   limit: 5,
   * });
   * for (const { mailbox, emails } of results) {
   *   console.log(`${mailbox}: ${emails.length} matches`);
   * }
   */
  async searchAllMailboxes(options: {
    query: string;
    limit?: number;
    since?: Date;
    until?: Date;
  }): Promise<Array<{ mailbox: string; emails: EmailMessage[] }>> {
    if (this.authMode !== "app") {
      throw new Error("searchAllMailboxes requires app authentication");
    }

    const mailboxes = await this.getActiveMailboxes();
    return this.searchMailboxes({
      ...options,
      userIds: mailboxes,
    });
  }

  /**
   * Search specific mailboxes in parallel.
   *
   * Searches the specified mailboxes simultaneously and returns results
   * grouped by mailbox. Requires app authentication.
   *
   * @param options - Search configuration
   * @param options.userIds - Array of mailbox email addresses to search
   * @param options.query - KQL search query
   * @param options.limit - Maximum results per mailbox (default: 5)
   * @param options.since - Only return emails received after this date
   * @param options.until - Only return emails received before this date
   * @returns Promise resolving to array of results grouped by mailbox (only mailboxes with results)
   *
   * @example
   * client.initAppAuth();
   * const results = await client.searchMailboxes({
   *   userIds: ['chi@example.com', 'tim@example.com'],
   *   query: 'permit',
   *   limit: 10,
   *   since: new Date('2024-01-01'),
   * });
   * // [{ mailbox: 'chi@example.com', emails: [...] }]
   */
  async searchMailboxes(options: {
    userIds: string[];
    query: string;
    limit?: number;
    since?: Date;
    until?: Date;
  }): Promise<Array<{ mailbox: string; emails: EmailMessage[] }>> {
    if (this.authMode !== "app") {
      throw new Error("searchMailboxes requires app authentication");
    }

    const limit = options.limit ?? 5;
    const searchPromises = options.userIds.map(async (mailbox) => {
      try {
        const emails = await this.searchEmails({
          query: options.query,
          userId: mailbox,
          limit,
          since: options.since,
          until: options.until,
        });
        return { mailbox, emails };
      } catch {
        return { mailbox, emails: [] };
      }
    });

    const results = await Promise.all(searchPromises);
    return results.filter((r) => r.emails.length > 0);
  }

  /**
   * Get all emails in a conversation thread.
   *
   * Returns all emails with the same conversationId, sorted by receivedDateTime
   * (oldest first) for natural reading order.
   *
   * @param conversationId - The conversation ID from an email message
   * @param userId - Email address of the mailbox (required for app auth)
   * @returns Promise resolving to array of email messages in the thread
   *
   * @example
   * const email = await client.getEmail(messageId, userId);
   * if (email?.conversationId) {
   *   const thread = await client.getEmailThread(email.conversationId, userId);
   *   console.log(`Thread has ${thread.length} messages`);
   * }
   */
  async getEmailThread(
    conversationId: string,
    userId?: string
  ): Promise<EmailMessage[]> {
    const client = this.getClient();
    const messagesPath = this.getMessagesPath(userId);

    try {
      // Note: orderby causes "InefficientFilter" error with conversationId filter
      const response = await client
        .api(messagesPath)
        .filter(`conversationId eq '${conversationId}'`)
        .select(
          "id,subject,receivedDateTime,from,toRecipients,ccRecipients,body,hasAttachments,conversationId"
        )
        .get();

      if (!response?.value) {
        return [];
      }

      const emails = this.parseMessagesWithAttachments(response.value);

      // Sort by receivedDateTime ascending (oldest first)
      return emails.sort(
        (a, b) =>
          new Date(a.receivedDateTime).getTime() -
          new Date(b.receivedDateTime).getTime()
      );
    } catch (error) {
      console.error("Error fetching email thread:", error);
      throw error;
    }
  }

  /**
   * Get the full conversation thread for a specific message.
   *
   * Retrieves the email, extracts its conversationId, and returns all
   * messages in that thread.
   *
   * @param messageId - The unique ID of any email in the thread
   * @param userId - Email address of the mailbox (required for app auth)
   * @returns Promise resolving to array of all email messages in the thread
   *
   * @example
   * // Get full thread from a single message ID
   * const thread = await client.getThreadByMessageId('AAMkAGI2...', 'user@example.com');
   * for (const msg of thread) {
   *   console.log(`${msg.fromEmail}: ${msg.subject}`);
   * }
   */
  async getThreadByMessageId(
    messageId: string,
    userId?: string
  ): Promise<EmailMessage[]> {
    const email = await this.getEmail(messageId, userId);
    if (!email?.conversationId) {
      return email ? [email] : [];
    }
    return this.getEmailThread(email.conversationId, userId);
  }

  // ============================================================================
  // Send Email
  // ============================================================================

  /**
   * Build attachment array for Graph API from send options.
   * @param options - Send email options containing attachment(s)
   * @returns Array of attachment objects formatted for Graph API
   */
  private buildAttachments(
    options: SendEmailOptions
  ): Record<string, unknown>[] {
    const attachments: Record<string, unknown>[] = [];

    // Legacy single attachment support
    if (options.attachment) {
      attachments.push({
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: options.attachment.name,
        contentType: options.attachment.contentType,
        contentBytes: options.attachment.contentBytes,
      });
    }

    // Multiple attachments with inline support
    for (const att of options.attachments ?? []) {
      attachments.push({
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: att.name,
        contentType: att.contentType,
        contentBytes: att.contentBytes,
        ...(att.contentId && { contentId: att.contentId }),
        ...(att.isInline && { isInline: true }),
      });
    }

    return attachments;
  }

  /**
   * Require user auth for send operations.
   * App auth doesn't have Mail.Send permission.
   * @throws Error if not using user authentication
   */
  private requireUserAuthForSend(): void {
    if (this.authMode !== "user") {
      throw new Error(
        "Sending emails requires user authentication (delegated). Call initUserAuth() first."
      );
    }
  }

  /**
   * Send an email with optional attachments.
   *
   * Automatically adds a signature and company logo unless skipSignature is true.
   * Requires user authentication (delegated).
   *
   * @param options - Email configuration
   * @param options.to - Array of recipients with email and optional name
   * @param options.cc - Optional array of CC recipients
   * @param options.subject - Email subject line
   * @param options.body - Email body content (plain text or HTML)
   * @param options.bodyType - Body format: 'text' or 'html' (default: 'text')
   * @param options.attachment - Single attachment (legacy, use attachments instead)
   * @param options.attachments - Array of attachments with name, contentType, and base64 contentBytes
   * @param options.skipSignature - Skip automatic signature and logo (default: false)
   * @returns Promise that resolves when email is sent
   *
   * @example
   * await client.initUserAuth();
   * await client.sendEmail({
   *   to: [{ email: 'recipient@example.com', name: 'John Doe' }],
   *   subject: 'Meeting Follow-up',
   *   body: 'Thanks for meeting today. Here are the action items...',
   * });
   *
   * @example
   * // With attachments and no signature
   * await client.sendEmail({
   *   to: [{ email: 'recipient@example.com' }],
   *   cc: [{ email: 'manager@example.com' }],
   *   subject: 'Report Attached',
   *   body: '<h1>Monthly Report</h1><p>Please find attached.</p>',
   *   bodyType: 'html',
   *   skipSignature: true,
   *   attachments: [{
   *     name: 'report.pdf',
   *     contentType: 'application/pdf',
   *     contentBytes: base64EncodedContent,
   *   }],
   * });
   */
  async sendEmail(options: SendEmailOptions): Promise<void> {
    this.requireUserAuthForSend();
    const client = this.getClient();

    // Auto-wrap with signature unless explicitly skipped
    let body = options.body;
    let bodyType = options.bodyType ?? "text";
    const attachments = this.buildAttachments(options);

    if (options.skipSignature !== true) {
      // Wrap body with signature template (always HTML with signature)
      body = await wrapWithSignature(options.body);
      bodyType = "html";

      // Add logo attachment for signature
      const logo = await getLogoAttachment();
      const hasLogo = attachments.some((a) => a.contentId === "logo");
      if (!hasLogo) {
        attachments.push({
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: logo.name,
          contentType: logo.contentType,
          contentBytes: logo.contentBytes,
          contentId: logo.contentId,
          isInline: logo.isInline,
        });
      }
    }

    const message: Record<string, unknown> = {
      subject: options.subject,
      body: {
        contentType: bodyType,
        content: body,
      },
      toRecipients: options.to.map((r) => ({
        emailAddress: { address: r.email, name: r.name ?? r.email },
      })),
    };

    if (options.cc?.length) {
      message.ccRecipients = options.cc.map((r) => ({
        emailAddress: { address: r.email, name: r.name ?? r.email },
      }));
    }

    if (attachments.length > 0) {
      message.attachments = attachments;
    }

    const draftResponse = (await client.api("/me/messages").post(message)) as {
      id: string;
    };

    await client.api(`/me/messages/${draftResponse.id}/send`).post({});
  }

  /**
   * Reply to an email message.
   *
   * Uses the Graph API reply/replyAll endpoint which handles threading
   * automatically. Adds signature unless skipSignature is true.
   * Requires user authentication (delegated).
   *
   * @param options - Reply configuration
   * @param options.messageId - ID of the email to reply to
   * @param options.body - Reply body content
   * @param options.bodyType - Body format: 'text' or 'html' (default: 'text')
   * @param options.replyAll - Reply to all recipients (default: false)
   * @param options.skipSignature - Skip automatic signature (default: false)
   * @returns Promise that resolves when reply is sent
   *
   * @example
   * await client.initUserAuth();
   * await client.replyToEmail({
   *   messageId: 'AAMkAGI2...',
   *   body: 'Thanks for your message. I will follow up tomorrow.',
   * });
   *
   * @example
   * // Reply all
   * await client.replyToEmail({
   *   messageId: 'AAMkAGI2...',
   *   body: 'Adding everyone to this thread.',
   *   replyAll: true,
   * });
   */
  async replyToEmail(options: {
    messageId: string;
    body: string;
    bodyType?: "html" | "text";
    replyAll?: boolean;
    skipSignature?: boolean;
    userId?: string;
  }): Promise<void> {
    this.requireUserAuthForSend();
    const client = this.getClient();
    const action = options.replyAll ? "replyAll" : "reply";

    // Auto-wrap with signature unless explicitly skipped
    let body = options.body;
    let bodyType = options.bodyType ?? "text";
    const attachments: Record<string, unknown>[] = [];

    if (options.skipSignature !== true) {
      body = await wrapWithSignature(options.body);
      bodyType = "html";

      // Add logo attachment for signature
      const logo = await getLogoAttachment();
      attachments.push({
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: logo.name,
        contentType: logo.contentType,
        contentBytes: logo.contentBytes,
        contentId: logo.contentId,
        isInline: logo.isInline,
      });
    }

    const message: Record<string, unknown> = {
      body: {
        contentType: bodyType,
        content: body,
      },
    };

    if (attachments.length > 0) {
      message.attachments = attachments;
    }

    await client
      .api(`/me/messages/${options.messageId}/${action}`)
      .post({ message });
  }

  // ============================================================================
  // Email Management (Archive, Move, Delete, Read/Unread, Flag)
  // ============================================================================

  /**
   * List mail folders for a user.
   *
   * @param userId - Email address of the mailbox (required for app auth)
   * @returns Promise resolving to array of folder objects with id, displayName, and parentFolderId
   *
   * @example
   * const folders = await client.listFolders('user@example.com');
   * const inbox = folders.find(f => f.displayName === 'Inbox');
   */
  async listFolders(
    userId?: string
  ): Promise<
    Array<{ id: string; displayName: string; parentFolderId: string | null }>
  > {
    const client = this.getClient();
    const basePath = this.getBasePath(userId);

    try {
      const response = await client
        .api(`${basePath}/mailFolders`)
        .top(100)
        .get();

      if (!response?.value) {
        return [];
      }

      return response.value.map((folder: Record<string, unknown>) => ({
        id: folder.id as string,
        displayName: folder.displayName as string,
        parentFolderId: (folder.parentFolderId as string) ?? null,
      }));
    } catch (error) {
      console.error("Error listing folders:", error);
      throw error;
    }
  }

  /**
   * Archive an email (move to Archive folder).
   *
   * @param messageId - The unique ID of the email message
   * @param userId - Email address of the mailbox (required for app auth)
   * @returns Promise that resolves when email is archived
   *
   * @example
   * await client.archiveEmail('AAMkAGI2...', 'user@example.com');
   */
  async archiveEmail(messageId: string, userId?: string): Promise<void> {
    const client = this.getClient();
    const basePath = this.getBasePath(userId);

    try {
      await client
        .api(`${basePath}/messages/${messageId}/move`)
        .post({ destinationId: "archive" });
    } catch (error) {
      console.error("Error archiving email:", error);
      throw error;
    }
  }

  /**
   * Move an email to a specific folder.
   *
   * Use listFolders() to get folder IDs, or use well-known folder names.
   *
   * @param messageId - The unique ID of the email message
   * @param destinationId - Folder ID or well-known name: 'inbox', 'drafts', 'sentitems', 'deleteditems', 'archive', 'junkemail'
   * @param userId - Email address of the mailbox (required for app auth)
   * @returns Promise that resolves when email is moved
   *
   * @example
   * // Move to well-known folder
   * await client.moveEmail('AAMkAGI2...', 'archive', 'user@example.com');
   *
   * @example
   * // Move to custom folder by ID
   * const folders = await client.listFolders('user@example.com');
   * const projectFolder = folders.find(f => f.displayName === 'Projects');
   * await client.moveEmail('AAMkAGI2...', projectFolder.id, 'user@example.com');
   */
  async moveEmail(
    messageId: string,
    destinationId: string,
    userId?: string
  ): Promise<void> {
    const client = this.getClient();
    const basePath = this.getBasePath(userId);

    try {
      await client
        .api(`${basePath}/messages/${messageId}/move`)
        .post({ destinationId });
    } catch (error) {
      console.error("Error moving email:", error);
      throw error;
    }
  }

  /**
   * Delete an email (soft delete - moves to Deleted Items).
   *
   * @param messageId - The unique ID of the email message
   * @param userId - Email address of the mailbox (required for app auth)
   * @returns Promise that resolves when email is deleted
   *
   * @example
   * await client.deleteEmail('AAMkAGI2...', 'user@example.com');
   */
  async deleteEmail(messageId: string, userId?: string): Promise<void> {
    const client = this.getClient();
    const basePath = this.getBasePath(userId);
    await client.api(`${basePath}/messages/${messageId}`).delete();
  }

  /**
   * Mark an email as read.
   *
   * @param messageId - The unique ID of the email message
   * @param userId - Email address of the mailbox (required for app auth)
   * @returns Promise that resolves when email is marked as read
   *
   * @example
   * await client.markAsRead('AAMkAGI2...', 'user@example.com');
   */
  async markAsRead(messageId: string, userId?: string): Promise<void> {
    const client = this.getClient();
    const basePath = this.getBasePath(userId);

    try {
      await client
        .api(`${basePath}/messages/${messageId}`)
        .patch({ isRead: true });
    } catch (error) {
      console.error("Error marking email as read:", error);
      throw error;
    }
  }

  /**
   * Mark an email as unread.
   *
   * @param messageId - The unique ID of the email message
   * @param userId - Email address of the mailbox (required for app auth)
   * @returns Promise that resolves when email is marked as unread
   *
   * @example
   * await client.markAsUnread('AAMkAGI2...', 'user@example.com');
   */
  async markAsUnread(messageId: string, userId?: string): Promise<void> {
    const client = this.getClient();
    const basePath = this.getBasePath(userId);

    try {
      await client
        .api(`${basePath}/messages/${messageId}`)
        .patch({ isRead: false });
    } catch (error) {
      console.error("Error marking email as unread:", error);
      throw error;
    }
  }

  /**
   * Flag or unflag an email for follow-up.
   *
   * @param messageId - The unique ID of the email message
   * @param flagStatus - Flag status: 'flagged', 'complete', or 'notFlagged'
   * @param userId - Email address of the mailbox (required for app auth)
   * @returns Promise that resolves when flag status is updated
   *
   * @example
   * // Flag for follow-up
   * await client.flagEmail('AAMkAGI2...', 'flagged', 'user@example.com');
   *
   * @example
   * // Mark as complete
   * await client.flagEmail('AAMkAGI2...', 'complete', 'user@example.com');
   *
   * @example
   * // Remove flag
   * await client.flagEmail('AAMkAGI2...', 'notFlagged', 'user@example.com');
   */
  async flagEmail(
    messageId: string,
    flagStatus: "flagged" | "complete" | "notFlagged",
    userId?: string
  ): Promise<void> {
    const client = this.getClient();
    const basePath = this.getBasePath(userId);

    try {
      await client
        .api(`${basePath}/messages/${messageId}`)
        .patch({ flag: { flagStatus } });
    } catch (error) {
      console.error("Error flagging email:", error);
      throw error;
    }
  }

  // ============================================================================
  // Drafts & Folders (for testing and advanced workflows)
  // ============================================================================

  /**
   * Create a draft email (not sent).
   *
   * @param options - Draft configuration
   * @param options.subject - Email subject line
   * @param options.body - Email body content
   * @param options.bodyType - Body format: 'text' or 'html' (default: 'text')
   * @param options.to - Optional array of recipients
   * @param options.userId - Email address of the mailbox (required for app auth)
   * @returns Promise resolving to object with draft id and subject
   *
   * @example
   * const draft = await client.createDraft({
   *   subject: 'Meeting Notes',
   *   body: 'Here are the notes from today...',
   *   to: [{ email: 'team@example.com' }],
   *   userId: 'user@example.com',
   * });
   * console.log(`Created draft: ${draft.id}`);
   */
  async createDraft(options: {
    subject: string;
    body: string;
    bodyType?: "html" | "text";
    to?: Array<{ email: string; name?: string }>;
    userId?: string;
  }): Promise<{ id: string; subject: string }> {
    const client = this.getClient();
    const basePath = this.getBasePath(options.userId);

    const message: Record<string, unknown> = {
      subject: options.subject,
      body: {
        contentType: options.bodyType ?? "text",
        content: options.body,
      },
    };

    if (options.to?.length) {
      message.toRecipients = options.to.map((r) => ({
        emailAddress: { address: r.email, name: r.name ?? r.email },
      }));
    }

    try {
      const response = await client.api(`${basePath}/messages`).post(message);
      return {
        id: response.id as string,
        subject: response.subject as string,
      };
    } catch (error) {
      console.error("Error creating draft:", error);
      throw error;
    }
  }

  /**
   * Send an existing draft.
   *
   * Requires user authentication (delegated).
   *
   * @param draftId - The ID of the draft message to send
   * @returns Promise that resolves when draft is sent
   *
   * @example
   * await client.initUserAuth();
   * const draft = await client.createDraft({ subject: 'Test', body: 'Hello' });
   * await client.sendDraft(draft.id);
   */
  async sendDraft(draftId: string): Promise<void> {
    this.requireUserAuthForSend();
    const client = this.getClient();

    try {
      await client.api(`/me/messages/${draftId}/send`).post({});
    } catch (error) {
      console.error("Error sending draft:", error);
      throw error;
    }
  }

  /**
   * Create a mail folder.
   *
   * @param displayName - Name for the new folder
   * @param userId - Email address of the mailbox (required for app auth)
   * @param parentFolderId - Optional parent folder ID (creates at root if omitted)
   * @returns Promise resolving to object with folder id and displayName
   *
   * @example
   * // Create at root level
   * const folder = await client.createFolder('Projects', 'user@example.com');
   *
   * @example
   * // Create as subfolder
   * const parent = await client.createFolder('Clients', 'user@example.com');
   * const child = await client.createFolder('Acme Corp', 'user@example.com', parent.id);
   */
  async createFolder(
    displayName: string,
    userId?: string,
    parentFolderId?: string
  ): Promise<{ id: string; displayName: string }> {
    const client = this.getClient();
    const basePath = this.getBasePath(userId);
    const apiPath = parentFolderId
      ? `${basePath}/mailFolders/${parentFolderId}/childFolders`
      : `${basePath}/mailFolders`;

    try {
      const response = await client.api(apiPath).post({ displayName });
      return {
        id: response.id as string,
        displayName: response.displayName as string,
      };
    } catch (error) {
      console.error("Error creating folder:", error);
      throw error;
    }
  }

  /**
   * Delete a mail folder.
   *
   * Note: Cannot delete well-known folders (Inbox, Sent Items, etc.).
   *
   * @param folderId - The ID of the folder to delete
   * @param userId - Email address of the mailbox (required for app auth)
   * @returns Promise that resolves when folder is deleted
   *
   * @example
   * await client.deleteFolder('AAMkAGI2...', 'user@example.com');
   */
  async deleteFolder(folderId: string, userId?: string): Promise<void> {
    const client = this.getClient();
    const basePath = this.getBasePath(userId);

    try {
      await client.api(`${basePath}/mailFolders/${folderId}`).delete();
    } catch (error) {
      console.error("Error deleting folder:", error);
      throw error;
    }
  }

  /**
   * Forward an email to one or more recipients.
   *
   * Requires user authentication (delegated).
   *
   * @param messageId - The ID of the email to forward
   * @param to - Array of recipients with email and optional name
   * @param comment - Optional comment to add above the forwarded content
   * @returns Promise that resolves when email is forwarded
   *
   * @example
   * await client.initUserAuth();
   * await client.forwardEmail(
   *   'AAMkAGI2...',
   *   [{ email: 'colleague@example.com', name: 'John' }],
   *   'FYI - see the thread below.'
   * );
   */
  async forwardEmail(
    messageId: string,
    to: Array<{ email: string; name?: string }>,
    comment?: string
  ): Promise<void> {
    this.requireUserAuthForSend();
    const client = this.getClient();

    const body: Record<string, unknown> = {
      toRecipients: to.map((r) => ({
        emailAddress: { address: r.email, name: r.name ?? r.email },
      })),
    };

    if (comment) {
      body.comment = comment;
    }

    try {
      await client.api(`/me/messages/${messageId}/forward`).post(body);
    } catch (error) {
      console.error("Error forwarding email:", error);
      throw error;
    }
  }

  /**
   * Get a message's read status and flag status.
   *
   * Useful for verification in tests or checking email state.
   *
   * @param messageId - The unique ID of the email message
   * @param userId - Email address of the mailbox (required for app auth)
   * @returns Promise resolving to object with isRead and flagStatus, or null if not found
   *
   * @example
   * const status = await client.getMessageStatus('AAMkAGI2...', 'user@example.com');
   * if (status) {
   *   console.log(`Read: ${status.isRead}, Flag: ${status.flagStatus}`);
   * }
   */
  async getMessageStatus(
    messageId: string,
    userId?: string
  ): Promise<{ isRead: boolean; flagStatus: string } | null> {
    const client = this.getClient();
    const basePath = this.getBasePath(userId);

    try {
      const msg = await client
        .api(`${basePath}/messages/${messageId}`)
        .select("isRead,flag")
        .get();

      return {
        isRead: msg.isRead as boolean,
        flagStatus: (msg.flag?.flagStatus as string) ?? "notFlagged",
      };
    } catch (error) {
      console.error("Error getting message status:", error);
      return null;
    }
  }
}
