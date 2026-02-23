/**
 * Folder management module for Outlook MCP server
 */

import type { MCPResponse, ToolDefinition } from "@outlook/auth/tools";
import handleCreateFolder from "@outlook/folder/create";
import handleListFolders from "@outlook/folder/list";
import handleMoveEmails from "@outlook/folder/move";

export const folderTools: ToolDefinition[] = [
  {
    name: "list-folders",
    description: "Lists mail folders in your Outlook account",
    inputSchema: {
      type: "object",
      properties: {
        mailbox: {
          type: "string",
          description:
            "Mailbox email address to operate on (e.g., 'chi@desertservices.net')",
        },
        includeItemCounts: {
          type: "boolean",
          description: "Include counts of total and unread items",
        },
        includeChildren: {
          type: "boolean",
          description: "Include child folders in hierarchy",
        },
      },
      required: ["mailbox"],
      additionalProperties: false,
    },
    handler: handleListFolders as (
      args: Record<string, unknown>
    ) => Promise<MCPResponse>,
  },
  {
    name: "create-folder",
    description: "Creates a new mail folder",
    inputSchema: {
      type: "object",
      properties: {
        mailbox: {
          type: "string",
          description:
            "Mailbox email address to operate on (e.g., 'chi@desertservices.net')",
        },
        name: {
          type: "string",
          description: "Name of the folder to create",
        },
        parentFolder: {
          type: "string",
          description: "Optional parent folder name (default is root)",
        },
      },
      required: ["mailbox", "name"],
      additionalProperties: false,
    },
    handler: handleCreateFolder as unknown as (
      args: Record<string, unknown>
    ) => Promise<MCPResponse>,
  },
  {
    name: "move-emails",
    description: "Moves emails from one folder to another",
    inputSchema: {
      type: "object",
      properties: {
        mailbox: {
          type: "string",
          description:
            "Mailbox email address to operate on (e.g., 'chi@desertservices.net')",
        },
        emailIds: {
          type: "string",
          description: "Comma-separated list of email IDs to move",
        },
        targetFolder: {
          type: "string",
          description: "Name of the folder to move emails to",
        },
        sourceFolder: {
          type: "string",
          description: "Optional name of the source folder (default is inbox)",
        },
      },
      required: ["mailbox", "emailIds", "targetFolder"],
      additionalProperties: false,
    },
    handler: handleMoveEmails as unknown as (
      args: Record<string, unknown>
    ) => Promise<MCPResponse>,
  },
];
