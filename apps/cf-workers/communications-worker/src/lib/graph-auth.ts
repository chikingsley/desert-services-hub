export interface GraphAuthEnv {
  AZURE_TENANT_ID: string;
  AZURE_CLIENT_ID: string;
  AZURE_CLIENT_SECRET: string;
}

const TOKEN_URL_TEMPLATE = "https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token";

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

const requireEnvValue = (value: string | undefined, key: string): string => {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`Missing ${key}`);
  }

  return normalized;
};

export const getGraphToken = async (env: GraphAuthEnv): Promise<string> => {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.accessToken;
  }

  const tenantId = requireEnvValue(env.AZURE_TENANT_ID, "AZURE_TENANT_ID");
  const clientId = requireEnvValue(env.AZURE_CLIENT_ID, "AZURE_CLIENT_ID");
  const clientSecret = requireEnvValue(env.AZURE_CLIENT_SECRET, "AZURE_CLIENT_SECRET");

  const tokenUrl = TOKEN_URL_TEMPLATE.replace("{tenantId}", tenantId);
  const response = await fetch(tokenUrl, {
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
      scope: "https://graph.microsoft.com/.default",
    }),
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    method: "POST",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Token fetch failed: ${response.status} ${body}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000 - 60_000,
  };

  return cachedToken.accessToken;
};
