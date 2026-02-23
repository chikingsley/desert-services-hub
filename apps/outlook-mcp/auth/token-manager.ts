/**
 * Token management using client credentials flow (app-only auth)
 * No user interaction required - uses tenant/client/secret from .env
 */
import config from "@outlook/config";

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface CachedToken {
  access_token: string;
  expires_at: number;
}

let cachedToken: CachedToken | null = null;

/**
 * Fetches a new access token using client credentials flow
 */
async function fetchAccessToken(): Promise<CachedToken> {
  const { tenantId, clientId, clientSecret, scopes } = config.AUTH_CONFIG;

  if (!(tenantId && clientId && clientSecret)) {
    throw new Error(
      "Missing credentials. Set MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET in .env"
    );
  }

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: scopes.join(" "),
      grant_type: "client_credentials",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get token: ${response.status} ${error}`);
  }

  const data = (await response.json()) as TokenResponse;

  cachedToken = {
    access_token: data.access_token,
    expires_at: Date.now() + data.expires_in * 1000 - 60_000, // 1 min buffer
  };

  return cachedToken;
}

/**
 * Gets access token, fetching new one if expired
 */
export async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expires_at) {
    return cachedToken.access_token;
  }

  const token = await fetchAccessToken();
  return token.access_token;
}

/**
 * Loads token cache (for backwards compat - now auto-fetches)
 */
export async function loadTokenCache(): Promise<CachedToken | null> {
  if (!cachedToken) {
    try {
      cachedToken = await fetchAccessToken();
    } catch {
      return null;
    }
  }
  return cachedToken;
}

/**
 * No-op for backwards compat
 */
export function saveTokenCache(): boolean {
  return true;
}

/**
 * Test tokens for test mode
 */
export function createTestTokens(): CachedToken {
  cachedToken = {
    access_token: `test_access_token_${Date.now()}`,
    expires_at: Date.now() + 3600 * 1000,
  };
  return cachedToken;
}

export default {
  loadTokenCache,
  saveTokenCache,
  getAccessToken,
  createTestTokens,
};
