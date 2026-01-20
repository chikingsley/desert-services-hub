import { z } from "zod";

/**
 * FLEXIBLE Manual Input Schemas
 *
 * These schemas accept multiple field name aliases and normalize to canonical names.
 * Use these for manual/UI inputs where convenience matters more than strictness.
 */

/**
 * Flexible line item input - accepts aliases
 * Transforms to canonical names
 */
export const FlexibleLineItemInputSchema = z
  .object({
    quoteId: z.string().min(1),

    // Name aliases
    name: z.string().optional(),
    item: z.string().optional(), // alias

    // Description
    description: z.string().optional(),
    notes: z.string().optional(), // alias

    // Quantity aliases
    quantity: z.number().optional(),
    qty: z.number().optional(), // alias

    // Unit aliases
    unit: z.string().optional(),
    uom: z.string().optional(), // alias

    // Price aliases
    unitPrice: z.number().optional(),
    cost: z.number().optional(), // alias
    price: z.number().optional(), // alias

    sectionId: z.string().optional(),
  })
  .transform((data) => ({
    quoteId: data.quoteId,
    name: data.name ?? data.item ?? "",
    description: data.description ?? data.notes ?? null,
    quantity: data.quantity ?? data.qty ?? 1,
    unit: data.unit ?? data.uom ?? "EA",
    unitPrice: data.unitPrice ?? data.cost ?? data.price ?? 0,
    sectionId: data.sectionId ?? null,
  }));

export type FlexibleLineItemInput = z.output<
  typeof FlexibleLineItemInputSchema
>;

/**
 * Flexible update line item - accepts aliases
 */
export const FlexibleUpdateLineItemSchema = z
  .object({
    quoteId: z.string().min(1),
    lineItemIndex: z.number().int().positive(),

    // Name aliases
    name: z.string().optional(),
    item: z.string().optional(),

    // Description
    description: z.string().optional(),
    notes: z.string().optional(),

    // Quantity aliases
    quantity: z.number().optional(),
    qty: z.number().optional(),

    // Unit aliases
    unit: z.string().optional(),
    uom: z.string().optional(),

    // Price aliases
    unitPrice: z.number().optional(),
    cost: z.number().optional(),
    price: z.number().optional(),
  })
  .transform((data) => {
    const result: Record<string, unknown> = {
      quoteId: data.quoteId,
      lineItemIndex: data.lineItemIndex,
    };

    // Only include fields that were provided
    const name = data.name ?? data.item;
    if (name !== undefined) result.name = name;

    const description = data.description ?? data.notes;
    if (description !== undefined) result.description = description;

    const quantity = data.quantity ?? data.qty;
    if (quantity !== undefined) result.quantity = quantity;

    const unit = data.unit ?? data.uom;
    if (unit !== undefined) result.unit = unit;

    const unitPrice = data.unitPrice ?? data.cost ?? data.price;
    if (unitPrice !== undefined) result.unitPrice = unitPrice;

    return result;
  });

export type FlexibleUpdateLineItemInput = z.output<
  typeof FlexibleUpdateLineItemSchema
>;

/**
 * Flexible quote creation - accepts aliases
 */
export const FlexibleCreateQuoteSchema = z
  .object({
    // Job name aliases
    jobName: z.string().optional(),
    job_name: z.string().optional(),
    project: z.string().optional(),
    projectName: z.string().optional(),

    // Client name aliases
    clientName: z.string().optional(),
    client_name: z.string().optional(),
    client: z.string().optional(),
    account: z.string().optional(),

    // Address aliases
    jobAddress: z.string().optional(),
    job_address: z.string().optional(),
    siteAddress: z.string().optional(),
    address: z.string().optional(),

    // Client address
    clientAddress: z.string().optional(),
    client_address: z.string().optional(),
    billingAddress: z.string().optional(),

    // Contact info
    clientEmail: z.string().optional(),
    client_email: z.string().optional(),
    email: z.string().optional(),

    clientPhone: z.string().optional(),
    client_phone: z.string().optional(),
    phone: z.string().optional(),

    // Estimator
    estimator: z.string().optional(),
    estimatorEmail: z.string().optional(),
    estimator_email: z.string().optional(),
  })
  .transform((data) => ({
    jobName:
      data.jobName ?? data.job_name ?? data.project ?? data.projectName ?? "",
    clientName:
      data.clientName ??
      data.client_name ??
      data.client ??
      data.account ??
      null,
    jobAddress:
      data.jobAddress ??
      data.job_address ??
      data.siteAddress ??
      data.address ??
      null,
    clientAddress:
      data.clientAddress ?? data.client_address ?? data.billingAddress ?? null,
    clientEmail: data.clientEmail ?? data.client_email ?? data.email ?? null,
    clientPhone: data.clientPhone ?? data.client_phone ?? data.phone ?? null,
    estimator: data.estimator ?? null,
    estimatorEmail: data.estimatorEmail ?? data.estimator_email ?? null,
  }));

export type FlexibleCreateQuoteInput = z.output<
  typeof FlexibleCreateQuoteSchema
>;
