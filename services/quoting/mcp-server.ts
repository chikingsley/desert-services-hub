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
 * - MCP server calls Hub API (localhost:3000)
 * - Hub updates database and browser refreshes
 *
 * ## Configuration
 *
 * - HUB_URL: Base URL for the hub API (default: http://localhost:3000)
 *
 * ## Available Tools
 *
 * - **preview_quote**: Open quote in browser for editing/preview
 * - **list_quotes**: List quotes with optional filters
 * - **get_quote**: Get full quote details
 * - **add_line_item**: Add item to quote
 * - **update_line_item**: Modify existing item
 * - **remove_line_item**: Delete item from quote
 * - **download_pdf**: Generate and save PDF
 *
 * @example
 * // Start the server (typically via Claude Code's MCP configuration)
 * bun services/quoting/mcp-server.ts
 *
 * @module services/quoting/mcp-server
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

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
  { name: "desert-quoting", version: "1.0.0" },
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
  // Use Bun's shell to open URL in default browser
  // This is safe because we control the URL
  const proc = Bun.spawn(["open", url]);
  await proc.exited;
}

export async function resolveQuoteId(idOrBase: string): Promise<string> {
  // UUIDs are typically 36 characters with hyphens
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
  // Use Bun's shell to open file in default application
  // This is safe because we control the path
  const proc = Bun.spawn(["open", path]);
  await proc.exited;
}

// ============================================================================
// Tool Implementations
// ============================================================================

export const tools: Record<
  string,
  { description: string; schema: object; handler: ToolHandler }
> = {
  preview_quote: {
    description: "Open a quote in the browser for editing and PDF preview",
    schema: {
      type: "object",
      properties: {
        quote_id: {
          type: "string",
          description: "The quote ID to preview",
        },
      },
      required: ["quote_id"],
    },
    handler: async (args) => {
      const quoteId = await resolveQuoteId(args.quote_id as string);
      const url = `${HUB_URL}/quotes/${quoteId}`;

      await openInBrowser(url);

      return success(`Opened quote in browser: ${url}`);
    },
  },

  list_quotes: {
    description: "List quotes with optional filters",
    schema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of quotes to return (default: 20)",
        },
        status: {
          type: "string",
          description: "Filter by status: draft, sent, accepted, declined",
        },
        search: {
          type: "string",
          description: "Search term to filter by job name or client",
        },
      },
    },
    handler: async (args) => {
      const limit = (args.limit as number) ?? 20;
      const status = args.status as string | undefined;
      const search = args.search as string | undefined;

      const quotes = await hubFetch<HubQuote[]>("/api/quotes");

      // Apply filters
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

      // Limit results
      filtered = filtered.slice(0, limit);

      // Format output
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
    schema: {
      type: "object",
      properties: {
        quote_id: {
          type: "string",
          description: "The quote ID to retrieve",
        },
      },
      required: ["quote_id"],
    },
    handler: async (args) => {
      const quoteId = await resolveQuoteId(args.quote_id as string);
      const quote = await hubFetch<HubQuote>(`/api/quotes/${quoteId}`);

      const version = quote.current_version;
      if (!version) {
        return error("Quote has no current version");
      }

      // Format sections and items
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
    schema: {
      type: "object",
      properties: {
        job_name: {
          type: "string",
          description:
            "The name of the job/project (e.g. 'Alta Goldwater', 'Paradise Valley Site'). DO NOT use person names here unless it's a residential project.",
        },
        client_name: {
          type: "string",
          description:
            "The name of the client/account (e.g. 'Standard Construction', 'Ryan Companies').",
        },
        job_address: {
          type: "string",
          description: "Project site address",
        },
        client_email: {
          type: "string",
          description: "Client contact email",
        },
        client_phone: {
          type: "string",
          description: "Client contact phone",
        },
      },
      required: ["job_name"],
    },
    handler: async (args) => {
      const result = await hubFetch<{ id: string; version_id: string }>(
        "/api/quotes",
        {
          method: "POST",
          body: JSON.stringify(args),
        }
      );

      return success(
        `Successfully created quote: ${args.job_name}\nID: ${result.id}\nYou can now add line items using this ID.`
      );
    },
  },

  add_line_item: {
    description: "Add a new line item to a quote",
    schema: {
      type: "object",
      properties: {
        quote_id: {
          type: "string",
          description: "The quote ID to add the item to",
        },
        item: {
          type: "string",
          description: "Item name/description (e.g., 'Temp Fence Install')",
        },
        description: {
          type: "string",
          description: "Additional description or notes",
        },
        qty: {
          type: "number",
          description: "Quantity",
        },
        uom: {
          type: "string",
          description: "Unit of measure (e.g., 'LF', 'EA', 'HR')",
        },
        cost: {
          type: "number",
          description: "Unit price/cost",
        },
        section_id: {
          type: "string",
          description: "Optional section ID to add the item to",
        },
      },
      required: ["quote_id", "item", "qty", "uom", "cost"],
    },
    handler: async (args) => {
      const quoteId = await resolveQuoteId(args.quote_id as string);

      // Fetch current quote
      const quote = await hubFetch<HubQuote>(`/api/quotes/${quoteId}`);
      const version = quote.current_version;

      if (!version) {
        return error("Quote has no current version");
      }

      // Create new line item
      const newItem: HubLineItem = {
        id: crypto.randomUUID(),
        section_id: (args.section_id as string) ?? null,
        description: args.item as string,
        quantity: args.qty as number,
        unit: args.uom as string,
        unit_cost: (args.cost as number) * 0.7, // Default 30% margin
        unit_price: args.cost as number,
        is_excluded: 0,
        notes: (args.description as string) ?? null,
        sort_order: version.line_items.length,
      } as HubLineItem;

      // Add to items array
      const updatedItems = [...version.line_items, newItem];
      const newTotal = calculateTotal(updatedItems);

      // Update via PUT
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

      const quantity = newItem.quantity ?? 1;
      const unitPrice = newItem.unit_price ?? 0;
      const itemTotal = quantity * unitPrice;
      return success(
        `Added: ${newItem.description} | ${quantity} ${newItem.unit} @ $${unitPrice.toFixed(2)} = $${itemTotal.toFixed(2)}\nNew quote total: $${newTotal.toFixed(2)}`
      );
    },
  },

  update_line_item: {
    description: "Update an existing line item in a quote",
    schema: {
      type: "object",
      properties: {
        quote_id: {
          type: "string",
          description: "The quote ID",
        },
        line_item_index: {
          type: "number",
          description: "The line item index (1-based, as shown in get_quote)",
        },
        qty: {
          type: "number",
          description: "New quantity (optional)",
        },
        cost: {
          type: "number",
          description: "New unit price (optional)",
        },
        description: {
          type: "string",
          description: "New description (optional)",
        },
      },
      required: ["quote_id", "line_item_index"],
    },
    handler: async (args) => {
      const quoteId = await resolveQuoteId(args.quote_id as string);
      const index = (args.line_item_index as number) - 1; // Convert to 0-based

      // Fetch current quote
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

      // Update the item
      const updatedItems = [...version.line_items];
      const item = { ...updatedItems[index] } as HubLineItem;

      if (args.qty !== undefined) {
        item.quantity = args.qty as number;
      }
      if (args.cost !== undefined) {
        item.unit_price = args.cost as number;
        item.unit_cost = (args.cost as number) * 0.7;
      }
      if (args.description !== undefined) {
        item.description = args.description as string;
      }

      updatedItems[index] = item;
      const newTotal = calculateTotal(updatedItems);

      // Update via PUT
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

      const quantity = item.quantity ?? 1;
      const unitPrice = item.unit_price ?? 0;
      const itemTotal = quantity * unitPrice;
      return success(
        `Updated item ${index + 1}: ${item.description} | ${quantity} ${item.unit} @ $${unitPrice.toFixed(2)} = $${itemTotal.toFixed(2)}\nNew quote total: $${newTotal.toFixed(2)}`
      );
    },
  },

  remove_line_item: {
    description: "Remove a line item from a quote",
    schema: {
      type: "object",
      properties: {
        quote_id: {
          type: "string",
          description: "The quote ID",
        },
        line_item_index: {
          type: "number",
          description: "The line item index (1-based, as shown in get_quote)",
        },
      },
      required: ["quote_id", "line_item_index"],
    },
    handler: async (args) => {
      const quoteId = await resolveQuoteId(args.quote_id as string);
      const index = (args.line_item_index as number) - 1; // Convert to 0-based

      // Fetch current quote
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

      // Update via PUT
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
    schema: {
      type: "object",
      properties: {
        quote_id: {
          type: "string",
          description: "The quote ID",
        },
        output_path: {
          type: "string",
          description: "Optional output path (defaults to ~/Downloads)",
        },
      },
      required: ["quote_id"],
    },
    handler: async (args) => {
      const quoteId = await resolveQuoteId(args.quote_id as string);
      const outputPath = args.output_path as string | undefined;

      // Fetch the PDF from hub
      const response = await fetch(`${HUB_URL}/api/quotes/${quoteId}/pdf`);

      if (!response.ok) {
        return error(`Failed to generate PDF: ${response.statusText}`);
      }

      // Get filename from header or generate one
      const contentDisposition = response.headers.get("content-disposition");
      const match = contentDisposition
        ? FILENAME_REGEX.exec(contentDisposition)
        : null;
      const filename = match?.[1] ?? "quote.pdf";

      // Determine output path
      const homeDir = process.env.HOME ?? "/tmp";
      const finalPath = outputPath ?? `${homeDir}/Downloads/${filename}`;

      // Save the file
      const buffer = await response.arrayBuffer();
      await Bun.write(finalPath, buffer);

      // Open the PDF
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
