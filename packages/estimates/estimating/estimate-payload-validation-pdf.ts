import type { EditorEstimate } from "@lib/db/types";
import { z } from "zod";
import {
  EstimatePayloadValidationError,
  validateCreateEstimatePayload,
} from "@/packages/estimates/estimating/estimate-payload-validation";
import {
  normalizeCatalogLineItems,
  type RawCatalogLineItem,
} from "@/packages/estimates/estimating/estimate-payload-validation-line-items";

const stringOrNullSchema = z.union([z.string(), z.null()]);
const LINE_ITEM_PREFIX_RE = /^Line item\s+\d+:/;

const editorSectionSchema = z.looseObject({
  id: z.string().trim().min(1, "Section id is required"),
  name: z.string().trim().min(1, "Section name is required"),
  title: z.string().trim().optional(),
  showSubtotal: z.boolean().optional(),
});

const editorLineItemSchema = z.looseObject({
  id: z.string().trim().optional(),
  item: z.string().trim().min(1, "Line item name is required"),
  description: z.string().optional(),
  qty: z.coerce.number().finite().nonnegative(),
  uom: z.string().trim().optional(),
  cost: z.coerce.number().finite().nonnegative(),
  total: z.coerce.number().finite().nonnegative().optional(),
  sectionId: stringOrNullSchema.optional(),
  notes: stringOrNullSchema.optional(),
  isAlternate: z.boolean().optional(),
  catalogCode: z.string().trim().optional(),
  allowDescriptionOverride: z.boolean().optional(),
  allowUnitOverride: z.boolean().optional(),
});

const ESTIMATOR_DIRECTORY = {
  "Jared Aiken": {
    email: "jared@desertservices.net",
    phone: "(989) 330-7859",
  },
  "Denise Bender": {
    email: "denise@desertservices.net",
    phone: "(480) 513-8986",
  },
  "Jeff Gardner": {
    email: "jeff@desertservices.net",
    phone: "(480) 513-8986",
  },
  "Chi Ejimofor": {
    email: "chi@desertservices.net",
    phone: "(304) 405-2446",
  },
} as const;

const ESTIMATOR_NAMES = Object.keys(ESTIMATOR_DIRECTORY);

function normalizeDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function resolveEstimatorContact(estimatorName: string): {
  email: string;
  phone: string;
} {
  const contact =
    ESTIMATOR_DIRECTORY[estimatorName as keyof typeof ESTIMATOR_DIRECTORY];
  if (!contact) {
    throw new EstimatePayloadValidationError([
      `Estimator must be one of: ${ESTIMATOR_NAMES.join(", ")}.`,
    ]);
  }
  return contact;
}

const editorEstimateSchema = z.looseObject({
  estimateNumber: z.string().trim().min(1, "estimateNumber is required"),
  date: z.string().trim().min(1, "date is required"),
  estimator: z.string().trim().min(1, "estimator is required"),
  estimatorEmail: z.string().trim().optional().default(""),
  estimatorPhone: z.string().trim().optional().default(""),
  billTo: z.object({
    companyName: z.string().trim().min(1, "billTo.companyName is required"),
    address: z.string().trim().min(1, "billTo.address is required"),
    email: z.string().trim().optional().default(""),
    phone: z.string().trim().optional().default(""),
  }),
  jobInfo: z.object({
    siteName: z.string().trim().min(1, "jobInfo.siteName is required"),
    address: z.string().trim().min(1, "jobInfo.address is required"),
  }),
  sections: z.array(editorSectionSchema).default([]),
  lineItems: z
    .array(editorLineItemSchema)
    .min(1, "lineItems must contain at least one row"),
  total: z.coerce.number().finite().nonnegative().optional(),
});

function toRawCatalogLineItem(
  lineItem: z.infer<typeof editorLineItemSchema>
): RawCatalogLineItem {
  return {
    section_id: lineItem.sectionId,
    code: lineItem.catalogCode,
    item_name: lineItem.item,
    description: lineItem.description,
    quantity: lineItem.qty,
    unit: lineItem.uom,
    unit_price: lineItem.cost,
    notes: lineItem.notes,
    is_excluded: lineItem.isAlternate ? 1 : 0,
    allow_description_override: lineItem.allowDescriptionOverride,
    allow_unit_override: lineItem.allowUnitOverride,
  };
}

function mapLineItemErrorsToPosition(
  issues: string[],
  position: number
): string[] {
  return issues.map((issue) =>
    issue.replace(LINE_ITEM_PREFIX_RE, `Line item ${position}:`)
  );
}

function normalizeLineItemsForPdf(
  lineItems: z.infer<typeof editorLineItemSchema>[],
  errors: string[]
) {
  const normalized = [] as ReturnType<typeof normalizeCatalogLineItems>;

  for (const [index, lineItem] of lineItems.entries()) {
    const strictErrors: string[] = [];
    const strictResult = normalizeCatalogLineItems(
      [toRawCatalogLineItem(lineItem)],
      strictErrors
    );

    if (strictErrors.length > 0 || strictResult.length !== 1) {
      errors.push(...mapLineItemErrorsToPosition(strictErrors, index + 1));
      continue;
    }

    normalized.push(strictResult[0]);
  }

  return normalized;
}

/**
 * Strict PDF guardrail: validates and canonicalizes EditorEstimate input using
 * the same catalog-backed rules as create/update API payloads.
 */
export function validateAndNormalizeEditorEstimateForPdf(
  estimate: unknown
): EditorEstimate {
  const parsed = editorEstimateSchema.safeParse(estimate);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => issue.message);
    throw new EstimatePayloadValidationError(issues);
  }

  const payload = parsed.data;
  const resolvedEstimator = resolveEstimatorContact(payload.estimator);
  const validationErrors: string[] = [];

  if (
    payload.estimatorEmail &&
    payload.estimatorEmail.toLowerCase() !== resolvedEstimator.email
  ) {
    validationErrors.push(
      `Estimator email mismatch for ${payload.estimator}. Expected ${resolvedEstimator.email}.`
    );
  }

  if (
    payload.estimatorPhone &&
    normalizeDigits(payload.estimatorPhone) !==
      normalizeDigits(resolvedEstimator.phone)
  ) {
    validationErrors.push(
      `Estimator phone mismatch for ${payload.estimator}. Expected ${resolvedEstimator.phone}.`
    );
  }

  const normalized = validateCreateEstimatePayload(
    {
      job_name: payload.jobInfo.siteName,
      job_address: payload.jobInfo.address,
      client_name: payload.billTo.companyName,
      client_address: payload.billTo.address,
      client_email: payload.billTo.email,
      client_phone: payload.billTo.phone,
      sections: payload.sections.map((section) => ({
        id: section.id,
        name: section.name,
        title: section.title,
        show_subtotal: section.showSubtotal,
      })),
    },
    {
      allowSingleLineAddress: true,
    }
  );

  const normalizedLineItems = normalizeLineItemsForPdf(
    payload.lineItems,
    validationErrors
  ).map((lineItem, index) => {
    const sourceId = payload.lineItems[index]?.id;
    const rowTotal = Number(
      (lineItem.quantity * lineItem.unit_price).toFixed(2)
    );

    return {
      id:
        sourceId && sourceId.trim().length > 0 ? sourceId : `line-${index + 1}`,
      item: lineItem.item_name,
      description: lineItem.description,
      qty: lineItem.quantity,
      uom: lineItem.unit,
      cost: lineItem.unit_price,
      total: rowTotal,
      sectionId: lineItem.section_id ?? undefined,
      isAlternate: lineItem.is_excluded === true ? true : undefined,
    };
  });

  if (validationErrors.length > 0) {
    throw new EstimatePayloadValidationError(validationErrors);
  }

  const normalizedSections = (normalized.sections ?? []).map((section) => ({
    id: section.id,
    name: section.name,
    title: section.title ?? undefined,
    showSubtotal: section.show_subtotal,
  }));

  const computedTotal = Number(
    normalizedLineItems.reduce((sum, item) => sum + item.total, 0).toFixed(2)
  );

  return {
    estimateNumber: payload.estimateNumber,
    date: payload.date,
    estimator: payload.estimator,
    estimatorEmail: resolvedEstimator.email,
    estimatorPhone: resolvedEstimator.phone,
    billTo: {
      companyName: normalized.client_name ?? payload.billTo.companyName,
      address: normalized.client_address ?? payload.billTo.address,
      email: normalized.client_email ?? payload.billTo.email,
      phone: normalized.client_phone ?? payload.billTo.phone,
    },
    jobInfo: {
      siteName: normalized.job_name ?? payload.jobInfo.siteName,
      address: normalized.job_address ?? payload.jobInfo.address,
    },
    sections: normalizedSections,
    lineItems: normalizedLineItems,
    total: computedTotal,
  };
}
