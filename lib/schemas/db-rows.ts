import { z } from "zod";
import type { LineItem } from "./line-item";
import type { Section } from "./section";

/**
 * Database Row Schemas with Transform Functions
 *
 * These schemas map between SQLite database rows and canonical domain objects.
 * The database uses snake_case and stores booleans as 0/1.
 *
 * IMPORTANT FIELD MAPPINGS:
 * - DB "description" → canonical "name" (the item name)
 * - DB "notes" → canonical "description" (additional details)
 */

// SQLite stores booleans as 0 or 1
const sqliteBool = z
  .union([z.number(), z.boolean()])
  .transform((val) => (typeof val === "boolean" ? val : val === 1));

/**
 * Quote line item row from database
 */
export const QuoteLineItemRowSchema = z.object({
  id: z.string(),
  version_id: z.string(),
  section_id: z.string().nullable(),
  description: z.string(), // DB calls this "description" but it's the item NAME
  quantity: z.number(),
  unit: z.string(),
  unit_cost: z.number(),
  unit_price: z.number(),
  is_excluded: sqliteBool,
  notes: z.string().nullable(), // DB "notes" is the item DESCRIPTION
  sort_order: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type QuoteLineItemRow = z.input<typeof QuoteLineItemRowSchema>;

/**
 * Transform: DB Row → Canonical LineItem
 */
export function rowToLineItem(row: QuoteLineItemRow): LineItem {
  const parsed = QuoteLineItemRowSchema.parse(row);
  return {
    id: parsed.id,
    sectionId: parsed.section_id,
    name: parsed.description, // DB "description" → canonical "name"
    description: parsed.notes, // DB "notes" → canonical "description"
    quantity: parsed.quantity,
    unit: parsed.unit,
    unitCost: parsed.unit_cost,
    unitPrice: parsed.unit_price,
    total: parsed.quantity * parsed.unit_price,
    isExcluded: parsed.is_excluded,
    sortOrder: parsed.sort_order,
  };
}

/**
 * Transform: Canonical LineItem → DB Row values (for INSERT/UPDATE)
 */
export function lineItemToRowValues(
  item: LineItem
): Omit<QuoteLineItemRow, "created_at" | "updated_at" | "version_id"> {
  return {
    id: item.id,
    section_id: item.sectionId,
    description: item.name, // canonical "name" → DB "description"
    quantity: item.quantity,
    unit: item.unit,
    unit_cost: item.unitCost,
    unit_price: item.unitPrice,
    is_excluded: item.isExcluded ? 1 : 0,
    notes: item.description, // canonical "description" → DB "notes"
    sort_order: item.sortOrder,
  };
}

/**
 * Quote section row from database
 */
export const QuoteSectionRowSchema = z.object({
  id: z.string(),
  version_id: z.string(),
  name: z.string(),
  title: z.string().nullable(),
  show_subtotal: sqliteBool,
  sort_order: z.number(),
  catalog_category_id: z.string().nullable().optional(),
  created_at: z.string(),
});

export type QuoteSectionRow = z.input<typeof QuoteSectionRowSchema>;

/**
 * Transform: DB Row → Canonical Section
 */
export function rowToSection(row: QuoteSectionRow): Section {
  const parsed = QuoteSectionRowSchema.parse(row);
  return {
    id: parsed.id,
    name: parsed.name,
    title: parsed.title,
    showSubtotal: parsed.show_subtotal,
    sortOrder: parsed.sort_order,
    catalogCategoryId: parsed.catalog_category_id ?? null,
  };
}

/**
 * Transform: Canonical Section → DB Row values
 */
export function sectionToRowValues(
  section: Section
): Omit<QuoteSectionRow, "created_at" | "version_id"> {
  return {
    id: section.id,
    name: section.name,
    title: section.title,
    show_subtotal: section.showSubtotal ? 1 : 0,
    sort_order: section.sortOrder,
    catalog_category_id: section.catalogCategoryId,
  };
}

/**
 * Quote row from database
 */
export const QuoteRowSchema = z.object({
  id: z.string(),
  base_number: z.string(),
  takeoff_id: z.string().nullable(),
  job_name: z.string(),
  job_address: z.string().nullable(),
  client_name: z.string().nullable(),
  client_address: z.string().nullable(),
  client_email: z.string().nullable(),
  client_phone: z.string().nullable(),
  notes: z.string().nullable(),
  status: z.string(),
  is_locked: sqliteBool,
  estimator: z.string().nullable(),
  estimator_email: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type QuoteRow = z.input<typeof QuoteRowSchema>;

/**
 * Quote version row from database
 */
export const QuoteVersionRowSchema = z.object({
  id: z.string(),
  quote_id: z.string(),
  version_number: z.number(),
  total: z.number(),
  is_current: sqliteBool,
  created_at: z.string(),
});

export type QuoteVersionRow = z.input<typeof QuoteVersionRowSchema>;

/**
 * Transform quote row + version + sections + line items → canonical Quote for PDF
 */
export function assembleQuoteForPDF(
  quoteRow: QuoteRow,
  _versionRow: QuoteVersionRow,
  sectionRows: QuoteSectionRow[],
  lineItemRows: QuoteLineItemRow[]
): {
  estimateNumber: string;
  date: string;
  estimator: { name: string; email: string; phone: string | null };
  billTo: {
    companyName: string;
    address: string | null;
    email: string | null;
    phone: string | null;
  };
  jobInfo: { siteName: string; address: string | null };
  sections: Section[];
  lineItems: LineItem[];
  total: number;
} {
  const sections = sectionRows.map(rowToSection);
  const lineItems = lineItemRows.map(rowToLineItem);

  // Calculate total from non-excluded items
  const total = lineItems
    .filter((item) => !item.isExcluded)
    .reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  return {
    estimateNumber: quoteRow.base_number,
    date: quoteRow.created_at,
    estimator: {
      name: quoteRow.estimator ?? "",
      email: quoteRow.estimator_email ?? "",
      phone: null,
    },
    billTo: {
      companyName: quoteRow.client_name ?? "",
      address: quoteRow.client_address ?? null,
      email: quoteRow.client_email ?? null,
      phone: quoteRow.client_phone ?? null,
    },
    jobInfo: {
      siteName: quoteRow.job_name,
      address: quoteRow.job_address ?? null,
    },
    sections,
    lineItems,
    total,
  };
}
