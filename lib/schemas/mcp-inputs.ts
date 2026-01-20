import { z } from "zod";

/**
 * STRICT MCP Input Schemas
 *
 * These schemas are used for AI agent inputs via MCP.
 * They use EXACT canonical field names - no aliases allowed.
 * Agents must use the correct names or get a clear error.
 */

/**
 * Create a new quote
 */
export const CreateQuoteInputSchema = z.object({
  jobName: z
    .string()
    .min(1, "Job name is required")
    .describe("Project name (e.g., 'Alta Goldwater', 'Paradise Valley Site')"),

  clientName: z
    .string()
    .optional()
    .describe("Client/account name (e.g., 'Standard Construction')"),

  clientAddress: z.string().optional().describe("Client billing address"),

  jobAddress: z.string().optional().describe("Project site address"),

  clientEmail: z.string().email().optional().describe("Client contact email"),

  clientPhone: z.string().optional().describe("Client contact phone"),

  estimator: z.string().optional().describe("Estimator name"),

  estimatorEmail: z.string().email().optional().describe("Estimator email"),
});

export type CreateQuoteInput = z.infer<typeof CreateQuoteInputSchema>;

/**
 * Add a line item to a quote - STRICT field names
 */
export const AddLineItemInputSchema = z.object({
  quoteId: z.string().min(1, "Quote ID is required"),

  name: z
    .string()
    .min(1, "Item name is required")
    .describe("Item name (e.g., 'SWPPP Narrative', 'Fence Install')"),

  description: z
    .string()
    .optional()
    .describe("Additional notes or details about the item"),

  quantity: z
    .number()
    .positive("Quantity must be positive")
    .describe("Quantity of items"),

  unit: z
    .string()
    .min(1, "Unit is required")
    .describe("Unit of measure (LF, EA, HR, Month)"),

  unitPrice: z
    .number()
    .nonnegative("Unit price cannot be negative")
    .describe("Unit price charged to client"),

  sectionId: z.string().optional().describe("Section ID to add item to"),
});

export type AddLineItemInput = z.infer<typeof AddLineItemInputSchema>;

/**
 * Update an existing line item - all fields optional except identifiers
 */
export const UpdateLineItemInputSchema = z.object({
  quoteId: z.string().min(1, "Quote ID is required"),

  lineItemIndex: z
    .number()
    .int()
    .positive("Line item index must be a positive integer")
    .describe("1-based line item index (as shown in get_quote)"),

  name: z.string().min(1).optional().describe("New item name"),

  description: z.string().optional().describe("New description/notes"),

  quantity: z
    .number()
    .positive("Quantity must be positive")
    .optional()
    .describe("New quantity"),

  unit: z.string().min(1).optional().describe("New unit of measure"),

  unitPrice: z
    .number()
    .nonnegative("Unit price cannot be negative")
    .optional()
    .describe("New unit price"),
});

export type UpdateLineItemInput = z.infer<typeof UpdateLineItemInputSchema>;

/**
 * Remove a line item from a quote
 */
export const RemoveLineItemInputSchema = z.object({
  quoteId: z.string().min(1, "Quote ID is required"),

  lineItemIndex: z
    .number()
    .int()
    .positive("Line item index must be a positive integer")
    .describe("1-based line item index (as shown in get_quote)"),
});

export type RemoveLineItemInput = z.infer<typeof RemoveLineItemInputSchema>;

/**
 * List quotes with optional filters
 */
export const ListQuotesInputSchema = z.object({
  limit: z.number().int().positive().max(100).default(20),
  status: z.enum(["draft", "sent", "accepted", "declined"]).optional(),
  search: z.string().optional(),
});

export type ListQuotesInput = z.infer<typeof ListQuotesInputSchema>;

/**
 * Get a single quote
 */
export const GetQuoteInputSchema = z.object({
  quoteId: z.string().min(1, "Quote ID is required"),
});

export type GetQuoteInput = z.infer<typeof GetQuoteInputSchema>;

/**
 * Download quote PDF
 */
export const DownloadPDFInputSchema = z.object({
  quoteId: z.string().min(1, "Quote ID is required"),
  outputPath: z
    .string()
    .optional()
    .describe("Output path (defaults to ~/Downloads)"),
});

export type DownloadPDFInput = z.infer<typeof DownloadPDFInputSchema>;

/**
 * Preview quote in browser
 */
export const PreviewQuoteInputSchema = z.object({
  quoteId: z.string().min(1, "Quote ID is required"),
});

export type PreviewQuoteInput = z.infer<typeof PreviewQuoteInputSchema>;
