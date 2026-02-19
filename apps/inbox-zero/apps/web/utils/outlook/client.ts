import { Client } from "@microsoft/microsoft-graph-client";
import type { User } from "@microsoft/microsoft-graph-types";
import { saveTokens } from "@/utils/auth";
import { cleanupInvalidTokens } from "@/utils/auth/cleanup-invalid-tokens";
import { env } from "@/env";
import type { Logger } from "@/utils/logger";
import { SCOPES } from "@/utils/outlook/scopes";
import { SafeError } from "@/utils/error";

// Add buffer time to prevent token expiry during long-running operations
const TOKEN_REFRESH_BUFFER_MS = 10 * 60 * 1000; // 10 minutes
const APP_TOKEN_SCOPE = "https://graph.microsoft.com/.default";
const APP_TOKEN_REFRESH_BUFFER_MS = 2 * 60 * 1000;
let cachedAppOnlyToken: { token: string; expiresAt: number } | null = null;

type OutlookClientOptions = {
  appOnly?: boolean;
  mailbox?: string | null;
};

// Wrapper class to hold both the Microsoft Graph client and its access token
export class OutlookClient {
  private readonly client: Client;
  private readonly accessToken: string;
  private readonly logger: Logger;
  private folderIdCache: Record<string, string> | null = null;
  private categoryMapCache: Map<string, string> | null = null;

  constructor(
    accessToken: string,
    logger: Logger,
    options?: OutlookClientOptions,
  ) {
    this.accessToken = accessToken;
    this.logger = logger;
    const rawClient = Client.init({
      authProvider: (done) => {
        done(null, this.accessToken);
      },
      defaultVersion: "v1.0",
      // Use immutable IDs to ensure message IDs remain stable
      // https://learn.microsoft.com/en-us/graph/outlook-immutable-id
      fetchOptions: {
        headers: {
          Prefer: 'IdType="ImmutableId"',
        },
      },
    });

    const mailbox = options?.mailbox?.trim().toLowerCase();
    if (options?.appOnly && mailbox) {
      this.client = createMailboxScopedClient(rawClient, mailbox);
      return;
    }

    this.client = rawClient;
  }

  getClient(): Client {
    return this.client;
  }

  getAccessToken(): string {
    return this.accessToken;
  }

  getFolderIdCache(): Record<string, string> | null {
    return this.folderIdCache;
  }

  setFolderIdCache(cache: Record<string, string>): void {
    this.folderIdCache = cache;
  }

  getCategoryMapCache(): Map<string, string> | null {
    return this.categoryMapCache;
  }

  setCategoryMapCache(cache: Map<string, string>): void {
    this.categoryMapCache = cache;
  }

  invalidateCategoryMapCache(): void {
    this.categoryMapCache = null;
  }

  // Helper methods for common operations
  async getUserProfile(): Promise<User> {
    return await this.client
      .api("/me")
      .select("id,displayName,mail,userPrincipalName")
      .get();
  }

  async getUserPhoto(): Promise<string | null> {
    try {
      const photoResponse = await this.client.api("/me/photo/$value").get();

      if (photoResponse) {
        const arrayBuffer = await photoResponse.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString("base64");
        return `data:image/jpeg;base64,${base64}`;
      }
      return null;
    } catch {
      this.logger.warn("Error getting user photo");
      return null;
    }
  }
}

// Helper to create OutlookClient instance
export const createOutlookClient = (
  accessToken: string,
  logger: Logger,
  options?: OutlookClientOptions,
) => {
  if (!accessToken) throw new SafeError("No access token provided");
  return new OutlookClient(accessToken, logger, options);
};

// Similar to Gmail's getGmailClientWithRefresh
export const getOutlookClientWithRefresh = async ({
  accessToken,
  refreshToken,
  expiresAt,
  emailAccountId,
  mailboxEmail,
  logger,
}: {
  accessToken?: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  emailAccountId: string;
  mailboxEmail?: string | null;
  logger: Logger;
}): Promise<OutlookClient> => {
  const appOnlyMailbox = getAppOnlyMailbox(mailboxEmail);

  if (!refreshToken) {
    if (isAppOnlyModeEnabled() && appOnlyMailbox) {
      const appToken = await getAppOnlyAccessToken(logger);
      return createOutlookClient(appToken, logger, {
        appOnly: true,
        mailbox: appOnlyMailbox,
      });
    }

    logger.error("No refresh token", { emailAccountId });
    throw new SafeError("No refresh token");
  }

  // Check if token needs refresh
  const expiryDate = expiresAt ? expiresAt : null;
  if (
    accessToken &&
    expiryDate &&
    expiryDate > Date.now() + TOKEN_REFRESH_BUFFER_MS
  ) {
    return createOutlookClient(accessToken, logger);
  }

  // Refresh token
  try {
    if (!env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET) {
      throw new Error("Microsoft login not enabled - missing credentials");
    }

    const response = await fetch(
      `https://login.microsoftonline.com/${env.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: env.MICROSOFT_CLIENT_ID,
          client_secret: env.MICROSOFT_CLIENT_SECRET,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      },
    );

    const tokens = await response.json();

    if (!response.ok) {
      const errorMessage =
        tokens.error_description || "Failed to refresh token";

      // AADSTS7000215 = Invalid client secret
      // Happens when Azure AD client secret rotates or refresh token expires
      // Background processes (watch-manager) will catch and log this as a warning
      // User-facing flows will show an error prompting reconnection
      if (errorMessage.includes("AADSTS7000215")) {
        logger.warn(
          "Microsoft refresh token failed - user may need to reconnect",
          {
            emailAccountId,
          },
        );
      }

      // Microsoft identity platform errors that require user re-authentication:
      // AADSTS70000 = Scopes unauthorized or expired
      // AADSTS70008 = Refresh token expired due to inactivity
      // AADSTS70011 = Invalid scope
      // AADSTS700082 = Refresh token expired
      // AADSTS50173 = Invalid grant (refresh token revoked)
      // AADSTS65001 = User hasn't consented to permissions
      // AADSTS500011 = Resource principal not found (scope issue)
      // AADSTS54005 = Authorization code already redeemed
      // AADSTS50076 = MFA required (Conditional Access policy)
      // AADSTS50079 = MFA registration required
      // AADSTS50158 = External security challenge not satisfied
      // invalid_grant = General token refresh failure
      const requiresReauth =
        errorMessage.includes("AADSTS70000") ||
        errorMessage.includes("AADSTS70008") ||
        errorMessage.includes("AADSTS70011") ||
        errorMessage.includes("AADSTS700082") ||
        errorMessage.includes("AADSTS50173") ||
        errorMessage.includes("AADSTS65001") ||
        errorMessage.includes("AADSTS500011") ||
        errorMessage.includes("AADSTS54005") ||
        errorMessage.includes("AADSTS50076") ||
        errorMessage.includes("AADSTS50079") ||
        errorMessage.includes("AADSTS50158") ||
        errorMessage.includes("invalid_grant");

      if (requiresReauth) {
        logger.warn(
          "Microsoft authorization expired - user needs to reconnect",
          {
            emailAccountId,
            errorMessage,
          },
        );

        await cleanupInvalidTokens({
          emailAccountId,
          reason: "invalid_grant",
          logger,
        });

        throw new SafeError(
          "Your Microsoft authorization has expired. Please sign out and log in again to reconnect your account.",
        );
      }

      throw new Error(errorMessage);
    }

    // Save new tokens
    await saveTokens({
      tokens: {
        access_token: tokens.access_token,
        expires_at: Math.floor(Date.now() / 1000 + tokens.expires_in),
      },
      accountRefreshToken: refreshToken,
      emailAccountId,
      provider: "microsoft",
    });

    return createOutlookClient(tokens.access_token, logger);
  } catch (error) {
    const isInvalidGrantError =
      error instanceof Error &&
      (error.message.includes("invalid_grant") ||
        error.message.includes("AADSTS50173"));

    if (isInvalidGrantError) {
      logger.warn("Error refreshing Outlook access token", { error });
    }

    throw error;
  }
};

export const getAccessTokenFromClient = (client: OutlookClient): string => {
  return client.getAccessToken();
};

// Helper function to get the OAuth2 URL for linking accounts
export function getLinkingOAuth2Url() {
  if (!env.MICROSOFT_CLIENT_ID) {
    throw new Error("Microsoft login not enabled - missing client ID");
  }

  const baseUrl = `https://login.microsoftonline.com/${env.MICROSOFT_TENANT_ID}/oauth2/v2.0/authorize`;
  const params = new URLSearchParams({
    client_id: env.MICROSOFT_CLIENT_ID,
    response_type: "code",
    redirect_uri: `${env.NEXT_PUBLIC_BASE_URL}/api/outlook/linking/callback`,
    scope: SCOPES.join(" "),
    // we can't use select_account because we need a new refresh token if the users is stale
    prompt: "consent",
  });

  return `${baseUrl}?${params.toString()}`;
}

// Helper types for common Microsoft Graph operations
export type { Client as GraphClient };

function createMailboxScopedClient(client: Client, mailbox: string): Client {
  const mailboxPath = `/users/${encodeURIComponent(mailbox)}`;
  const proxied = new Proxy(client, {
    get(target, prop, receiver) {
      if (prop !== "api") return Reflect.get(target, prop, receiver);

      return (path: string) => target.api(rewriteMeEndpoint(path, mailboxPath));
    },
  });

  return proxied as Client;
}

function rewriteMeEndpoint(path: string, mailboxPath: string): string {
  const mePattern = /^\/me(?=\/|$)/;
  if (mePattern.test(path)) {
    return path.replace(mePattern, mailboxPath);
  }

  const absoluteV1MePattern =
    /https:\/\/graph\.microsoft\.com\/v1\.0\/me(?=\/|$)/;
  if (absoluteV1MePattern.test(path)) {
    return path.replace(
      absoluteV1MePattern,
      `https://graph.microsoft.com/v1.0${mailboxPath}`,
    );
  }

  const absoluteBetaMePattern =
    /https:\/\/graph\.microsoft\.com\/beta\/me(?=\/|$)/;
  if (absoluteBetaMePattern.test(path)) {
    return path.replace(
      absoluteBetaMePattern,
      `https://graph.microsoft.com/beta${mailboxPath}`,
    );
  }

  return path;
}

function isAppOnlyModeEnabled() {
  return process.env.INBOXZERO_OUTLOOK_APP_ONLY === "true";
}

function getAppOnlyMailbox(mailboxEmail?: string | null) {
  const explicitMailbox = mailboxEmail?.trim().toLowerCase();
  if (explicitMailbox) return explicitMailbox;

  const configuredMailbox =
    process.env.INBOXZERO_APP_MAILBOX?.trim().toLowerCase();
  if (configuredMailbox) return configuredMailbox;

  return null;
}

async function getAppOnlyAccessToken(logger: Logger) {
  if (!env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET) {
    throw new SafeError("Microsoft app credentials not configured");
  }

  const now = Date.now();
  if (
    cachedAppOnlyToken &&
    now < cachedAppOnlyToken.expiresAt - APP_TOKEN_REFRESH_BUFFER_MS
  ) {
    return cachedAppOnlyToken.token;
  }

  const response = await fetch(
    `https://login.microsoftonline.com/${env.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: env.MICROSOFT_CLIENT_ID,
        client_secret: env.MICROSOFT_CLIENT_SECRET,
        scope: APP_TOKEN_SCOPE,
        grant_type: "client_credentials",
      }),
    },
  );

  const tokenResponse = (await response.json()) as {
    access_token?: string;
    expires_in?: number | string;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !tokenResponse.access_token) {
    logger.error("Failed to fetch Microsoft app-only token", {
      status: response.status,
      error: tokenResponse.error,
      errorDescription: tokenResponse.error_description,
    });
    throw new SafeError(
      tokenResponse.error_description || "Failed to fetch app-only token",
    );
  }

  const expiresIn =
    typeof tokenResponse.expires_in === "string"
      ? Number.parseInt(tokenResponse.expires_in, 10)
      : tokenResponse.expires_in || 3600;

  cachedAppOnlyToken = {
    token: tokenResponse.access_token,
    expiresAt: now + expiresIn * 1000,
  };

  return tokenResponse.access_token;
}
