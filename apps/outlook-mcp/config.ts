/**
 * Configuration for Outlook MCP Server
 */

import os from "node:os";
import path from "node:path";
import type { Config } from "@outlook/types";

const homeDir = process.env.HOME ?? os.homedir() ?? "/tmp";

export const SERVER_NAME = "outlook-assistant";
export const SERVER_VERSION = "1.0.0";
export const USE_TEST_MODE = process.env.USE_TEST_MODE === "true";
export const GRAPH_API_ENDPOINT = "https://graph.microsoft.com/v1.0/";
export const EMAIL_SELECT_FIELDS =
  "id,subject,from,toRecipients,ccRecipients,receivedDateTime,bodyPreview,hasAttachments,importance,isRead";
export const EMAIL_DETAIL_FIELDS =
  "id,conversationId,subject,from,toRecipients,ccRecipients,bccRecipients,receivedDateTime,bodyPreview,body,hasAttachments,importance,isRead,internetMessageHeaders";
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_RESULT_COUNT = 50;
export const DEFAULT_TIMEZONE = "Central European Standard Time";

export const AUTH_CONFIG = {
  tenantId: process.env.AZURE_TENANT_ID ?? "",
  clientId: process.env.AZURE_CLIENT_ID ?? "",
  clientSecret: process.env.AZURE_CLIENT_SECRET ?? "",
  scopes: ["https://graph.microsoft.com/.default"],
  tokenStorePath: path.join(homeDir, ".outlook-mcp-tokens.json"),
};

const config: Config = {
  SERVER_NAME,
  SERVER_VERSION,
  USE_TEST_MODE,
  AUTH_CONFIG,
  GRAPH_API_ENDPOINT,
  EMAIL_SELECT_FIELDS,
  EMAIL_DETAIL_FIELDS,
  DEFAULT_PAGE_SIZE,
  MAX_RESULT_COUNT,
  DEFAULT_TIMEZONE,
};

export default config;
