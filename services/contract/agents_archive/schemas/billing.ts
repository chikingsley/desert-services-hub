/**
 * Billing Schema (EXTR-02)
 * Extracts billing/payment information: retention, platform, contacts, certified payroll.
 */
import { z } from "zod";

const BillingContactSchema = z.object({
  name: z.string().nullable().describe("Contact person name"),
  email: z.string().nullable().describe("Contact email address"),
  phone: z.string().nullable().describe("Contact phone number"),
});

export const BillingSchema = z.object({
  retentionPercent: z
    .number()
    .nullable()
    .describe(
      "Retention percentage (e.g., 5 or 10), without % symbol. Use null if not found."
    ),
  billingPlatform: z
    .enum([
      "Textura",
      "Procore",
      "GCPay",
      "Premier",
      "Email",
      "Other",
      "Unknown",
    ])
    .describe("Billing/payment platform specified in contract"),
  billingWindow: z
    .string()
    .nullable()
    .describe(
      "Billing cutoff or submission window (e.g., '25th of each month'). Use null if not found."
    ),
  billingContact: BillingContactSchema.nullable().describe(
    "Contact person for billing/AP inquiries. Use null if not found."
  ),
  certifiedPayrollRequired: z
    .boolean()
    .describe("Whether certified payroll is required"),
  certifiedPayrollType: z
    .enum(["Davis-Bacon", "HUD", "State Prevailing Wage", "None"])
    .describe("Type of certified payroll if required, or None if not required"),
  pageReferences: z
    .array(z.number().int().positive())
    .describe("Page numbers where billing information was found (1-indexed)"),
});

export type BillingInfo = z.infer<typeof BillingSchema>;
