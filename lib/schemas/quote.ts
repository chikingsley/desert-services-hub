import { z } from "zod";
import { BillToSchema, EstimatorSchema, JobInfoSchema } from "./contact";
import { LineItemSchema } from "./line-item";
import { SectionSchema } from "./section";

/**
 * Quote status enum
 */
export const QuoteStatusSchema = z.enum([
  "draft",
  "sent",
  "accepted",
  "declined",
]);
export type QuoteStatus = z.infer<typeof QuoteStatusSchema>;

/**
 * Full quote schema with all relations
 * Used for API responses and PDF generation
 */
export const QuoteSchema = z.object({
  id: z.string(),
  estimateNumber: z.string().min(1),
  date: z.string(),

  estimator: EstimatorSchema,
  billTo: BillToSchema,
  jobInfo: JobInfoSchema,

  sections: z.array(SectionSchema),
  lineItems: z.array(LineItemSchema),

  total: z.number().nonnegative(),
  status: QuoteStatusSchema,
  isLocked: z.boolean().default(false),

  takeoffId: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Quote = z.infer<typeof QuoteSchema>;

/**
 * Minimal quote schema for PDF generation
 * Only includes fields required to render the PDF
 */
export const QuoteForPDFSchema = z.object({
  estimateNumber: z.string().min(1),
  date: z.string(),
  estimator: EstimatorSchema,
  billTo: BillToSchema,
  jobInfo: JobInfoSchema,
  sections: z.array(SectionSchema),
  lineItems: z.array(LineItemSchema),
  total: z.number().nonnegative(),
});

export type QuoteForPDF = z.infer<typeof QuoteForPDFSchema>;

/**
 * Quote list item (for listing quotes without full details)
 */
export const QuoteListItemSchema = z.object({
  id: z.string(),
  estimateNumber: z.string(),
  jobName: z.string(),
  clientName: z.string().nullable(),
  total: z.number(),
  status: QuoteStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type QuoteListItem = z.infer<typeof QuoteListItemSchema>;
