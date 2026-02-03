/**
 * Contract Processing Workflow
 *
 * Semi-automated workflow for processing contracts with:
 * - Queue-based entry point from contracts@ emails
 * - Citation-based extraction to prevent hallucination
 * - Cross-document validation
 * - Reconciliation with math verification
 * - Template-based email generation
 */

// Collect - Document gathering
export {
  addLocalDocument,
  type CollectedDocument,
  type CollectionOptions,
  type CollectionResult,
  collectDocuments,
  createProjectFolder,
  type DocumentType,
  detectDocumentType,
  formatCollectionResult,
  listProjectDocuments,
  type MissingDocument,
} from "./collect";
// Extract - Citation-based extraction
export {
  createExtractionPrompt,
  EXTRACTION_SYSTEM_PROMPT,
  type ExtractionInput,
  type ExtractionResult,
  extractFromDocuments,
  extractWithCitation,
  findCitation,
  formatExtractionMarkdown,
  loadExtractionOutput,
  type OCRResult,
  parseOCRPages,
  runOCR,
  runOCROnAll,
  saveExtractionOutput,
} from "./extract";
// Queue - Entry point
export {
  type Attachment,
  type ContractEmail,
  formatContractDetails,
  formatQueueDisplay,
  getContractAttachments,
  getContractEmails,
  getContractPDFs,
  getContractQueue,
  getContractsWithAttachments,
  getEmailAttachments,
  getPendingContracts,
  type QueuedContract,
  searchContractQueue,
} from "./queue";
// Reconcile - Estimate vs contract comparison
export {
  type ContractLineItem,
  createManualReconciliation,
  type EstimateLineItem,
  loadReconciliation,
  parseLineItemsFromOCR,
  type ReconciliationInput,
  reconcile,
  reconcileFromExtraction,
  saveReconciliation,
  saveReconciliationMarkdown,
} from "./reconcile";
// Render - Email templates
export {
  createClarificationGCResponseData,
  createGCResponseEmail,
  createInternalHandoffData,
  createInternalHandoffEmail,
  createReadyGCResponseData,
  type EmailMetadata,
  type GCResponseData,
  type InternalHandoffData,
  renderGCResponse,
  renderInternalHandoff,
} from "./render";
// Validate - Business rule validation
export {
  formatValidationMarkdown,
  getReviewRequired,
  scanForRedFlags,
  type ValidationIssue,
  type ValidationResult,
  type ValidationSeverity,
  validateExtraction,
} from "./validate";
