/**
 * Email Census Classification
 *
 * Classifies emails into categories using pattern matching (fast, free)
 * with LLM fallback for low-confidence cases.
 *
 * Categories:
 * - CONTRACT: Contracts, LOIs, subcontracts
 * - DUST_PERMIT: Permit requests/renewals
 * - SWPPP: SWPPP plans, NOIs, inspections
 * - ESTIMATE: Bid invites, RFPs, quotes
 * - INSURANCE: COI requests, certificates
 * - INVOICE: Billing, pay apps
 * - SCHEDULE: Project schedules, meetings
 * - CHANGE_ORDER: Scope changes, CO requests
 * - INTERNAL: Team correspondence
 * - VENDOR: Supplier communications
 * - SPAM: Marketing, irrelevant
 * - UNKNOWN: Needs review
 */
import { GoogleGenAI } from "@google/genai";
import {
  type ClassificationMethod,
  type Email,
  type EmailClassification,
  getUnclassifiedEmails,
  updateEmailClassification,
} from "./db";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ============================================================================
// Pattern Definitions
// ============================================================================

interface PatternRule {
  classification: EmailClassification;
  subjectPatterns?: RegExp[];
  senderPatterns?: RegExp[];
  attachmentPatterns?: RegExp[];
  bodyPatterns?: RegExp[];
  weight?: number;
}

const CLASSIFICATION_RULES: PatternRule[] = [
  // CONTRACT - highest priority for contract-related emails
  {
    classification: "CONTRACT",
    subjectPatterns: [
      /\bsubcontract/i,
      /\bloi\b/i,
      /\bletter of intent/i,
      /\bagreement\b.*\b(sign|execute)/i,
      /\bcontract\b.*\b(sign|execute|review)/i,
      /\bdocusign/i,
      /\bexecuted\b/i,
      /\bfully executed/i,
      /\bsigned contract/i,
      /\bpsa\b/i,
      /\bsubcontractor agreement/i,
    ],
    senderPatterns: [/docusign/i, /pandadoc/i, /hellosign/i],
    attachmentPatterns: [
      /agreement\.pdf/i,
      /contract\.pdf/i,
      /loi\.pdf/i,
      /subcontract/i,
    ],
    weight: 1.0,
  },

  // DUST_PERMIT
  {
    classification: "DUST_PERMIT",
    subjectPatterns: [
      /\bdust permit/i,
      /\badeq\b/i,
      /\bpermit application/i,
      /\bdust control/i,
      /\bearth moving permit/i,
      /\bgrading permit/i,
    ],
    senderPatterns: [/adeq/i, /maricopa.*air/i, /pinal.*air/i],
    attachmentPatterns: [/dust.*permit/i, /adeq/i],
    weight: 0.95,
  },

  // SWPPP
  {
    classification: "SWPPP",
    subjectPatterns: [
      /\bswppp\b/i,
      /\bnoi\b/i,
      /\bstormwater/i,
      /\bbmp\b/i,
      /\berosion control/i,
      /\bwppp\b/i,
      /\bnot\b/i,
      /\bnotice of termination/i,
    ],
    attachmentPatterns: [/swppp/i, /noi.*form/i, /stormwater/i],
    weight: 0.95,
  },

  // ESTIMATE / BID
  {
    classification: "ESTIMATE",
    subjectPatterns: [
      /\bbid\b.*\b(invite|request|submission)/i,
      /\brfp\b/i,
      /\brequest for proposal/i,
      /\bquote\b.*\b(request|needed)/i,
      /\bestimate\b.*\b(request|needed)/i,
      /\bpricing\b.*\brequest/i,
      /\binvitation to bid/i,
      /\bitb\b/i,
      /\bbid due/i,
      /\btakeoff/i,
    ],
    senderPatterns: [/buildingconnected/i, /procore/i, /planhub/i, /isqft/i],
    attachmentPatterns: [
      /bid.*form/i,
      /rfp/i,
      /scope.*work/i,
      /specifications/i,
    ],
    weight: 0.9,
  },

  // INSURANCE
  {
    classification: "INSURANCE",
    subjectPatterns: [
      /\bcoi\b/i,
      /\bcertificate of insurance/i,
      /\binsurance.*certificate/i,
      /\bacord\b/i,
      /\badditional insured/i,
      /\bliability.*insurance/i,
      /\bworkers comp/i,
    ],
    senderPatterns: [/insurance/i, /broker/i, /acord/i],
    attachmentPatterns: [/coi/i, /certificate.*insurance/i, /acord/i],
    weight: 0.9,
  },

  // INVOICE
  {
    classification: "INVOICE",
    subjectPatterns: [
      /\binvoice\b/i,
      /\bpay app/i,
      /\bpayment application/i,
      /\bbilling\b/i,
      /\bpayment\b.*\bdue/i,
      /\bremittance/i,
      /\bpast due/i,
    ],
    attachmentPatterns: [/invoice/i, /pay.*app/i, /billing/i],
    weight: 0.85,
  },

  // SCHEDULE
  {
    classification: "SCHEDULE",
    subjectPatterns: [
      /\bschedule\b.*\b(update|meeting|review)/i,
      /\bmeeting\b.*\b(invite|agenda)/i,
      /\bstart date/i,
      /\bmobiliz/i,
      /\bpreconstruction/i,
      /\bkickoff/i,
      /\bproject.*meeting/i,
    ],
    weight: 0.8,
  },

  // CHANGE_ORDER
  {
    classification: "CHANGE_ORDER",
    subjectPatterns: [
      /\bchange order/i,
      /\bco\s*#?\s*\d+/i,
      /\badditional work/i,
      /\bscope change/i,
      /\bpco\b/i,
      /\bpotential change/i,
      /\bextra work/i,
    ],
    attachmentPatterns: [/change.*order/i, /co\d+/i],
    weight: 0.85,
  },

  // SPAM - low priority patterns
  {
    classification: "SPAM",
    subjectPatterns: [
      /\bunsubscribe/i,
      /\bnewsletter/i,
      /\bpromotional/i,
      /\bmarketing/i,
      /\bspecial offer/i,
      /\bdiscount/i,
      /\bfree\b/i,
      /\bwebinar/i,
    ],
    senderPatterns: [
      /noreply/i,
      /no-reply/i,
      /marketing/i,
      /newsletter/i,
      /mailchimp/i,
      /constantcontact/i,
    ],
    weight: 0.7,
  },

  // VENDOR - generic vendor communications
  {
    classification: "VENDOR",
    subjectPatterns: [
      /\border confirmation/i,
      /\bshipment/i,
      /\bdelivery/i,
      /\btracking/i,
      /\bpurchase order/i,
      /\bpo\s*#?\s*\d+/i,
    ],
    weight: 0.75,
  },
];

// Known internal domains
const INTERNAL_DOMAINS = ["desertservices.net"];

// ============================================================================
// Pattern Classification
// ============================================================================

interface ClassificationResult {
  classification: EmailClassification;
  confidence: number;
  method: ClassificationMethod;
  matchedPatterns?: string[];
}

function matchesAnyPattern(text: string | null, patterns?: RegExp[]): string[] {
  if (!(text && patterns)) {
    return [];
  }
  const matches: string[] = [];
  for (const pattern of patterns) {
    if (pattern.test(text)) {
      matches.push(pattern.source);
    }
  }
  return matches;
}

function isInternalEmail(email: Email): boolean {
  const fromDomain = email.fromEmail?.split("@")[1]?.toLowerCase();
  const toDomains = email.toEmails.map((e) => e.split("@")[1]?.toLowerCase());

  // Check if both sender and all recipients are internal
  const senderIsInternal = fromDomain
    ? INTERNAL_DOMAINS.includes(fromDomain)
    : false;
  const allRecipientsInternal =
    toDomains.length > 0 &&
    toDomains.every((d) => d && INTERNAL_DOMAINS.includes(d));

  return senderIsInternal && allRecipientsInternal;
}

/**
 * Classify an email using pattern matching.
 * Returns the best matching classification with confidence score.
 */
export function classifyByPattern(email: Email): ClassificationResult {
  // Check for internal emails first
  if (isInternalEmail(email)) {
    return {
      classification: "INTERNAL",
      confidence: 0.9,
      method: "pattern",
      matchedPatterns: ["internal_domain"],
    };
  }

  let bestMatch: ClassificationResult = {
    classification: "UNKNOWN",
    confidence: 0,
    method: "pattern",
  };

  const attachmentNamesStr = email.attachmentNames.join(" ");

  for (const rule of CLASSIFICATION_RULES) {
    let score = 0;
    const matchedPatterns: string[] = [];

    // Subject matches (highest weight)
    const subjectMatches = matchesAnyPattern(
      email.subject,
      rule.subjectPatterns
    );
    if (subjectMatches.length > 0) {
      score += 0.5 * subjectMatches.length;
      matchedPatterns.push(...subjectMatches.map((p) => `subject:${p}`));
    }

    // Sender matches
    const senderMatches = matchesAnyPattern(
      email.fromEmail,
      rule.senderPatterns
    );
    if (senderMatches.length > 0) {
      score += 0.3 * senderMatches.length;
      matchedPatterns.push(...senderMatches.map((p) => `sender:${p}`));
    }

    // Attachment matches
    const attachmentMatches = matchesAnyPattern(
      attachmentNamesStr,
      rule.attachmentPatterns
    );
    if (attachmentMatches.length > 0) {
      score += 0.3 * attachmentMatches.length;
      matchedPatterns.push(...attachmentMatches.map((p) => `attachment:${p}`));
    }

    // Body preview matches (lower weight)
    const bodyMatches = matchesAnyPattern(email.bodyPreview, rule.bodyPatterns);
    if (bodyMatches.length > 0) {
      score += 0.2 * bodyMatches.length;
      matchedPatterns.push(...bodyMatches.map((p) => `body:${p}`));
    }

    // Apply rule weight
    const weightedScore = score * (rule.weight ?? 1.0);

    // Normalize to 0-1 range (cap at 0.95 for pattern matching)
    const confidence = Math.min(weightedScore / 1.5, 0.95);

    if (confidence > bestMatch.confidence) {
      bestMatch = {
        classification: rule.classification,
        confidence,
        method: "pattern",
        matchedPatterns,
      };
    }
  }

  return bestMatch;
}

// ============================================================================
// LLM Classification
// ============================================================================

interface LLMClassificationResponse {
  classification: EmailClassification;
  confidence: number;
  reasoning: string;
}

/**
 * Classify an email using Gemini LLM.
 * Use for low-confidence pattern matches or unknown emails.
 */
export async function classifyByLLM(
  email: Email
): Promise<ClassificationResult> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is required for LLM classification");
  }

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  const prompt = `Classify this email into one of these categories:
- CONTRACT: Contracts, LOIs, subcontracts, DocuSign, agreements
- DUST_PERMIT: ADEQ permits, dust control permits, grading permits
- SWPPP: Stormwater plans, NOIs, BMPs, erosion control
- ESTIMATE: Bid invites, RFPs, quotes, pricing requests
- INSURANCE: COI requests, insurance certificates, Acord forms
- INVOICE: Invoices, pay apps, billing, payment requests
- SCHEDULE: Project schedules, meetings, mobilization
- CHANGE_ORDER: Change orders, scope changes, additional work
- INTERNAL: Internal team correspondence
- VENDOR: Supplier/vendor communications, deliveries, orders
- SPAM: Marketing, newsletters, promotional
- UNKNOWN: Cannot determine category

Email Details:
Subject: ${email.subject ?? "(no subject)"}
From: ${email.fromName ?? ""} <${email.fromEmail ?? ""}>
To: ${email.toEmails.join(", ") || "(unknown)"}
Attachments: ${email.attachmentNames.join(", ") || "(none)"}
Preview: ${email.bodyPreview?.substring(0, 500) ?? "(no preview)"}

Classify this email. Consider the construction/landscaping services context.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ text: prompt }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          classification: {
            type: "STRING",
            description: "The email category",
            enum: [
              "CONTRACT",
              "DUST_PERMIT",
              "SWPPP",
              "ESTIMATE",
              "INSURANCE",
              "INVOICE",
              "SCHEDULE",
              "CHANGE_ORDER",
              "INTERNAL",
              "VENDOR",
              "SPAM",
              "UNKNOWN",
            ],
          },
          confidence: {
            type: "NUMBER",
            description: "Confidence score 0-1",
          },
          reasoning: {
            type: "STRING",
            description: "Brief explanation for the classification",
          },
        },
        required: ["classification", "confidence"],
      },
    },
  });

  const result = JSON.parse(response.text || "{}") as LLMClassificationResponse;

  return {
    classification: result.classification ?? "UNKNOWN",
    confidence: result.confidence ?? 0.5,
    method: "llm",
    matchedPatterns: result.reasoning ? [result.reasoning] : undefined,
  };
}

// ============================================================================
// Main Classification Functions
// ============================================================================

interface ClassifyOptions {
  /** Confidence threshold below which LLM is used (default: 0.6) */
  llmThreshold?: number;
  /** Skip LLM entirely (default: false) */
  patternOnly?: boolean;
  /** Callback for progress updates */
  onProgress?: (progress: ClassifyProgress) => void;
}

interface ClassifyProgress {
  processed: number;
  total: number;
  current?: {
    emailId: number;
    subject: string | null;
    classification: EmailClassification;
    method: ClassificationMethod;
  };
}

/**
 * Classify a single email with optional LLM fallback.
 */
export async function classifyEmail(
  email: Email,
  options: ClassifyOptions = {}
): Promise<ClassificationResult> {
  const { llmThreshold = 0.6, patternOnly = false } = options;

  // First try pattern matching
  const patternResult = classifyByPattern(email);

  // If pattern confidence is high enough, use it
  if (patternResult.confidence >= llmThreshold || patternOnly) {
    return patternResult;
  }

  // Otherwise, try LLM classification
  try {
    const llmResult = await classifyByLLM(email);
    return llmResult;
  } catch (error) {
    // If LLM fails, fall back to pattern result
    console.warn(
      `LLM classification failed for email ${email.id}:`,
      error instanceof Error ? error.message : error
    );
    return patternResult;
  }
}

/**
 * Classify all unclassified emails in the database.
 */
export async function classifyAllEmails(
  options: ClassifyOptions = {}
): Promise<ClassificationStats> {
  const { onProgress } = options;
  const emails = getUnclassifiedEmails();

  const stats: ClassificationStats = {
    total: emails.length,
    classified: 0,
    byMethod: { pattern: 0, llm: 0 },
    byCategory: {} as Record<EmailClassification, number>,
    errors: 0,
  };

  for (const [index, email] of emails.entries()) {
    try {
      const result = await classifyEmail(email, options);

      // Update database
      updateEmailClassification(
        email.id,
        result.classification,
        result.confidence,
        result.method
      );

      // Update stats
      stats.classified++;
      stats.byMethod[result.method]++;
      stats.byCategory[result.classification] =
        (stats.byCategory[result.classification] ?? 0) + 1;

      // Report progress
      if (onProgress) {
        onProgress({
          processed: index + 1,
          total: emails.length,
          current: {
            emailId: email.id,
            subject: email.subject,
            classification: result.classification,
            method: result.method,
          },
        });
      }
    } catch (error) {
      console.error(`Failed to classify email ${email.id}:`, error);
      stats.errors++;
    }
  }

  return stats;
}

interface ClassificationStats {
  total: number;
  classified: number;
  byMethod: { pattern: number; llm: number };
  byCategory: Partial<Record<EmailClassification, number>>;
  errors: number;
}

/**
 * Reclassify emails that have low confidence scores.
 */
export async function reclassifyLowConfidence(
  threshold = 0.5,
  _options: ClassifyOptions = {}
): Promise<ClassificationStats> {
  // Import here to avoid circular dependency
  const { getLowConfidenceEmails } = await import("./db");
  const emails = getLowConfidenceEmails(threshold, 1000);

  const stats: ClassificationStats = {
    total: emails.length,
    classified: 0,
    byMethod: { pattern: 0, llm: 0 },
    byCategory: {} as Record<EmailClassification, number>,
    errors: 0,
  };

  for (const email of emails) {
    try {
      // Force LLM for low-confidence reclassification
      const result = await classifyByLLM(email);

      updateEmailClassification(
        email.id,
        result.classification,
        result.confidence,
        result.method
      );

      stats.classified++;
      stats.byMethod.llm++;
      stats.byCategory[result.classification] =
        (stats.byCategory[result.classification] ?? 0) + 1;
    } catch (error) {
      console.error(`Failed to reclassify email ${email.id}:`, error);
      stats.errors++;
    }
  }

  return stats;
}

/**
 * Print classification statistics.
 */
export function printClassificationStats(stats: ClassificationStats): void {
  console.log("\n=== Classification Results ===\n");
  console.log(`Total emails: ${stats.total}`);
  console.log(`Classified: ${stats.classified}`);
  console.log(`Errors: ${stats.errors}`);
  console.log(
    `\nBy method: Pattern=${stats.byMethod.pattern}, LLM=${stats.byMethod.llm}`
  );

  console.log("\nBy category:");
  const sortedCategories = Object.entries(stats.byCategory).sort(
    ([, a], [, b]) => (b ?? 0) - (a ?? 0)
  );
  for (const [category, count] of sortedCategories) {
    console.log(`  ${category}: ${count}`);
  }
}

// CLI entry point
if (import.meta.main) {
  const args = process.argv.slice(2);
  const patternOnly = args.includes("--pattern-only");
  const threshold = args.find((a) => a.startsWith("--threshold="));
  const llmThreshold = threshold
    ? Number.parseFloat(threshold.split("=")[1])
    : 0.6;

  console.log("Starting email classification...\n");
  console.log(`Pattern-only: ${patternOnly}`);
  console.log(`LLM threshold: ${llmThreshold}\n`);

  classifyAllEmails({
    patternOnly,
    llmThreshold,
    onProgress: (p) => {
      if (p.processed % 100 === 0 || p.processed === p.total) {
        console.log(`Progress: ${p.processed}/${p.total}`);
      }
    },
  })
    .then((stats) => {
      printClassificationStats(stats);
    })
    .catch((error) => {
      console.error("Classification failed:", error);
      process.exit(1);
    });
}
