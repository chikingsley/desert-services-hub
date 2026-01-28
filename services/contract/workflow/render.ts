/**
 * Email Template Rendering
 *
 * Render Handlebars templates for contract emails with section-based filling.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import Handlebars from "handlebars";
import type {
  ContractExtractionOutput,
  ReconciliationOutput,
} from "../schemas";
import type { ValidationIssue, ValidationResult } from "./validate";

// ============================================
// Types
// ============================================

export interface InternalHandoffData {
  /** Project name */
  projectName: string;
  /** Project number */
  projectNumber?: string | null;
  /** PO number */
  poNumber?: string | null;
  /** Project location */
  location?: string | null;
  /** GC info */
  generalContractor: {
    name: string;
    address?: string | null;
  };
  /** Owner info (if known) */
  owner?: { name: string } | null;
  /** Contract type */
  contractType: string;
  /** Contract value */
  contractValue: number;
  /** Original estimate value */
  originalEstimateValue?: number | null;
  /** Retention percentage */
  retention?: number | null;
  /** Certified payroll */
  certifiedPayroll?: {
    required: boolean;
    type?: string | null;
  } | null;
  /** Billing info */
  billing?: {
    platform?: string | null;
    window?: string | null;
  } | null;
  /** Contacts */
  contacts: Array<{
    contact: {
      role: string;
      name: string;
      email?: string | null;
      phone?: string | null;
    };
  }>;
  /** Reconciliation output */
  reconciliation: ReconciliationOutput;
  /** Validation issues */
  validationIssues: ValidationIssue[];
  /** Notable terms */
  notableTerms: Array<{
    term: string;
    source: { page: number };
    redFlag: boolean;
  }>;
  /** Missing fields */
  missingFields: Array<{
    field: string;
    importance: string;
    note?: string | null;
  }>;
  /** Follow-up actions */
  followUpActions?: string[];
  /** Links */
  links?: {
    notion?: string;
    monday?: string;
    sharepoint?: string;
  };
}

export interface GCResponseData {
  /** Contact name for greeting */
  contactName: string;
  /** Contract type */
  contractType: string;
  /** Project name */
  projectName: string;
  /** PO number */
  poNumber?: string | null;
  /** Whether ready to proceed (no clarifications needed) */
  isReady: boolean;
  /** Clarifications needed */
  clarifications?: string[];
  /** Scope questions */
  scopeQuestions?: string[];
  /** Whether there's a variance to discuss */
  hasVariance?: boolean;
  /** Estimate total */
  estimateTotal?: number;
  /** Contract total */
  contractTotal?: number;
  /** Difference */
  difference?: number;
  /** Variance explanation */
  varianceExplanation?: string;
  /** Redlines required */
  redlines?: string[];
  /** COI required */
  coiRequired?: boolean;
  /** COI status */
  coiStatus?: {
    ready?: boolean;
    pending?: boolean;
  };
  /** COI recipient */
  coiRecipient?: string;
  /** W9 requested */
  w9Requested?: boolean;
  /** SOV requested */
  sovRequested?: boolean;
  /** SOV attached */
  sovAttached?: boolean;
  /** Closing note */
  closingNote?: string;
  /** Sender info */
  senderName: string;
  senderTitle: string;
  senderEmail?: string;
  senderPhone?: string;
}

// ============================================
// Handlebars Helpers
// ============================================

// Register helpers
Handlebars.registerHelper("formatMoney", (value: number) => {
  if (value === null || value === undefined) {
    return "0.00";
  }
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
});

Handlebars.registerHelper("toLowerCase", (str: string) => {
  return str?.toLowerCase() ?? "";
});

// ============================================
// Template Loading
// ============================================

const TEMPLATES_DIR = join(import.meta.dir, "../templates");

let internalHandoffTemplate: Handlebars.TemplateDelegate | null = null;
let gcResponseTemplate: Handlebars.TemplateDelegate | null = null;

function loadTemplate(name: string): Handlebars.TemplateDelegate {
  const templatePath = join(TEMPLATES_DIR, `${name}.hbs`);
  const templateSource = readFileSync(templatePath, "utf-8");
  return Handlebars.compile(templateSource);
}

function getInternalHandoffTemplate(): Handlebars.TemplateDelegate {
  if (!internalHandoffTemplate) {
    internalHandoffTemplate = loadTemplate("internal-handoff");
  }
  return internalHandoffTemplate;
}

function getGCResponseTemplate(): Handlebars.TemplateDelegate {
  if (!gcResponseTemplate) {
    gcResponseTemplate = loadTemplate("gc-response");
  }
  return gcResponseTemplate;
}

// ============================================
// Rendering Functions
// ============================================

/**
 * Render internal handoff email.
 */
export function renderInternalHandoff(data: InternalHandoffData): string {
  const template = getInternalHandoffTemplate();
  return template(data);
}

/**
 * Render GC response email.
 */
export function renderGCResponse(data: GCResponseData): string {
  const template = getGCResponseTemplate();
  return template(data);
}

/**
 * Create internal handoff data from extraction and reconciliation.
 */
export function createInternalHandoffData(
  extraction: ContractExtractionOutput,
  reconciliation: ReconciliationOutput,
  validation: ValidationResult
): InternalHandoffData {
  return {
    projectName: extraction.projectName.value || "Unknown Project",
    projectNumber: extraction.projectNumber.value,
    poNumber: extraction.poNumber.value,
    location: extraction.location.value,
    generalContractor: {
      name: extraction.generalContractor.value.name || "Unknown GC",
      address: extraction.generalContractor.value.address,
    },
    owner: extraction.owner.value,
    contractType: extraction.contractType.value,
    contractValue: extraction.contractValue.value,
    originalEstimateValue: extraction.originalEstimateValue.value,
    retention: extraction.retention.value,
    certifiedPayroll: extraction.certifiedPayroll.value,
    billing: extraction.billing.value
      ? {
          platform: extraction.billing.value.platform,
          window: extraction.billing.value.window,
        }
      : null,
    contacts: extraction.contacts,
    reconciliation,
    validationIssues: [...validation.errors, ...validation.warnings],
    notableTerms: extraction.notableTerms,
    missingFields: extraction.missingFields,
  };
}

/**
 * Create GC response data for a ready-to-proceed contract.
 */
export function createReadyGCResponseData(
  contactName: string,
  projectName: string,
  contractType: string,
  sender: { name: string; title: string; email?: string; phone?: string }
): GCResponseData {
  return {
    contactName,
    contractType,
    projectName,
    isReady: true,
    coiRequired: true,
    coiStatus: { pending: true },
    senderName: sender.name,
    senderTitle: sender.title,
    senderEmail: sender.email,
    senderPhone: sender.phone,
  };
}

/**
 * Create GC response data for a contract needing clarification.
 */
export function createClarificationGCResponseData(
  contactName: string,
  projectName: string,
  contractType: string,
  clarifications: string[],
  sender: { name: string; title: string; email?: string; phone?: string },
  options?: {
    scopeQuestions?: string[];
    hasVariance?: boolean;
    estimateTotal?: number;
    contractTotal?: number;
    varianceExplanation?: string;
    redlines?: string[];
  }
): GCResponseData {
  return {
    contactName,
    contractType,
    projectName,
    isReady: false,
    clarifications,
    scopeQuestions: options?.scopeQuestions,
    hasVariance: options?.hasVariance,
    estimateTotal: options?.estimateTotal,
    contractTotal: options?.contractTotal,
    difference:
      options?.estimateTotal && options?.contractTotal
        ? options.contractTotal - options.estimateTotal
        : undefined,
    varianceExplanation: options?.varianceExplanation,
    redlines: options?.redlines,
    coiRequired: true,
    coiStatus: { pending: true },
    senderName: sender.name,
    senderTitle: sender.title,
    senderEmail: sender.email,
    senderPhone: sender.phone,
  };
}

// ============================================
// Email Metadata
// ============================================

export interface EmailMetadata {
  to: string[];
  cc: string[];
  subject: string;
  body: string;
}

/**
 * Create internal handoff email metadata.
 */
export function createInternalHandoffEmail(
  data: InternalHandoffData,
  status: "Reconciled" | "Needs Clarification"
): EmailMetadata {
  const body = renderInternalHandoff(data);

  return {
    to: ["internalcontracts@desertservices.net"],
    cc: [],
    subject: `[${data.projectName}] Contract Intake - ${status}`,
    body,
  };
}

/**
 * Create GC response email metadata.
 */
export function createGCResponseEmail(
  data: GCResponseData,
  toEmail: string,
  options?: {
    ccKendra?: boolean;
    ccJared?: boolean;
    ccSales?: string;
  }
): EmailMetadata {
  const body = renderGCResponse(data);

  const cc: string[] = [];
  if (options?.ccKendra) {
    cc.push("kendra@desertservices.net");
  }
  if (options?.ccJared) {
    cc.push("jared@desertservices.net");
  }
  if (options?.ccSales) {
    cc.push(options.ccSales);
  }

  const subject = data.isReady
    ? `RE: ${data.projectName} - Contract Acknowledged`
    : `RE: ${data.projectName} - Clarification Needed`;

  return {
    to: [toEmail],
    cc,
    subject,
    body,
  };
}

// ============================================
// CLI
// ============================================

if (import.meta.main) {
  // Example usage
  const gcResponse = renderGCResponse({
    contactName: "Laura",
    contractType: "Purchase Order",
    projectName: "Sun Health La Loma RGS",
    poNumber: "25014-21",
    isReady: true,
    coiRequired: true,
    coiStatus: { pending: true },
    senderName: "Chi Ejimofor",
    senderTitle: "Project Coordinator",
    senderEmail: "chi@desertservices.net",
    senderPhone: "(304) 216-8700",
  });

  console.log("Example GC Response Email:");
  console.log("---");
  console.log(gcResponse);
}
