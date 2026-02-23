/**
 * Authentication-related tools for the Outlook MCP server
 */

import tokenManager from "@outlook/auth/token-manager";
import config from "@outlook/config";

export interface MCPContent {
  text: string;
  type: "text";
}

export interface MCPResponse {
  content: MCPContent[];
  isError?: boolean;
}

export interface AuthenticateArgs {
  force?: boolean;
}

export interface ToolDefinition {
  description: string;
  handler: (args: Record<string, unknown>) => Promise<MCPResponse>;
  inputSchema: {
    type: string;
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties?: boolean;
  };
  name: string;
}

/**
 * About tool handler
 */
export function handleAbout(): Promise<MCPResponse> {
  return Promise.resolve({
    content: [
      {
        type: "text",
        text: `MODULAR Outlook Assistant MCP Server v${config.SERVER_VERSION}\n\nProvides access to Microsoft Outlook email, calendar, and contacts through Microsoft Graph API.\nImplemented with a modular architecture for improved maintainability.`,
      },
    ],
  });
}

/**
 * Authentication tool handler - verifies app credentials work
 */
export async function handleAuthenticate(
  args?: AuthenticateArgs
): Promise<MCPResponse> {
  const _force = args?.force === true;

  if (config.USE_TEST_MODE) {
    await tokenManager.createTestTokens();
    return {
      content: [
        {
          type: "text",
          text: "Successfully authenticated with Microsoft Graph API (test mode)",
        },
      ],
    };
  }

  try {
    const token = await tokenManager.getAccessToken();
    if (token) {
      return {
        content: [
          {
            type: "text",
            text: "Successfully authenticated with Microsoft Graph API using app credentials",
          },
        ],
      };
    }
    return {
      content: [
        {
          type: "text",
          text: "Authentication failed. Check MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET in .env",
        },
      ],
      isError: true,
    };
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: `Authentication failed: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Check authentication status tool handler
 */
export async function handleCheckAuthStatus(): Promise<MCPResponse> {
  console.error("[CHECK-AUTH-STATUS] Starting authentication status check");

  const tokens = await tokenManager.loadTokenCache();

  console.error(`[CHECK-AUTH-STATUS] Tokens loaded: ${tokens ? "YES" : "NO"}`);

  if (!tokens?.access_token) {
    console.error("[CHECK-AUTH-STATUS] No valid access token found");
    return {
      content: [{ type: "text", text: "Not authenticated" }],
    };
  }

  console.error("[CHECK-AUTH-STATUS] Access token present");
  console.error(`[CHECK-AUTH-STATUS] Token expires at: ${tokens.expires_at}`);
  console.error(`[CHECK-AUTH-STATUS] Current time: ${Date.now()}`);

  return {
    content: [{ type: "text", text: "Authenticated and ready" }],
  };
}

export const authTools: ToolDefinition[] = [
  {
    name: "about",
    description: "Returns information about this Outlook Assistant server",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    handler: handleAbout,
  },
  {
    name: "authenticate",
    description: "Authenticate with Microsoft Graph API to access Outlook data",
    inputSchema: {
      type: "object",
      properties: {
        force: {
          type: "boolean",
          description: "Force re-authentication even if already authenticated",
        },
      },
      required: [],
      additionalProperties: false,
    },
    handler: handleAuthenticate as (
      args: Record<string, unknown>
    ) => Promise<MCPResponse>,
  },
  {
    name: "check-auth-status",
    description:
      "Check the current authentication status with Microsoft Graph API",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
    handler: handleCheckAuthStatus,
  },
];

export default {
  authTools,
  handleAbout,
  handleAuthenticate,
  handleCheckAuthStatus,
};
