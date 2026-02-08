/**
 * Microsoft Graph API token acquisition.
 *
 * Shared across Cloudflare Workers (stateless) and Bun processes (cached).
 * Uses raw fetch — no SDK dependency.
 */

const TOKEN_URL_BASE = "https://login.microsoftonline.com";
const GRAPH_SCOPE = "https://graph.microsoft.com/.default";

/**
 * Fetch a Graph API access token via client_credentials grant.
 * Stateless — no caching. Suitable for Cloudflare Workers.
 */
export async function getGraphToken(
  tenantId: string,
  clientId: string,
  clientSecret: string
): Promise<string> {
  const res = await fetch(`${TOKEN_URL_BASE}/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: GRAPH_SCOPE,
      grant_type: "client_credentials",
    }).toString(),
  });

  if (!res.ok) {
    throw new Error(`Graph token request failed: ${res.status}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  return data.access_token;
}

/**
 * Cached token acquisition for long-running Bun processes.
 * Reads credentials from process.env and caches token until 5 min before expiry.
 */
let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getGraphTokenCached(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 300_000) {
    return cachedToken.token;
  }

  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;

  if (!(tenantId && clientId && clientSecret)) {
    throw new Error(
      "Missing AZURE_TENANT_ID, AZURE_CLIENT_ID, or AZURE_CLIENT_SECRET"
    );
  }

  const res = await fetch(`${TOKEN_URL_BASE}/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: GRAPH_SCOPE,
      grant_type: "client_credentials",
    }).toString(),
  });

  if (!res.ok) {
    throw new Error(
      `Graph token request failed: ${res.status} ${await res.text()}`
    );
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };

  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return data.access_token;
}

/** Invalidate the cached token (e.g. after a 401). */
export function clearTokenCache(): void {
  cachedToken = null;
}
