#!/usr/bin/env bun
/**
 * Desert Quoting MCP Server
 *
 * A Model Context Protocol (MCP) server that exposes quote management operations
 * as tools for Claude Code. This enables AI-assisted quote editing with live
 * preview in the Desert Services Hub.
 *
 * ## Architecture
 *
 * This server acts as a bridge between Claude Code and the Hub API:
 * - Claude interprets natural language ("add 330 ft fence")
 * - Claude calls MCP tools with structured data
 * - MCP server validates input with Zod schemas
 * - MCP server calls Hub API (localhost:3000)
 * - Hub updates database and browser refreshes
 *
 * ## Strict Input Validation
 *
 * All inputs are validated with Zod schemas using CANONICAL field names:
 * - name: Item name (NOT "item")
 * - quantity: Amount (NOT "qty")
 * - unit: Unit of measure (NOT "uom")
 * - unitPrice: Price (NOT "cost")
 *
 * Invalid inputs get clear error messages telling agents exactly what's wrong.
 *
 * @module services/quoting/mcp-server
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  AddLineItemInputSchema,
  CreateQuoteInputSchema,
  DownloadPDFInputSchema,
  GetQuoteInputSchema,
  ListQuotesInputSchema,
  PreviewQuoteInputSchema,
  RemoveLineItemInputSchema,
  UpdateLineItemInputSchema,
  validateMCPInput,
} from "../../lib/schemas";

// ============================================================================
// Configuration
// ============================================================================

const HUB_URL = process.env.HUB_URL ?? "http://localhost:3000";
const FILENAME_REGEX = /filename="(.+)"/;

// ============================================================================
// Types
// ============================================================================

export type ToolResponse = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

export type ToolHandler = (
  args: Record<string, unknown>
) => Promise<ToolResponse>;

export type HubSection = {
  id: string;
  name: string;
  sort_order: number;
};

export type HubLineItem = {
  id: string;
  section_id: string | null;
  description: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  unit_price: number;
  is_excluded: number;
  notes: string | null;
  sort_order: number;
};

export type HubQuote = {
  id: string;
  base_number: string;
  job_name: string;
  job_address: string | null;
  client_name: string | null;
  client_email: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  current_version?: {
    id: string;
    total: number;
    sections: HubSection[];
    line_items: HubLineItem[];
  };
};

// ============================================================================
// MCP Server Setup
// ============================================================================

const server = new Server(
  { name: "desert-quoting", version: "2.0.0" },
  { capabilities: { tools: {} } }
);

// ============================================================================
// Helper Functions
// ============================================================================

export function success(message: string): ToolResponse {
  return { content: [{ type: "text", text: message }] };
}

export function error(message: string): ToolResponse {
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
  };
}

export async function hubFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${HUB_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Hub API error (${response.status}): ${text}`);
  }

  return response.json() as Promise<T>;
}

export function calculateTotal(lineItems: HubLineItem[]): number {
  let total = 0;
  for (const item of lineItems) {
    if (!item.is_excluded) {
      total += item.quantity * item.unit_price;
    }
  }
  return total;
}

async function openInBrowser(url: string): Promise<void> {
  const proc = Bun.spawn(["open", url]);
  await proc.exited;
}

export async function resolveQuoteId(idOrBase: string): Promise<string> {
  if (idOrBase.length === 36 && idOrBase.includes("-")) {
    return idOrBase;
  }

  const quotes = await hubFetch<HubQuote[]>("/api/quotes");
  const quote = quotes.find(
    (q) => q.base_number === idOrBase || q.id === idOrBase
  );
  if (!quote) {
    throw new Error(`Quote "${idOrBase}" not found`);
  }
  return quote.id;
}

async function openFile(path: string): Promise<void> {
  const proc = Bun.spawn(["open", path]);
  await proc.exited;
}

// ============================================================================
// Tool Implementations with Zod Validation
// ============================================================================

export const tools: Record<
  string,
  { description: string; schema: object; handler: ToolHandler }
> = {
  preview_quote: {
    description: "Open a quote in the browser for editing and PDF preview",
    schema: zodToJsonSchema(PreviewQuoteInputSchema),
    handler: async (args) => {
      const validation = validateMCPInput(PreviewQuoteInputSchema, args);
      if (!validation.success) {
        return error(validation.error);
      }

      const quoteId = await resolveQuoteId(validation.data.quoteId);
      const url = `${HUB_URL}/quotes/${quoteId}`;

      await openInBrowser(url);

      return success(`Opened quote in browser: ${url}`);
    },
  },

  list_quotes: {
    description: "List quotes with optional filters",
    schema: zodToJsonSchema(ListQuotesInputSchema),
    handler: async (args) => {
      const validation = validateMCPInput(ListQuotesInputSchema, args);
      if (!validation.success) {
        return error(validation.error);
      }

      const { limit, status, search } = validation.data;

      const quotes = await hubFetch<HubQuote[]>("/api/quotes");

      let filtered = quotes;

      if (status) {
        filtered = filtered.filter((q) => q.status === status);
      }

      if (search) {
        const term = search.toLowerCase();
        filtered = filtered.filter(
          (q) =>
            q.job_name.toLowerCase().includes(term) ||
            q.client_name?.toLowerCase().includes(term) ||
            q.base_number.includes(term)
        );
      }

      filtered = filtered.slice(0, limit);

      const lines = filtered.map((q) => {
        const total = q.current_version?.total ?? 0;
        return `${q.base_number} | ${q.job_name} | ${q.client_name ?? "No client"} | $${total.toFixed(2)} | ${q.status} | ID: ${q.id}`;
      });

      return success(
        filtered.length > 0
          ? `Found ${filtered.length} quotes:\n\n${lines.join("\n")}`
          : "No quotes found"
      );
    },
  },

  get_quote: {
    description: "Get full details of a quote including all line items",
    schema: zodToJsonSchema(GetQuoteInputSchema),
    handler: async (args) => {
      const validation = validateMCPInput(GetQuoteInputSchema, args);
      if (!validation.success) {
        return error(validation.error);
      }

      const quoteId = await resolveQuoteId(validation.data.quoteId);
      const quote = await hubFetch<HubQuote>(`/api/quotes/${quoteId}`);

      const version = quote.current_version;
      if (!version) {
        return error("Quote has no current version");
      }

      const sectionMap = new Map<string, string>();
      for (const section of version.sections) {
        sectionMap.set(section.id, section.name);
      }

      const itemLines = version.line_items.map((item, i) => {
        const section = item.section_id
          ? sectionMap.get(item.section_id)
          : null;
        const total = item.quantity * item.unit_price;
        const struck = item.is_excluded ? " [STRUCK]" : "";
        return `${i + 1}. ${item.description} | ${item.quantity} ${item.unit} @ $${item.unit_price.toFixed(2)} = $${total.toFixed(2)}${struck}${section ? ` (${section})` : ""}`;
      });

      const output = `
Quote: ${quote.base_number}
Job: ${quote.job_name}
Address: ${quote.job_address ?? "Not set"}
Client: ${quote.client_name ?? "Not set"}
Status: ${quote.status}
Total: $${version.total.toFixed(2)}

Line Items (${version.line_items.length}):
${itemLines.join("\n")}
      `.trim();

      return success(output);
    },
  },

  create_quote: {
    description: "Create a new quote",
    schema: zodToJsonSchema(CreateQuoteInputSchema),
    handler: async (args) => {
      const validation = validateMCPInput(CreateQuoteInputSchema, args);
      if (!validation.success) {
        return error(validation.error);
      }

      const input = validation.data;

      // Map to hub API format
      const result = await hubFetch<{ id: string; version_id: string }>(
        "/api/quotes",
        {
          method: "POST",
          body: JSON.stringify({
            job_name: input.jobName,
            client_name: input.clientName,
            client_address: input.clientAddress,
            job_address: input.jobAddress,
            client_email: input.clientEmail,
            client_phone: input.clientPhone,
            estimator: input.estimator,
            estimator_email: input.estimatorEmail,
          }),
        }
      );

      return success(
        `Successfully created quote: ${input.jobName}\nID: ${result.id}\nYou can now add line items using this ID.`
      );
    },
  },

  add_line_item: {
    description: `Add a new line item to a quote.

REQUIRED FIELDS (use exact names):
- quoteId: The quote ID
- name: Item name (e.g., 'SWPPP Narrative', 'Fence Install')
- quantity: Number of items (NOT 'qty')
- unit: Unit of measure like 'LF', 'EA', 'HR' (NOT 'uom')
- unitPrice: Price per unit (NOT 'cost')

OPTIONAL:
- description: Additional notes
- sectionId: Section to add item to`,
    schema: zodToJsonSchema(AddLineItemInputSchema),
    handler: async (args) => {
      const validation = validateMCPInput(AddLineItemInputSchema, args);
      if (!validation.success) {
        return error(validation.error);
      }

      const input = validation.data;
      const quoteId = await resolveQuoteId(input.quoteId);

      const quote = await hubFetch<HubQuote>(`/api/quotes/${quoteId}`);
      const version = quote.current_version;

      if (!version) {
        return error("Quote has no current version");
      }

      // Create new line item using CANONICAL field names
      const newItem: HubLineItem = {
        id: crypto.randomUUID(),
        section_id: input.sectionId ?? null,
        description: input.name, // canonical "name" → hub "description"
        quantity: input.quantity,
        unit: input.unit,
        unit_cost: input.unitPrice * 0.7,
        unit_price: input.unitPrice,
        is_excluded: 0,
        notes: input.description ?? null, // canonical "description" → hub "notes"
        sort_order: version.line_items.length,
      };

      const updatedItems = [...version.line_items, newItem];
      const newTotal = calculateTotal(updatedItems);

      await hubFetch(`/api/quotes/${quoteId}`, {
        method: "PUT",
        body: JSON.stringify({
          base_number: quote.base_number,
          job_name: quote.job_name,
          job_address: quote.job_address,
          client_name: quote.client_name,
          client_email: quote.client_email,
          status: quote.status,
          sections: version.sections.map((s) => ({ id: s.id, name: s.name })),
          line_items: updatedItems.map((item) => ({
            section_id: item.section_id,
            item: item.description,
            description: item.notes ?? "",
            qty: item.quantity,
            uom: item.unit,
            cost: item.unit_price,
            isStruck: item.is_excluded === 1,
          })),
          total: newTotal,
        }),
      });

      const itemTotal = newItem.quantity * newItem.unit_price;
      return success(
        `Added: ${newItem.description} | ${newItem.quantity} ${newItem.unit} @ $${newItem.unit_price.toFixed(2)} = $${itemTotal.toFixed(2)}\nNew quote total: $${newTotal.toFixed(2)}`
      );
    },
  },

  update_line_item: {
    description: `Update an existing line item in a quote.

REQUIRED FIELDS:
- quoteId: The quote ID
- lineItemIndex: 1-based index (as shown in get_quote)

OPTIONAL (only provide what you want to change):
- name: New item name
- quantity: New quantity (NOT 'qty')
- unit: New unit (NOT 'uom')
- unitPrice: New price (NOT 'cost')
- description: New notes`,
    schema: zodToJsonSchema(UpdateLineItemInputSchema),
    handler: async (args) => {
      const validation = validateMCPInput(UpdateLineItemInputSchema, args);
      if (!validation.success) {
        return error(validation.error);
      }

      const input = validation.data;
      const quoteId = await resolveQuoteId(input.quoteId);
      const index = input.lineItemIndex - 1;

      const quote = await hubFetch<HubQuote>(`/api/quotes/${quoteId}`);
      const version = quote.current_version;

      if (!version) {
        return error("Quote has no current version");
      }

      if (index < 0 || index >= version.line_items.length) {
        return error(
          `Invalid line item index. Quote has ${version.line_items.length} items.`
        );
      }

      const updatedItems = [...version.line_items];
      const item = { ...updatedItems[index] } as HubLineItem;

      // Apply updates using CANONICAL field names
      if (input.name !== undefined) {
        item.description = input.name;
      }
      if (input.quantity !== undefined) {
        item.quantity = input.quantity;
      }
      if (input.unit !== undefined) {
        item.unit = input.unit;
      }
      if (input.unitPrice !== undefined) {
        item.unit_price = input.unitPrice;
        item.unit_cost = input.unitPrice * 0.7;
      }
      if (input.description !== undefined) {
        item.notes = input.description;
      }

      updatedItems[index] = item;
      const newTotal = calculateTotal(updatedItems);

      await hubFetch(`/api/quotes/${quoteId}`, {
        method: "PUT",
        body: JSON.stringify({
          base_number: quote.base_number,
          job_name: quote.job_name,
          job_address: quote.job_address,
          client_name: quote.client_name,
          client_email: quote.client_email,
          status: quote.status,
          sections: version.sections.map((s) => ({ id: s.id, name: s.name })),
          line_items: updatedItems.map((li) => ({
            section_id: li.section_id,
            item: li.description,
            description: li.notes,
            qty: li.quantity,
            uom: li.unit,
            cost: li.unit_price,
            isStruck: li.is_excluded === 1,
          })),
          total: newTotal,
        }),
      });

      const itemTotal = item.quantity * item.unit_price;
      return success(
        `Updated item ${index + 1}: ${item.description} | ${item.quantity} ${item.unit} @ $${item.unit_price.toFixed(2)} = $${itemTotal.toFixed(2)}\nNew quote total: $${newTotal.toFixed(2)}`
      );
    },
  },

  remove_line_item: {
    description: "Remove a line item from a quote",
    schema: zodToJsonSchema(RemoveLineItemInputSchema),
    handler: async (args) => {
      const validation = validateMCPInput(RemoveLineItemInputSchema, args);
      if (!validation.success) {
        return error(validation.error);
      }

      const input = validation.data;
      const quoteId = await resolveQuoteId(input.quoteId);
      const index = input.lineItemIndex - 1;

      const quote = await hubFetch<HubQuote>(`/api/quotes/${quoteId}`);
      const version = quote.current_version;

      if (!version) {
        return error("Quote has no current version");
      }

      if (index < 0 || index >= version.line_items.length) {
        return error(
          `Invalid line item index. Quote has ${version.line_items.length} items.`
        );
      }

      const removedItem = version.line_items[index];
      const updatedItems = version.line_items.filter((_, i) => i !== index);
      const newTotal = calculateTotal(updatedItems);

      await hubFetch(`/api/quotes/${quoteId}`, {
        method: "PUT",
        body: JSON.stringify({
          base_number: quote.base_number,
          job_name: quote.job_name,
          job_address: quote.job_address,
          client_name: quote.client_name,
          client_email: quote.client_email,
          status: quote.status,
          sections: version.sections.map((s) => ({ id: s.id, name: s.name })),
          line_items: updatedItems.map((li) => ({
            section_id: li.section_id,
            item: li.description,
            description: li.notes,
            qty: li.quantity,
            uom: li.unit,
            cost: li.unit_price,
            isStruck: li.is_excluded === 1,
          })),
          total: newTotal,
        }),
      });

      return success(
        `Removed item ${index + 1}: ${removedItem?.description || "Unknown item"}\nNew quote total: $${newTotal.toFixed(2)}`
      );
    },
  },

  download_pdf: {
    description: "Generate and download the quote PDF",
    schema: zodToJsonSchema(DownloadPDFInputSchema),
    handler: async (args) => {
      const validation = validateMCPInput(DownloadPDFInputSchema, args);
      if (!validation.success) {
        return error(validation.error);
      }

      const input = validation.data;
      const quoteId = await resolveQuoteId(input.quoteId);

      const response = await fetch(`${HUB_URL}/api/quotes/${quoteId}/pdf`);

      if (!response.ok) {
        return error(`Failed to generate PDF: ${response.statusText}`);
      }

      const contentDisposition = response.headers.get("content-disposition");
      const match = contentDisposition
        ? FILENAME_REGEX.exec(contentDisposition)
        : null;
      const filename = match?.[1] ?? "quote.pdf";

      const homeDir = process.env.HOME ?? "/tmp";
      const finalPath = input.outputPath ?? `${homeDir}/Downloads/${filename}`;

      const buffer = await response.arrayBuffer();
      await Bun.write(finalPath, buffer);

      await openFile(finalPath);

      return success(`PDF saved and opened: ${finalPath}`);
    },
  },
};

// ============================================================================
// Tool Registration
// ============================================================================

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: Object.entries(tools).map(([name, { description, schema }]) => ({
    name,
    description,
    inputSchema: schema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  const tool = tools[name];
  if (!tool) {
    return {
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }

  try {
    return await tool.handler(args ?? {});
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

// ============================================================================
// Server Startup
// ============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
