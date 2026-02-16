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

// ── Config ──────────────────────────────────────────────────

export type TriageMode = "active" | "shadow" | "disabled";
