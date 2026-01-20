import { z } from "zod";

/**
 * Canonical LineItem schema - single source of truth
 *
 * Field naming conventions:
 * - name: The item name (e.g., "SWPPP Narrative", "Fence Install")
 * - description: Optional notes/details about the item
 * - quantity: Amount (always spelled out, never "qty")
 * - unit: Unit of measure (never "uom")
 * - unitPrice: Price charged to client (never "cost")
 * - unitCost: Internal cost (optional)
 */
export const LineItemSchema = z.object({
  id: z.string(),
  sectionId: z.string().nullable(),
  name: z.string().min(1, "Item name is required"),
  description: z.string().nullable(),
  quantity: z.number().positive("Quantity must be positive"),
  unit: z.string().min(1, "Unit is required"),
  unitCost: z.number().nonnegative().default(0),
  unitPrice: z.number().nonnegative(),
  total: z.number().nonnegative().optional(),
  isExcluded: z.boolean().default(false),
  sortOrder: z.number().int().nonnegative().default(0),
});

export type LineItem = z.infer<typeof LineItemSchema>;

/**
 * For creating new line items (id can be auto-generated)
 */
export const NewLineItemSchema = LineItemSchema.omit({
  id: true,
  sortOrder: true,
  total: true,
}).extend({
  id: z.string().optional(),
  sortOrder: z.number().int().nonnegative().optional(),
});

export type NewLineItem = z.infer<typeof NewLineItemSchema>;
