/**
 * Shared Microsoft Graph API helpers for Trigger.dev tasks.
 *
 * Centralises token acquisition and HTTP fetching so that
 * email-sync, attachment-intake, and future tasks can reuse them.
 */

const GRAPH_API_BASE = "https://graph.microsoft.com/v1.0";
const TOKEN_URL_TEMPLATE =
  "https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token";

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

export async function getGraphToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.accessToken;
  }

  const tenantId = process.env.AZURE_TENANT_ID;
  const clientId = process.env.AZURE_CLIENT_ID;
  const clientSecret = process.env.AZURE_CLIENT_SECRET;

  if (!(tenantId && clientId && clientSecret)) {
    throw new Error(
      "Missing Azure credentials (AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET)"
    );
  }

  const url = TOKEN_URL_TEMPLATE.replace("{tenantId}", tenantId);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token fetch failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };

  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000 - 60_000,
  };

  return cachedToken.accessToken;
}

function resolveUrl(path: string): string {
  return path.startsWith("https://") ? path : `${GRAPH_API_BASE}/${path}`;
}

/** JSON GET — for metadata, email messages, attachment listings. */
export async function graphGet<T>(path: string): Promise<T> {
  const token = await getGraphToken();
  const res = await fetch(resolveUrl(path), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph API ${res.status}: ${text}`);
  }

  return (await res.json()) as T;
}

/** Binary GET — for attachment $value endpoint (raw bytes). */
export async function graphGetBinary(path: string): Promise<Buffer> {
  const token = await getGraphToken();
  const res = await fetch(resolveUrl(path), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph API ${res.status}: ${text}`);
  }

  return Buffer.from(await res.arrayBuffer());
}
