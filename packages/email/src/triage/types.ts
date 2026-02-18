/**
 * Unified Email Triage — Type Definitions
 *
 * All types for the email triage system: context assembly, LLM output,
 * dispatch decisions.
 */

import type { EmailClassification } from "@lib/db/types";

// ── LLM Output ──────────────────────────────────────────────

/** Subcategories that trigger specific automated actions. */
export type TriageSubcategory =
  | "payment_confirmation"
  | "permit_issued"
  | "permit_filed"
  | "new_contract"
  | "contract_revision"
  | "estimate_inquiry"
  | "general";

/** Parsed + validated result from the LLM triage call. */
export interface TriageResult {
  category: EmailClassification;
  subcategory: TriageSubcategory | null;
  projectId: number | null;
  estimateId: number | null;
  confidence: number;
  reason: string;
}

export const ACTION_CATEGORIES = new Set<EmailClassification>([
  "PAYMENT",
  "DUST_PERMIT",
  "CONTRACT",
  "CHANGE_ORDER",
]);

export const CATEGORY_GUIDANCE: Record<EmailClassification, string> = {
  PAYMENT:
    "Payment processor confirmations, receipts, transaction notifications (e.g. PointAndPay)",
  DUST_PERMIT:
    "Dust permit notifications, issuances, renewals, filing requests from Maricopa/ADEQ",
  CONTRACT:
    "Contract documents, agreements, subcontracts, scope of values received",
  CHANGE_ORDER: "Change orders, amendments to existing contracts",
  ESTIMATE: "Bid estimates, proposals, pricing requests, RFPs",
  INSURANCE: "Insurance certificates, COI requests, coverage documents",
  INVOICE: "Invoices, billing statements, accounts payable",
  SWPPP: "Stormwater pollution prevention plans, NOI documents",
  HR: "Human resources, payroll, benefits, employee matters",
  IT: "Technology, systems, account access, tools",
  SCHEDULE: "Scheduling, calendar, meeting coordination",
  INTERNAL: "Internal Desert Services team communications, administrative",
  VENDOR: "Vendor/supplier correspondence, material orders",
  SPAM: "Marketing, unsolicited, junk mail",
  UNKNOWN: "Cannot determine category",
};

export const SUBCATEGORY_GUIDANCE: Record<TriageSubcategory, string> = {
  payment_confirmation: "Confirmed payment receipt from a payment processor",
  permit_issued:
    "Official permit issuance/approval from a government authority",
  permit_filed: "Permit application filed/submitted confirmation",
  new_contract: "New contract or subcontract received with documents",
  contract_revision: "Contract amendment, revision, or change order",
  estimate_inquiry: "Question about a specific estimate",
  general: "Category is clear but no specific automated action needed",
};

export const VALID_CATEGORIES = new Set<EmailClassification>(
  Object.keys(CATEGORY_GUIDANCE) as EmailClassification[]
);

export const VALID_SUBCATEGORIES = new Set<TriageSubcategory>(
  Object.keys(SUBCATEGORY_GUIDANCE) as TriageSubcategory[]
);

// ── Context Assembly ────────────────────────────────────────

/** The email being triaged, with all available fields. */
export interface TriageEmailContext {
  id: number;
  subject: string | null;
  body: string | null;
  from: string | null;
  fromDomain: string | null;
  to: string[];
  cc: string[];
  mailbox: string;
  receivedAt: string;
  attachmentNames: string[];
  isForwarded: boolean;
  originalSender: string | null;
  isPlatformEmail: boolean;
  platformName: string | null;
  categories: string[];
  existingClassification: EmailClassification | null;
  existingProjectId: number | null;
}

/** A sibling email in the same conversation thread. */
export interface TriageThreadEmail {
  from: string | null;
  subject: string | null;
  bodyPreview: string | null;
  receivedAt: string;
  projectId: number | null;
  classification: EmailClassification | null;
}

/** An extracted document from this thread or project. */
export interface TriageDocument {
  documentType: string;
  summary: string | null;
  fileName: string | null;
  keyFields: Record<string, unknown>;
}

/** Extracted text from an attachment in this thread. */
export interface TriageAttachment {
  name: string;
  contentType: string | null;
  extractedText: string;
}

/** A candidate project for linking. */
export interface TriageProjectCandidate {
  id: number;
  name: string;
  contractor: string | null;
  address: string | null;
  lifecycleState: string;
  score: number;
}

/** A candidate estimate for linking. */
export interface TriageEstimateCandidate {
  id: number;
  estimateNumber: string | null;
  jobName: string;
  contractor: string | null;
  jobAddress: string | null;
  projectId: number | null;
  score: number;
}

/** Full assembled context passed to the LLM. */
export interface TriageContext {
  email: TriageEmailContext;
  thread: TriageThreadEmail[];
  documents: TriageDocument[];
  attachments: TriageAttachment[];
  candidates: {
    projects: TriageProjectCandidate[];
    estimates: TriageEstimateCandidate[];
  };
}

// ── Dispatch ────────────────────────────────────────────────

/** Job types that triage can dispatch to. */
export type TriageJobType =
  | "dust_permit_payment"
  | "dust_permit_issued_email"
  | "contract_email_received";

export const TRIAGE_ACTION_JOB_MAP: Record<string, TriageJobType> = {
  "PAYMENT:payment_confirmation": "dust_permit_payment",
  "DUST_PERMIT:permit_issued": "dust_permit_issued_email",
  "CONTRACT:new_contract": "contract_email_received",
  "CONTRACT:contract_revision": "contract_email_received",
  "CHANGE_ORDER:contract_revision": "contract_email_received",
};

/** What the dispatcher needs alongside the triage result. */
export interface TriageEmailMeta {
  emailId: number;
  messageId: string;
  mailboxEmail: string;
  subject: string | null;
  fromEmail: string | null;
  bodyText: string | null;
  hasAttachments: boolean;
}

export interface TriageOutcome {
  result: TriageResult | null;
  dispatch: DispatchResult | null;
  skipped: boolean;
  skipReason: string | null;
  error: string | null;
}

export interface TriageOptions {
  /** Override LLM provider (default: gemini) */
  provider?: import("@email/llm/json-runner").LlmProvider;
  /** Internal domains used by the fast-path INTERNAL classification guard. */
  internalDomains?: ReadonlySet<string>;
  /** Optional enqueue adapter for action jobs. */
  enqueueJob?: TriageEnqueueJob;
}

export interface DispatchResult {
  classified: boolean;
  jobEnqueued: TriageJobType | null;
  projectLinked: boolean;
  estimateLinked: boolean;
}

export interface ThreadEmailRow {
  from_email: string | null;
  from_name: string | null;
  subject: string | null;
  body_preview: string | null;
  received_at: string;
  project_id: number | null;
  classification: string | null;
}

export interface DocumentRow {
  document_type: string;
  summary: string | null;
  file_name: string | null;
  raw_extraction: string | null;
}

export interface AttachmentRow {
  name: string;
  content_type: string | null;
  extracted_text: string;
}

export interface UnclassifiedRow {
  id: number;
  subject: string | null;
  from_email: string | null;
  mailbox_email: string;
  message_id: string | null;
  has_attachments: boolean;
  body_preview: string | null;
}

export interface TriageBackfillOptions {
  batchSize: number;
  concurrency: number;
  /** LLM provider — "local" for Ollama backfill, "gemini" for cloud (default: "local") */
  provider?: import("@email/llm/json-runner").LlmProvider;
  /** Internal domains used by the fast-path INTERNAL classification guard. */
  internalDomains?: ReadonlySet<string>;
  /** Optional enqueue adapter for action jobs. */
  enqueueJob?: TriageEnqueueJob;
}

export interface TriageBackfillResult {
  fetched: number;
  processed: number;
  errors: number;
  elapsedMs: number;
}

export type TriageEnqueueJob = (
  jobType: TriageJobType,
  payload: Record<string, unknown>
) => Promise<void>;

// ── Config ──────────────────────────────────────────────────

export type TriageMode = "active" | "shadow" | "disabled";
