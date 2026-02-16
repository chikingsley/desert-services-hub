/**
 * AI Tool Schemas
 *
 * Exports all command schemas as JSON Schema for AI tool calling.
 * These schemas can be used with OpenAI, Claude, and other AI platforms
 * that support function/tool calling.
 *
 * Usage:
 *   import { toolSchemas, tools } from "@/commands/tools";
 *
 *   // Get JSON Schema for all tools
 *   const schemas = toolSchemas;
 *
 *   // Execute a tool by name
 *   const result = await tools.renew({ permitId: "D0058823", companyName: "..." });
 */

import type { CloseInput } from "@/handlers/close";
import { closePermit, closeSchema } from "@/handlers/close";
import type { CreateInput } from "@/handlers/create";
import { createPermit, createSchema } from "@/handlers/create";
import type { DeleteInput } from "@/handlers/delete";
import { deleteDrafts, deleteSchema } from "@/handlers/delete";
import type { ListInput } from "@/handlers/list";
import { listPermits, listSchema } from "@/handlers/list";
import type { RenewInput } from "@/handlers/renew";
import { renewPermit, renewSchema } from "@/handlers/renew";
import type { ReviseInput } from "@/handlers/revise";
import { revisePermit, reviseSchema } from "@/handlers/revise";
import type { SyncInput } from "@/handlers/sync";
import { syncPermits, syncSchema } from "@/handlers/sync";

// Type assertion helper for zod v4 compatibility with zod-to-json-schema
// Note: zod-to-json-schema doesn't fully support zod v4 yet
function toJsonSchema(schema: unknown, name: string): Record<string, unknown> {
  try {
    // Dynamic import to avoid TypeScript checking the incompatible types
    const { zodToJsonSchema } = require("zod-to-json-schema") as {
      zodToJsonSchema: (
        schema: unknown,
        name: string
      ) => Record<string, unknown>;
    };
    return zodToJsonSchema(schema, name);
  } catch {
    // Fallback: return a basic schema structure
    return {
      $ref: `#/definitions/${name}`,
      $schema: "http://json-schema.org/draft-07/schema#",
      definitions: {
        [name]: { type: "object" },
      },
    };
  }
}

/**
 * Tool definitions for AI function calling
 */
export const toolDefinitions = {
  close: {
    name: "close_permit",
    description:
      "Close an existing dust permit. Use this when a project is complete and the permit is no longer needed.",
    schema: closeSchema,
  },
  create: {
    name: "create_permit",
    description:
      "Create a new dust permit application. Requires specifying the flow type (new-company or existing-company) and form data.",
    schema: createSchema,
  },
  delete: {
    name: "delete_drafts",
    description:
      "Delete all draft dust permit applications. This is a destructive operation that removes all drafts.",
    schema: deleteSchema,
  },
  list: {
    name: "list_permits",
    description:
      "List permits from the database. Can filter by status (active, expiring), company, or get a single permit by ID.",
    schema: listSchema,
  },
  renew: {
    name: "renew_permit",
    description:
      "Renew an existing dust permit by creating a new application that copies from the existing permit. The end date automatically advances by one year when copying.",
    schema: renewSchema,
  },
  revise: {
    name: "revise_permit",
    description:
      "Revise an existing dust permit to make changes (boundary, acreage, contact, schedule, BMP). Revisions edit the permit in-place and do NOT extend the expiration date.",
    schema: reviseSchema,
  },
  sync: {
    name: "sync_permits",
    description:
      "Sync permit data from CSV exports to SQLite databases. Use for keeping local database up to date with portal exports.",
    schema: syncSchema,
  },
} as const;

/**
 * JSON Schema representations of all tools (for AI tool calling)
 */
export const toolSchemas = {
  close: {
    name: toolDefinitions.close.name,
    description: toolDefinitions.close.description,
    parameters: toJsonSchema(closeSchema, "closeSchema"),
  },
  create: {
    name: toolDefinitions.create.name,
    description: toolDefinitions.create.description,
    parameters: toJsonSchema(createSchema, "createSchema"),
  },
  delete: {
    name: toolDefinitions.delete.name,
    description: toolDefinitions.delete.description,
    parameters: toJsonSchema(deleteSchema, "deleteSchema"),
  },
  list: {
    name: toolDefinitions.list.name,
    description: toolDefinitions.list.description,
    parameters: toJsonSchema(listSchema, "listSchema"),
  },
  renew: {
    name: toolDefinitions.renew.name,
    description: toolDefinitions.renew.description,
    parameters: toJsonSchema(renewSchema, "renewSchema"),
  },
  revise: {
    name: toolDefinitions.revise.name,
    description: toolDefinitions.revise.description,
    parameters: toJsonSchema(reviseSchema, "reviseSchema"),
  },
  sync: {
    name: toolDefinitions.sync.name,
    description: toolDefinitions.sync.description,
    parameters: toJsonSchema(syncSchema, "syncSchema"),
  },
} as const;

/**
 * OpenAI-compatible tool definitions
 */
export const openAITools = Object.values(toolSchemas).map((tool) => ({
  function: {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  },
  type: "function" as const,
}));

/**
 * Claude-compatible tool definitions
 */
export const claudeTools = Object.values(toolSchemas).map((tool) => ({
  description: tool.description,
  input_schema: tool.parameters,
  name: tool.name,
}));

/**
 * Tool executor functions
 */
export const tools = {
  close: (input: CloseInput) => closePermit(input),
  create: (input: CreateInput) => createPermit(input),
  delete: (input: DeleteInput) => deleteDrafts(input),
  list: (input: ListInput) => listPermits(input),
  renew: (input: RenewInput) => renewPermit(input),
  revise: (input: ReviseInput) => revisePermit(input),
  sync: (input: SyncInput) => syncPermits(input),
} as const;

/**
 * Execute a tool by name with the given input
 */
export async function executeTool(
  toolName: keyof typeof tools,
  input: unknown
): Promise<unknown> {
  const tool = tools[toolName];
  if (!tool) {
    throw new Error(`Unknown tool: ${toolName}`);
  }

  // Validate input against schema
  const { schema } = toolDefinitions[toolName];
  const parsed = schema.parse(input);

  // Execute the tool and await the result
  const execute = tool as (payload: unknown) => Promise<unknown>;
  return await execute(parsed);
}
