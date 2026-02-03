/**
 * Contract Processing Schemas
 *
 * Citation-based extraction and reconciliation schemas
 * that enforce source tracking and prevent hallucination.
 */

export {
  // Billing
  BillingPlatformSchema,
  type BillingTerms,
  BillingTermsSchema,
  type Citation,
  // Citation (core anti-hallucination mechanism)
  CitationSchema,
  type Contact,
  // Contact
  ContactRoleSchema,
  ContactSchema,
  type ContractExtractionOutput,
  // Main extraction output
  ContractExtractionOutputSchema,
  // Field wrapper
  createExtractedFieldSchema,
  type DocumentType,
  // Document types
  DocumentTypeSchema,
  // Insurance
  InsuranceLimitSchema,
  type InsuranceRequirements,
  InsuranceRequirementsSchema,
  type Party,
  // Party
  PartySchema,
  validateAllCitations,
  // Validation helpers
  validateCitationQuote,
} from "./extraction-output";

export {
  // Helpers
  calculateMathCheck,
  formatReconciliationMarkdown,
  type LineItemStatus,
  // Line item
  LineItemStatusSchema,
  type MathCheck,
  // Math check
  MathCheckSchema,
  type ReconciliationLineItem,
  ReconciliationLineItemSchema,
  type ReconciliationOutput,
  // Main reconciliation output
  ReconciliationOutputSchema,
  type UnitRate,
  // Unit rates
  UnitRateSchema,
  validateReconciliation,
} from "./reconciliation";
