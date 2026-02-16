import { GraphEmailClient } from "@email/client";

export function createClient(): GraphEmailClient {
  const client = new GraphEmailClient({
    azureClientId: process.env.AZURE_CLIENT_ID ?? "",
    azureClientSecret: process.env.AZURE_CLIENT_SECRET ?? "",
    azureTenantId: process.env.AZURE_TENANT_ID ?? "",
  });
  client.initAppAuth();
  return client;
}
