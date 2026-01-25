/**
 * Email Census Project Linking
 *
 * Links emails to Monday.com ESTIMATING board items using fuzzy matching
 * on project/contractor names extracted from email content.
 */
import { GoogleGenAI } from "@google/genai";
import {
  calculateSimilarity,
  findBestMatches,
  type ScoredItem,
} from "../../monday/client";
import {
  type Email,
  type EmailClassification,
  findReplyChainSiblings,
  getAllProjectNames,
  getEmailsWithoutProjectLink,
  getLinkedConversationSibling,
  getUnlinkedEmailsWithBody,
  insertEntity,
  linkEmailToProjectWithSignal,
  searchBodyForProjectMatch,
  updateEmailProjectLink,
} from "./db";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Board ID for Monday.com ESTIMATING board
const ESTIMATING_BOARD_ID = "7943937855";

// Regex for detecting reply/forward prefixes (defined at top level for performance)
const REPLY_FWD_PREFIX_REGEX = /^(re|fw|fwd):/i;

// Categories worth linking to projects
const LINKABLE_CATEGORIES: EmailClassification[] = [
  "CONTRACT",
  "DUST_PERMIT",
  "SWPPP",
  "ESTIMATE",
  "INSURANCE",
  "CHANGE_ORDER",
];

// Minimum similarity score to consider a match
const MIN_MATCH_SCORE = 0.5;

// ============================================================================
// Types
// ============================================================================

interface ExtractedNames {
  projectName: string | null;
  contractorName: string | null;
  address: string | null;
}

interface LinkResult {
  emailId: number;
  projectName: string | null;
  contractorName: string | null;
  mondayMatch: ScoredItem | null;
}

interface LinkProgress {
  processed: number;
  total: number;
  linked: number;
  current?: {
    emailId: number;
    subject: string | null;
    matched: boolean;
  };
}

interface LinkStats {
  emailsProcessed: number;
  emailsLinked: number;
  noNamesExtracted: number;
  noMatchFound: number;
  errors: number;
}

// Multi-signal linking types
type LinkSignal = "conversation" | "sender" | "body" | "reply_chain" | "llm";

interface MultiSignalLinkResult {
  projectId: number;
  confidence: number;
  signal: LinkSignal;
}

interface MultiSignalLinkStats {
  emailsProcessed: number;
  emailsLinked: number;
  bySignal: Record<LinkSignal, number>;
  noMatch: number;
  errors: number;
}

// ============================================================================
// Name Extraction
// ============================================================================

/**
 * Extract project and contractor names from email using Gemini.
 */
export async function extractProjectNames(
  email: Email
): Promise<ExtractedNames> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is required for name extraction");
  }

  const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

  const prompt = `Extract the project name and contractor name from this email.

Context: This is a construction/landscaping services email. Project names typically include the development/property name (e.g., "Palomino Ranch", "Desert Ridge Marketplace", "Keirland Commons").
Contractor names are the general contractor or developer companies (e.g., "Lennar", "Pulte Homes", "DR Horton", "Robinhood Homes").

Email Details:
Subject: ${email.subject ?? "(no subject)"}
From: ${email.fromName ?? ""} <${email.fromEmail ?? ""}>
To: ${email.toEmails.join(", ") || "(unknown)"}
Attachments: ${email.attachmentNames.join(", ") || "(none)"}

Body Preview:
${email.bodyPreview ?? "(no content)"}

Extract the most likely project name and contractor name. If not clearly identifiable, return null for that field.`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [{ text: prompt }],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          projectName: {
            type: "STRING",
            description: "The project/development name",
          },
          contractorName: {
            type: "STRING",
            description: "The general contractor or developer company name",
          },
          address: {
            type: "STRING",
            description: "Project address if mentioned",
          },
        },
      },
    },
  });

  const result = JSON.parse(response.text || "{}") as ExtractedNames;

  return {
    projectName: result.projectName ?? null,
    contractorName: result.contractorName ?? null,
    address: result.address ?? null,
  };
}

// ============================================================================
// Monday.com Matching
// ============================================================================

/**
 * Find the best matching estimate in Monday.com for given project/contractor names.
 */
export async function findMatchingEstimate(
  names: ExtractedNames
): Promise<ScoredItem | null> {
  // Build search queries from available names
  const searchQueries: string[] = [];

  if (names.projectName) {
    searchQueries.push(names.projectName);
  }

  if (names.contractorName) {
    searchQueries.push(names.contractorName);
  }

  // If we have both, try combined search
  if (names.projectName && names.contractorName) {
    searchQueries.push(`${names.contractorName} ${names.projectName}`);
  }

  if (searchQueries.length === 0) {
    return null;
  }

  let bestMatch: ScoredItem | null = null;

  for (const query of searchQueries) {
    const matches = await findBestMatches(ESTIMATING_BOARD_ID, query, 3);

    for (const match of matches) {
      if (
        match.score >= MIN_MATCH_SCORE &&
        (!bestMatch || match.score > bestMatch.score)
      ) {
        bestMatch = match;
      }
    }
  }

  return bestMatch;
}

/**
 * Alternative: Match by comparing extracted names against item name components.
 */
export function scoreItemMatch(
  itemName: string,
  names: ExtractedNames
): number {
  let maxScore = 0;

  if (names.projectName) {
    const projectScore = calculateSimilarity(itemName, names.projectName);
    maxScore = Math.max(maxScore, projectScore);
  }

  if (names.contractorName) {
    const contractorScore = calculateSimilarity(itemName, names.contractorName);
    maxScore = Math.max(maxScore, contractorScore);
  }

  // Combined match - item name should contain parts of both
  if (names.projectName && names.contractorName) {
    const combinedName = `${names.contractorName} ${names.projectName}`;
    const combinedScore = calculateSimilarity(itemName, combinedName);
    maxScore = Math.max(maxScore, combinedScore);
  }

  return maxScore;
}

// ============================================================================
// Main Linking Functions
// ============================================================================

/**
 * Link a single email to a Monday.com estimate.
 */
export async function linkEmail(emailId: number): Promise<LinkResult> {
  // Import dynamically to avoid circular dependency
  const { getEmailById } = await import("./db");
  const email = getEmailById(emailId);

  if (!email) {
    throw new Error(`Email not found: ${emailId}`);
  }

  // Skip if not in a linkable category
  if (!email.classification) {
    return {
      emailId,
      projectName: null,
      contractorName: null,
      mondayMatch: null,
    };
  }
  if (!LINKABLE_CATEGORIES.includes(email.classification)) {
    return {
      emailId,
      projectName: null,
      contractorName: null,
      mondayMatch: null,
    };
  }

  // Extract names from email
  const names = await extractProjectNames(email);

  // Store extracted entities
  if (names.projectName) {
    insertEntity(emailId, "project", names.projectName);
  }
  if (names.contractorName) {
    insertEntity(emailId, "company", names.contractorName);
  }
  if (names.address) {
    insertEntity(emailId, "address", names.address);
  }

  // If no names extracted, skip matching
  if (!(names.projectName || names.contractorName)) {
    return {
      emailId,
      projectName: null,
      contractorName: null,
      mondayMatch: null,
    };
  }

  // Find matching Monday.com estimate
  const match = await findMatchingEstimate(names);

  // Update email with link
  updateEmailProjectLink(emailId, {
    projectName: names.projectName,
    contractorName: names.contractorName,
    mondayEstimateId: match?.id ?? null,
  });

  return {
    emailId,
    projectName: names.projectName,
    contractorName: names.contractorName,
    mondayMatch: match,
  };
}

/**
 * Link all unlinked emails in linkable categories.
 */
export async function linkAllEmails(
  options: {
    limit?: number;
    onProgress?: (progress: LinkProgress) => void;
  } = {}
): Promise<LinkStats> {
  const { limit = 1000, onProgress } = options;

  const emails = getEmailsWithoutProjectLink(LINKABLE_CATEGORIES, limit);

  const stats: LinkStats = {
    emailsProcessed: 0,
    emailsLinked: 0,
    noNamesExtracted: 0,
    noMatchFound: 0,
    errors: 0,
  };

  for (const [index, email] of emails.entries()) {
    try {
      const result = await linkEmail(email.id);

      stats.emailsProcessed++;

      if (!(result.projectName || result.contractorName)) {
        stats.noNamesExtracted++;
      } else if (result.mondayMatch) {
        stats.emailsLinked++;
      } else {
        stats.noMatchFound++;
      }

      // Report progress
      if (onProgress) {
        onProgress({
          processed: index + 1,
          total: emails.length,
          linked: stats.emailsLinked,
          current: {
            emailId: email.id,
            subject: email.subject,
            matched: result.mondayMatch !== null,
          },
        });
      }

      // Rate limiting
      if (index < emails.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    } catch (error) {
      console.error(`Failed to link email ${email.id}:`, error);
      stats.errors++;
    }
  }

  return stats;
}

/**
 * Print linking statistics.
 */
export function printLinkStats(stats: LinkStats): void {
  console.log("\n=== Project Linking Results ===\n");
  console.log(`Emails processed: ${stats.emailsProcessed}`);
  console.log(`Emails linked: ${stats.emailsLinked}`);
  console.log(`No names extracted: ${stats.noNamesExtracted}`);
  console.log(`No match found: ${stats.noMatchFound}`);
  console.log(`Errors: ${stats.errors}`);

  const linkRate =
    stats.emailsProcessed > 0
      ? ((stats.emailsLinked / stats.emailsProcessed) * 100).toFixed(1)
      : "0";
  console.log(`\nLink rate: ${linkRate}%`);
}

// ============================================================================
// Multi-Signal Linking
// ============================================================================

// Minimum sender history percentage to consider confident
const SENDER_HISTORY_THRESHOLD = 0.8;

/**
 * Try to link an email using multi-signal approach.
 * Tries signals in order of confidence: conversation > body > sender > reply_chain
 */
export function tryMultiSignalLink(
  email: Email,
  projectNames: Map<number, string>
): MultiSignalLinkResult | null {
  // Signal 1: Conversation thread (0.95 confidence)
  // If another email in the same conversation is linked, use that project
  if (email.conversationId) {
    const siblingProjectId = getLinkedConversationSibling(email.conversationId);
    if (siblingProjectId) {
      return {
        projectId: siblingProjectId,
        confidence: 0.95,
        signal: "conversation",
      };
    }
  }

  // Signal 2: Body text match (0.90 confidence)
  // Search the email body for known project names
  if (email.bodyFull) {
    const matchedProjectId = searchBodyForProjectMatch(
      email.bodyFull,
      projectNames
    );
    if (matchedProjectId) {
      return {
        projectId: matchedProjectId,
        confidence: 0.9,
        signal: "body",
      };
    }
  }

  // Signal 3: Sender history - DISABLED
  // This was causing bad links (e.g., BuildingConnected linked to one project
  // when they send bid invites for everything). Too many senders work on
  // multiple projects for this heuristic to be reliable.

  // Signal 4: Reply chain (0.80 confidence)
  // Find other emails with the same base subject
  if (email.subject && REPLY_FWD_PREFIX_REGEX.test(email.subject)) {
    const siblings = findReplyChainSiblings(email.subject);
    const linkedSibling = siblings.find((s) => s.projectId !== null);
    if (linkedSibling?.projectId) {
      return {
        projectId: linkedSibling.projectId,
        confidence: 0.8,
        signal: "reply_chain",
      };
    }
  }

  // No signal matched
  return null;
}

/**
 * Link emails using multi-signal approach (no LLM calls).
 * Much faster than LLM-based linking.
 */
export function linkEmailsMultiSignal(options: {
  limit?: number;
  onProgress?: (progress: {
    processed: number;
    total: number;
    linked: number;
    signal?: LinkSignal;
  }) => void;
}): MultiSignalLinkStats {
  const { limit = 1000, onProgress } = options;

  // Get all project names once for body matching
  const projectNames = getAllProjectNames();

  // Get unlinked emails that have body text
  const emails = getUnlinkedEmailsWithBody(limit);

  const stats: MultiSignalLinkStats = {
    emailsProcessed: 0,
    emailsLinked: 0,
    bySignal: {
      conversation: 0,
      sender: 0,
      body: 0,
      reply_chain: 0,
      llm: 0,
    },
    noMatch: 0,
    errors: 0,
  };

  for (const [index, email] of emails.entries()) {
    try {
      const result = tryMultiSignalLink(email, projectNames);

      stats.emailsProcessed++;

      if (result) {
        // Link the email to the project
        linkEmailToProjectWithSignal(
          email.id,
          result.projectId,
          result.signal,
          result.confidence
        );

        stats.emailsLinked++;
        stats.bySignal[result.signal]++;

        if (onProgress) {
          onProgress({
            processed: index + 1,
            total: emails.length,
            linked: stats.emailsLinked,
            signal: result.signal,
          });
        }
      } else {
        stats.noMatch++;

        if (onProgress) {
          onProgress({
            processed: index + 1,
            total: emails.length,
            linked: stats.emailsLinked,
          });
        }
      }
    } catch (error) {
      console.error(`Failed to link email ${email.id}:`, error);
      stats.errors++;
    }
  }

  return stats;
}

/**
 * Print multi-signal linking statistics.
 */
export function printMultiSignalStats(stats: MultiSignalLinkStats): void {
  console.log("\n=== Multi-Signal Linking Results ===\n");
  console.log(`Emails processed: ${stats.emailsProcessed}`);
  console.log(`Emails linked: ${stats.emailsLinked}`);
  console.log(`No match: ${stats.noMatch}`);
  console.log(`Errors: ${stats.errors}`);

  console.log("\nBy Signal:");
  console.log(`  Conversation thread: ${stats.bySignal.conversation}`);
  console.log(`  Body text match: ${stats.bySignal.body}`);
  console.log(`  Sender history: ${stats.bySignal.sender}`);
  console.log(`  Reply chain: ${stats.bySignal.reply_chain}`);

  const linkRate =
    stats.emailsProcessed > 0
      ? ((stats.emailsLinked / stats.emailsProcessed) * 100).toFixed(1)
      : "0";
  console.log(`\nLink rate: ${linkRate}%`);
}

// CLI entry point
if (import.meta.main) {
  const args = process.argv.slice(2);
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number.parseInt(limitArg.split("=")[1], 10) : 1000;

  // Check for multi-signal mode (default: true, use --llm for LLM mode)
  const useLlmMode = args.includes("--llm");
  const useMultiSignal = !useLlmMode;

  if (useMultiSignal) {
    console.log("Starting multi-signal project linking...\n");
    console.log(`Limit: ${limit}`);
    console.log("Mode: Multi-signal (fast, no LLM calls)");
    console.log("Signals: conversation > body > sender > reply_chain\n");

    const stats = linkEmailsMultiSignal({
      limit,
      onProgress: (p) => {
        if (p.processed % 100 === 0 || p.processed === p.total) {
          const signalInfo = p.signal ? ` [${p.signal}]` : "";
          console.log(
            `Progress: ${p.processed}/${p.total} (${p.linked} linked)${signalInfo}`
          );
        }
      },
    });

    printMultiSignalStats(stats);
  } else {
    console.log("Starting LLM-based project linking...\n");
    console.log(`Limit: ${limit}`);
    console.log(`Board: ESTIMATING (${ESTIMATING_BOARD_ID})`);
    console.log(`Linkable categories: ${LINKABLE_CATEGORIES.join(", ")}\n`);

    linkAllEmails({
      limit,
      onProgress: (p) => {
        if (p.processed % 25 === 0 || p.processed === p.total) {
          console.log(
            `Progress: ${p.processed}/${p.total} (${p.linked} linked)`
          );
        }
      },
    })
      .then((stats) => {
        printLinkStats(stats);
      })
      .catch((error) => {
        console.error("Project linking failed:", error);
        process.exit(1);
      });
  }
}
