/**
 * Contract Extraction Output Schema
 *
 * Citation-based extraction schema that enforces source tracking for every field.
 * This prevents hallucination by requiring the model to provide exact quotes
 * from source documents for every extracted value.
 *
 * Key principle: If it's not in the documents, it doesn't go in the output.
 */
import { z } from "zod";

// ============================================
// Document Source Types
// ============================================

export const DocumentTypeSchema = z.enum([
  "contract",
  "estimate",
  "po",
  "loi",
  "exhibit",
  "schedule",
  "email",
  "unknown",
]);

export type DocumentType = z.infer<typeof DocumentTypeSchema>;

// ============================================
// Citation Schema (Core Anti-Hallucination Mechanism)
// ============================================

/**
 * Every extracted value must have a citation pointing to the source.
 * The quote field contains the exact text snippet from the document.
 */
export const CitationSchema = z.object({
  document: DocumentTypeSchema.describe("Type of source document"),
  page: z.number().int().positive().describe("Page number (1-indexed)"),
  quote: z
    .string()
    .min(5)
    .describe("Exact text snippet from the document (minimum 5 chars)"),
});

export type Citation = z.infer<typeof CitationSchema>;

// ============================================
// ExtractedField<T> - Generic wrapper with citation
// ============================================

/**
 * Creates a schema for an extracted field with required citation.
 * Use this for all fields that come from documents.
 */
export function createExtractedFieldSchema<T extends z.ZodTypeAny>(
  valueSchema: T,
  description: string
) {
  return z.object({
    value: valueSchema.describe(description),
    source: CitationSchema.nullable().describe(
      "Source citation for this value. Must be null if value is null."
    ),
    confidence: z
      .enum(["high", "medium", "low"])
      .describe("Confidence level based on clarity of source text"),
  });
}

// ============================================
// Contact Schema
// ============================================

export const ContactRoleSchema = z.enum([
  "project_manager",
  "superintendent",
  "billing",
  "coordinator",
  "operations_manager",
  "delivery",
  "other",
]);

export const ContactSchema = z.object({
  role: ContactRoleSchema.describe("Role of this contact"),
  name: z.string().describe("Full name of the contact"),
  email: z.string().email().nullable().describe("Email address if available"),
  phone: z.string().nullable().describe("Phone number if available"),
});

export type Contact = z.infer<typeof ContactSchema>;

// ============================================
// Billing Terms Schema
// ============================================

export const BillingPlatformSchema = z.enum([
  "Textura",
  "Procore",
  "GCPay",
  "Premier",
  "Email",
  "Other",
]);

export const BillingTermsSchema = z.object({
  platform: BillingPlatformSchema.nullable().describe(
    "Billing platform if specified"
  ),
  window: z
    .string()
    .nullable()
    .describe("Billing window/cutoff (e.g., '20th of month')"),
  invoiceTo: z.string().nullable().describe("Email or address for invoices"),
  paymentTerms: z
    .string()
    .nullable()
    .describe("Payment terms as stated (e.g., 'Net 30', '10 working days')"),
  lienReleaseRequired: z
    .boolean()
    .nullable()
    .describe("Whether lien releases are required"),
});

export type BillingTerms = z.infer<typeof BillingTermsSchema>;

// ============================================
// Insurance Requirements Schema
// ============================================

export const InsuranceLimitSchema = z.object({
  perOccurrence: z.number().nullable().describe("Per occurrence limit in USD"),
  aggregate: z.number().nullable().describe("Aggregate limit in USD"),
});

export const InsuranceRequirementsSchema = z.object({
  generalLiability: InsuranceLimitSchema.nullable(),
  autoLiability: z.number().nullable().describe("Auto liability limit in USD"),
  workersComp: z.number().nullable().describe("Workers comp limit in USD"),
  umbrella: InsuranceLimitSchema.nullable(),
  additionalInsured: z
    .array(z.string())
    .describe("Parties to be named as additional insured"),
  waiverOfSubrogation: z.boolean().nullable(),
  primaryNonContributory: z.boolean().nullable(),
  isoForms: z.string().nullable().describe("Required ISO forms if specified"),
});

export type InsuranceRequirements = z.infer<typeof InsuranceRequirementsSchema>;

// ============================================
// Party Schema (GC, Owner, etc.)
// ============================================

export const PartySchema = z.object({
  name: z.string().describe("Company or entity name"),
  address: z.string().nullable().describe("Address if available"),
  phone: z.string().nullable().describe("Phone if available"),
  licenses: z.array(z.string()).describe("License numbers if listed"),
});

export type Party = z.infer<typeof PartySchema>;

// ============================================
// Contract Extraction Output (Main Schema)
// ============================================

export const ContractExtractionOutputSchema = z.object({
  // Metadata
  extractedAt: z.string().datetime().describe("ISO timestamp of extraction"),
  sourceDocuments: z
    .array(z.string())
    .describe("List of document filenames that were processed"),

  // Project Info (all with citations)
  projectName: createExtractedFieldSchema(z.string(), "Name of the project"),
  projectNumber: createExtractedFieldSchema(
    z.string().nullable(),
    "Project number (e.g., job number, PO number)"
  ),
  poNumber: createExtractedFieldSchema(
    z.string().nullable(),
    "Purchase Order number if separate from project number"
  ),
  location: createExtractedFieldSchema(
    z.string().nullable(),
    "Project site address"
  ),
  dateRequired: createExtractedFieldSchema(
    z.string().nullable(),
    "Date required/start date"
  ),

  // Parties (with citations)
  generalContractor: createExtractedFieldSchema(
    PartySchema,
    "General Contractor information"
  ),
  owner: createExtractedFieldSchema(
    PartySchema.nullable(),
    "Owner/Client information - NULL if not explicitly stated in documents"
  ),

  // Contacts (with citations)
  contacts: z
    .array(
      z.object({
        contact: ContactSchema,
        source: CitationSchema.nullable(),
        confidence: z.enum(["high", "medium", "low"]),
      })
    )
    .describe("All contacts found in documents"),

  // Contract Terms (with citations)
  contractType: createExtractedFieldSchema(
    z.enum(["LOI", "Subcontract", "Work Order", "Purchase Order", "Amendment"]),
    "Type of contract document"
  ),
  contractValue: createExtractedFieldSchema(
    z.number(),
    "Total contract value in USD"
  ),
  originalEstimateValue: createExtractedFieldSchema(
    z.number().nullable(),
    "Original estimate value if different from contract"
  ),
  retention: createExtractedFieldSchema(
    z.number().nullable(),
    "Retention percentage - NULL if not specified"
  ),
  billing: createExtractedFieldSchema(
    BillingTermsSchema.nullable(),
    "Billing terms and platform"
  ),
  certifiedPayroll: createExtractedFieldSchema(
    z
      .object({
        required: z.boolean(),
        type: z
          .enum(["Davis-Bacon", "HUD", "State Prevailing Wage", "None"])
          .nullable(),
      })
      .nullable(),
    "Certified payroll requirements - NULL if not mentioned"
  ),

  // Insurance (with citations)
  insurance: createExtractedFieldSchema(
    InsuranceRequirementsSchema.nullable(),
    "Insurance requirements from contract"
  ),

  // Notable Terms
  notableTerms: z
    .array(
      z.object({
        term: z.string().describe("Description of the notable term"),
        source: CitationSchema,
        redFlag: z.boolean().describe("Whether this is a potential red flag"),
      })
    )
    .describe("Notable or unusual contract terms"),

  // Missing Information (what we couldn't find)
  missingFields: z
    .array(
      z.object({
        field: z.string().describe("Name of the missing field"),
        importance: z.enum(["critical", "important", "nice_to_have"]),
        note: z
          .string()
          .nullable()
          .describe("Any context about why it matters"),
      })
    )
    .describe("Fields that could not be extracted from source documents"),
});

export type ContractExtractionOutput = z.infer<
  typeof ContractExtractionOutputSchema
>;

// ============================================
// Validation Helpers
// ============================================

/**
 * Validates that a citation quote actually appears in the source text.
 * Use this to verify extraction output against OCR text.
 */
export function validateCitationQuote(
  citation: Citation,
  sourceTexts: Map<DocumentType, string[]>
): boolean {
  const docPages = sourceTexts.get(citation.document);
  if (!docPages) return false;

  const pageText = docPages[citation.page - 1]; // 0-indexed array
  if (!pageText) return false;

  // Normalize whitespace for comparison
  const normalizedQuote = citation.quote.toLowerCase().replace(/\s+/g, " ");
  const normalizedPage = pageText.toLowerCase().replace(/\s+/g, " ");

  return normalizedPage.includes(normalizedQuote);
}

/**
 * Checks if all citations in an extraction output are valid.
 */
export function validateAllCitations(
  output: ContractExtractionOutput,
  sourceTexts: Map<DocumentType, string[]>
): {
  valid: boolean;
  invalidCitations: Array<{ field: string; citation: Citation }>;
} {
  const invalidCitations: Array<{ field: string; citation: Citation }> = [];

  // Helper to check a field with citation
  const checkField = (
    fieldName: string,
    field: { source: Citation | null }
  ) => {
    if (field.source && !validateCitationQuote(field.source, sourceTexts)) {
      invalidCitations.push({ field: fieldName, citation: field.source });
    }
  };

  // Check all top-level extracted fields
  checkField("projectName", output.projectName);
  checkField("projectNumber", output.projectNumber);
  checkField("poNumber", output.poNumber);
  checkField("location", output.location);
  checkField("dateRequired", output.dateRequired);
  checkField("generalContractor", output.generalContractor);
  checkField("owner", output.owner);
  checkField("contractType", output.contractType);
  checkField("contractValue", output.contractValue);
  checkField("originalEstimateValue", output.originalEstimateValue);
  checkField("retention", output.retention);
  checkField("billing", output.billing);
  checkField("certifiedPayroll", output.certifiedPayroll);
  checkField("insurance", output.insurance);

  // Check contacts
  output.contacts.forEach((c, i) => {
    if (c.source && !validateCitationQuote(c.source, sourceTexts)) {
      invalidCitations.push({ field: `contacts[${i}]`, citation: c.source });
    }
  });

  // Check notable terms
  output.notableTerms.forEach((t, i) => {
    if (!validateCitationQuote(t.source, sourceTexts)) {
      invalidCitations.push({
        field: `notableTerms[${i}]`,
        citation: t.source,
      });
    }
  });

  return {
    valid: invalidCitations.length === 0,
    invalidCitations,
  };
}
