/**
 * Email Discovery Engine
 *
 * Combines Outlook conversation_id with JWZ-style threading and multi-signal
 * discovery to find all related emails and documents for a seed email.
 *
 * Features:
 * - Thread-based discovery (Outlook conversation_id)
 * - JWZ-style subject normalization and threading
 * - Multi-signal project linking
 * - Attachment-based discovery
 * - Date proximity matching
 * - Feedback mechanism for corrections
 */

import { Database } from "bun:sqlite";
import { join } from "node:path";
import type {
  Attachment,
  ClassificationMethod,
  Email,
  EmailClassification,
  ExtractionStatus,
} from "./db";

// Re-export types for convenience
export type { Attachment, Email } from "./db";

const dbPath = join(import.meta.dir, "census.db");
const db = new Database(dbPath);

// ============================================================================
// Regex Patterns (module-level for performance)
// ============================================================================

const RE_REPLY_PREFIX = /^re:\s*/i;
const RE_FORWARD_PREFIX = /^fwd?:\s*/i;
const RE_FW_PREFIX = /^fw:\s*/i;
const RE_TAG_BRACKETS = /^\[.*?\]\s*/g;
const RE_RFC2047_ENCODED = /=\?[^?]+\?[^?]+\?[^?]+\?=/g;
const RE_WHITESPACE = /\s+/g;
const RE_TRAILING_PARENS = /\s*\(.*?\)\s*$/;
const RE_TRAILING_BRACKETS = /\s*\[.*?\]\s*$/;
const RE_WORD_SPLIT = /\s+/;
const RE_PROJECT_CODE_6DIGIT = /\b(\d{6})\b/;
const RE_PROJECT_CODE_FORMAT = /\b(\d{2}-\d{4})\b/;
const RE_NON_WORD_SPACE = /[^\w\s]/g;
const RE_NON_WORD = /[^\w]/g;
const RE_GENERIC_IMAGE = /^image\d+\.(png|jpg|gif|jpeg)$/i;
const RE_INLINE_IMAGE = /^inlineImage$/i;
const RE_LOGO_PREFIX = /^logo/i;
const RE_SIGNATURE_PREFIX = /^signature/i;
const RE_APPLICATION_PAYMENT = /^Application for Payment\.pdf$/i;
const RE_REPORT_FROM_DESERT = /^Report_from_DESERT_SERVICES/i;
const RE_LOGO_DASH = /-logo[-.]|logo-/i;
const RE_REPLY_PREFIXES = /^(re:|fw:|fwd:|replied:?\s*)+/gi;
const RE_MULTIPLE_SPACES = /\s+/g;
const RE_BRACKETED_PROJECT = /^\[([^\]]+)\]/;
const RE_DASH_PROJECT = /^([a-zA-Z][^-]+)\s*-/;
const RE_SUFFIX_PATTERN =
  /\s+(Bldg|Building|Phase|Lot|Block|Unit|Suite|Ste|Ph|PH)\s*\w*$/i;
const RE_PROJECT_CODE_MIXED = /\b(\d{2}-\d{3,4}|\d{5,6}|[A-Z]{2,3}\d{3,4})\b/i;
const RE_KEYWORD_BEFORE_LOCATION = /^(\w+(?:\s+\w+)?)\s+(?:at|in|of)\s+/i;
const RE_MORNING_CHECKIN = /Morning Check-in/i;
const RE_CHECKIN_PREFIX = /^Check-in:/i;
const RE_COMPLIANCE_NOTICE = /Compliance Notice -.*Desert Services/i;
const RE_ACCOUNT_RENEWS = /Your account renews/i;

// ============================================================================
// Types
// ============================================================================

export interface DiscoveryResult {
  seedEmailId: number;
  emails: DiscoveredEmail[];
  attachments: DiscoveredAttachment[];
  groups: EmailGroup[];
  confidence: number;
  signals: Signal[];
  metadata: {
    totalEmails: number;
    totalAttachments: number;
    discoveryMethod: string;
    discoveredAt: string;
  };
}

export interface DiscoveredEmail extends Email {
  discoveryReason: string[];
  confidence: number;
  groupId?: string;
}

export interface DiscoveredAttachment extends Attachment {
  discoveryReason: string[];
  confidence: number;
  relatedEmailIds: number[];
}

export interface EmailGroup {
  id: string;
  name: string;
  type: "thread" | "project" | "subject" | "date" | "attachment";
  emails: number[];
  confidence: number;
  metadata?: Record<string, unknown>;
}

export interface Signal {
  type: "thread" | "project" | "subject" | "attachment" | "date" | "domain";
  confidence: number;
  description: string;
  emailIds: number[];
}

export interface Feedback {
  emailId: number;
  action: "include" | "exclude" | "regroup";
  reason?: string;
  targetGroupId?: string;
}

// ============================================================================
// JWZ Algorithm Implementation
// ============================================================================

/**
 * JWZ-style subject normalization
 * Based on RFC 5256 and JWZ algorithm
 *
 * Steps:
 * 1. Remove reply prefixes (Re:, Fwd:, FW:)
 * 2. Remove RFC 2047 encoded words
 * 3. Remove trailing whitespace
 * 4. Normalize case
 * 5. Remove extra whitespace
 */
function normalizeSubjectJWZ(subject: string): string {
  if (!subject) {
    return "";
  }

  let normalized = subject.trim();

  // Step 1: Remove reply prefixes (case-insensitive, multiple passes)
  const replyPrefixes = [
    RE_REPLY_PREFIX,
    RE_FORWARD_PREFIX,
    RE_FW_PREFIX,
    RE_TAG_BRACKETS, // Remove [tags]
  ];

  for (const prefix of replyPrefixes) {
    normalized = normalized.replace(prefix, "");
  }

  // Step 2: Remove RFC 2047 encoded words (simplified)
  // Format: =?charset?encoding?text?=
  normalized = normalized.replace(RE_RFC2047_ENCODED, "");

  // Step 3: Normalize whitespace
  normalized = normalized.replace(RE_WHITESPACE, " ").trim();

  // Step 4: Normalize case (lowercase for matching)
  normalized = normalized.toLowerCase();

  return normalized;
}

/**
 * Extract base subject for threading
 * Removes common variations while preserving core meaning
 */
function extractBaseSubject(subject: string): string {
  const normalized = normalizeSubjectJWZ(subject);

  // Remove common suffixes that don't affect threading
  const suffixes = [
    RE_TRAILING_PARENS, // Remove trailing parentheses
    RE_TRAILING_BRACKETS, // Remove trailing brackets
  ];

  let base = normalized;
  for (const suffix of suffixes) {
    base = base.replace(suffix, "");
  }

  return base.trim();
}

/**
 * Calculate subject similarity using JWZ-style matching
 * Returns similarity score 0-1
 */
function subjectSimilarity(subject1: string, subject2: string): number {
  const base1 = extractBaseSubject(subject1);
  const base2 = extractBaseSubject(subject2);

  // Exact match
  if (base1 === base2) {
    return 1.0;
  }

  // One contains the other (substring match)
  if (base1.includes(base2) || base2.includes(base1)) {
    const shorter = Math.min(base1.length, base2.length);
    const longer = Math.max(base1.length, base2.length);
    return shorter / longer; // Ratio of overlap
  }

  // Word overlap
  const words1 = new Set(
    base1.split(RE_WORD_SPLIT).filter((w) => w.length > 2)
  );
  const words2 = new Set(
    base2.split(RE_WORD_SPLIT).filter((w) => w.length > 2)
  );

  if (words1.size === 0 || words2.size === 0) {
    return 0;
  }

  const intersection = new Set([...words1].filter((w) => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size; // Jaccard similarity
}

// ============================================================================
// Discovery Engine
// ============================================================================

export class EmailDiscoveryEngine {
  private readonly feedbackCache: Map<number, Feedback[]> = new Map();

  /**
   * Discover all related emails and documents for a seed email
   */
  // biome-ignore lint/suspicious/useAwait: Method signature requires Promise return type for interface compatibility
  async discover(
    seedEmailId: number,
    options?: {
      maxResults?: number;
      minConfidence?: number;
      includeFeedback?: boolean;
      projectMatchMode?: "strict" | "moderate" | "loose"; // How strict to be with project name matching
    }
  ): Promise<DiscoveryResult> {
    const maxResults = options?.maxResults ?? 100;
    const minConfidence = options?.minConfidence ?? 0.3;
    const projectMatchMode = options?.projectMatchMode ?? "moderate";

    // Get seed email
    const seedEmail = this.getEmail(seedEmailId);
    if (!seedEmail) {
      throw new Error(`Email ${seedEmailId} not found`);
    }

    const discoveredEmails = new Map<number, DiscoveredEmail>();
    const discoveredAttachments = new Map<number, DiscoveredAttachment>();
    const signals: Signal[] = [];
    const groups: EmailGroup[] = [];

    // ========================================================================
    // Signal 1: Thread-based discovery (Outlook conversation_id)
    // ========================================================================
    if (seedEmail.conversationId) {
      const threadEmails = this.getThreadByConversationId(
        seedEmail.conversationId
      );

      if (threadEmails.length > 0) {
        signals.push({
          type: "thread",
          confidence: 1.0,
          description: `Found ${threadEmails.length} emails in thread`,
          emailIds: threadEmails.map((e) => e.id),
        });

        // Create thread group
        groups.push({
          id: `thread-${seedEmail.conversationId}`,
          name: `Thread: ${seedEmail.subject || "No subject"}`,
          type: "thread",
          emails: threadEmails.map((e) => e.id),
          confidence: 1.0,
          metadata: {
            conversationId: seedEmail.conversationId,
            threadSize: threadEmails.length,
          },
        });

        // Add emails to discovered set
        for (const email of threadEmails) {
          discoveredEmails.set(email.id, {
            ...email,
            discoveryReason: ["thread"],
            confidence: 1.0,
            groupId: `thread-${seedEmail.conversationId}`,
          });

          // Also get attachments from thread emails
          const threadAttachments = this.getAttachmentsForEmail(email.id);
          for (const att of threadAttachments) {
            if (att.storagePath) {
              // Only include attachments with storage path
              discoveredAttachments.set(att.id, {
                ...att,
                discoveryReason: ["thread"],
                confidence: 1.0,
                relatedEmailIds: [email.id],
              });
            }
          }
        }
      }
    }

    // ========================================================================
    // Signal 2: JWZ-style subject threading
    // ========================================================================
    const jwzBaseSubject = extractBaseSubject(seedEmail.subject || "");
    if (jwzBaseSubject) {
      const subjectMatches = this.findEmailsBySubject(
        jwzBaseSubject,
        seedEmailId
      );

      if (subjectMatches.length > 0) {
        const avgSimilarity =
          subjectMatches.reduce((sum, m) => sum + m.similarity, 0) /
          subjectMatches.length;

        signals.push({
          type: "subject",
          confidence: avgSimilarity,
          description: `Found ${subjectMatches.length} emails with similar subject`,
          emailIds: subjectMatches.map((m) => m.email.id),
        });

        // Create subject group if not already in thread group
        const newMatches = subjectMatches.filter(
          (m) => !discoveredEmails.has(m.email.id)
        );

        if (newMatches.length > 0) {
          groups.push({
            id: `subject-${jwzBaseSubject.substring(0, 20)}`,
            name: `Subject: ${seedEmail.subject?.substring(0, 50) || "No subject"}`,
            type: "subject",
            emails: newMatches.map((m) => m.email.id),
            confidence: avgSimilarity,
            metadata: {
              baseSubject: jwzBaseSubject,
              similarity: avgSimilarity,
            },
          });

          for (const match of newMatches) {
            discoveredEmails.set(match.email.id, {
              ...match.email,
              discoveryReason: ["subject"],
              confidence: match.similarity,
              groupId: `subject-${jwzBaseSubject.substring(0, 20)}`,
            });
          }
        }
      }
    }

    // ========================================================================
    // Signal 3: Project-based discovery
    // ========================================================================
    const project = this.extractProjectFromEmail(seedEmail);
    if (project) {
      console.log(`[DEBUG] Found project: ${project.name} (ID: ${project.id})`);

      // Find emails linked to this project
      const projectEmails = this.findEmailsByProject(project.id, seedEmailId);

      // Also find emails with project name in subject/body (broader search)
      const projectNameEmails = this.findEmailsByProjectName(
        project.name,
        seedEmailId
      );

      // Also search by project aliases (e.g., "Legacy Sports Arena" for "Fire & Ice")
      const aliasEmails: Email[] = [];
      const aliases = this.getProjectAliases(project.id);
      for (const alias of aliases) {
        const aliasMatches = this.findEmailsByProjectName(alias, seedEmailId);
        for (const email of aliasMatches) {
          if (!aliasEmails.some((e) => e.id === email.id)) {
            aliasEmails.push(email);
          }
        }
      }

      // Combine and deduplicate
      // Prioritize emails with project_id set, then add project name matches
      const allProjectEmails = new Map<number, Email>();

      // First, add emails with project_id (most reliable) - no date filter needed
      for (const email of projectEmails) {
        allProjectEmails.set(email.id, email);
      }

      // Add alias matches (high confidence - explicit mapping)
      for (const email of aliasEmails) {
        if (!allProjectEmails.has(email.id)) {
          allProjectEmails.set(email.id, email);
        }
      }

      // Then add project name matches, but filter VERY strictly
      // Extract project code from seed email if available
      const seedEmailText = `${seedEmail.subject || ""} ${seedEmail.bodyPreview || ""}`;
      const projectCodeMatch =
        seedEmailText.match(RE_PROJECT_CODE_6DIGIT) ||
        seedEmailText.match(RE_PROJECT_CODE_FORMAT);
      const projectCode = projectCodeMatch ? projectCodeMatch[1] : null;

      const allProjectWords = project.name
        .toLowerCase()
        .split(RE_WORD_SPLIT)
        .filter((w) => w.length > 3);

      // Filter out generic filler words for matching (same as findEmailsByProjectName)
      const FILLER_WORDS = new Set([
        "legacy",
        "project",
        "phase",
        "building",
        "center",
        "plaza",
        "development",
      ]);
      const projectNameWords =
        allProjectWords.filter((w) => !FILLER_WORDS.has(w)).length >= 2
          ? allProjectWords.filter((w) => !FILLER_WORDS.has(w))
          : allProjectWords;

      // Date range: only include emails within 180 days of seed email (6 months)
      const seedDate = new Date(seedEmail.receivedAt);
      const dateRange = {
        start: new Date(seedDate),
        end: new Date(seedDate),
      };
      dateRange.start.setDate(dateRange.start.getDate() - 180);
      dateRange.end.setDate(dateRange.end.getDate() + 180);

      // Bucket project IDs (catch-all projects like _Bids, _Admin)
      // Emails linked to these are often about specific projects but weren't directly linked
      const BUCKET_PROJECT_IDS = new Set([99, 100, 101]); // _IT, _Admin, _Bids

      for (const email of projectNameEmails) {
        if (!allProjectEmails.has(email.id)) {
          // EXCLUDE if email is linked to a DIFFERENT project
          // BUT allow emails linked to bucket projects (they're often about specific projects)
          if (
            email.projectId &&
            email.projectId !== project.id &&
            !BUCKET_PROJECT_IDS.has(email.projectId)
          ) {
            continue; // Skip - this is a false positive
          }
          // Email is in a bucket project - allow if it matches well

          // Date filter: only include emails within 180 days
          const emailDate = new Date(email.receivedAt);
          if (emailDate < dateRange.start || emailDate > dateRange.end) {
            continue; // Skip emails outside date range
          }

          const emailText =
            `${email.subject || ""} ${email.bodyPreview || ""}`.toLowerCase();

          // Priority 1: Has project code (highest confidence - always include)
          if (projectCode) {
            const codePattern = new RegExp(`\\b${projectCode}\\b`, "i");
            if (codePattern.test(emailText)) {
              allProjectEmails.set(email.id, email);
              continue;
            }
          }

          // Priority 2: Has ALL project words as a phrase in subject (high confidence)
          // Check for phrase match first (e.g., "Rita Ranch Sprouts" together)
          const phrasePattern = project.name
            .toLowerCase()
            .replace(RE_NON_WORD_SPACE, " ");
          if (email.subject?.toLowerCase().includes(phrasePattern)) {
            allProjectEmails.set(email.id, email);
            continue;
          }

          // Priority 3: Has ALL project words in subject (moderate confidence)
          if (projectNameWords.length >= 2 && email.subject) {
            const subjectLower = email.subject.toLowerCase();
            const hasAllWords = projectNameWords.every((word) =>
              subjectLower.includes(word)
            );
            if (hasAllWords) {
              // Only include if matchMode is not 'strict'
              if (projectMatchMode !== "strict") {
                allProjectEmails.set(email.id, email);
              }
              continue;
            }
          }

          // Priority 4: Has ALL project words in body (lower confidence)
          // This catches emails like "Morning Check-in" that mention projects in body
          if (projectMatchMode !== "strict" && projectNameWords.length >= 2) {
            const hasAllWordsInBody = projectNameWords.every((word) =>
              emailText.includes(word)
            );
            if (hasAllWordsInBody) {
              allProjectEmails.set(email.id, email);
              continue;
            }
          }

          // Priority 5: Has at least 2 project words (lowest confidence)
          // Only include if matchMode is 'loose'
          if (projectMatchMode === "loose" && projectNameWords.length >= 2) {
            const matchingWords = projectNameWords.filter((word) =>
              emailText.includes(word)
            );
            if (matchingWords.length >= 2) {
              allProjectEmails.set(email.id, email);
            }
          }
        }
      }

      const combinedProjectEmails = Array.from(allProjectEmails.values());

      if (combinedProjectEmails.length > 0) {
        signals.push({
          type: "project",
          confidence: 0.85,
          description: `Found ${combinedProjectEmails.length} emails for project: ${project.name}`,
          emailIds: combinedProjectEmails.map((e) => e.id),
        });

        const newProjectEmails = combinedProjectEmails.filter(
          (e) => !discoveredEmails.has(e.id)
        );

        if (newProjectEmails.length > 0) {
          groups.push({
            id: `project-${project.id}`,
            name: `Project: ${project.name}`,
            type: "project",
            emails: newProjectEmails.map((e) => e.id),
            confidence: 0.85,
            metadata: {
              projectId: project.id,
              projectName: project.name,
            },
          });

          for (const email of newProjectEmails) {
            const existing = discoveredEmails.get(email.id);
            if (existing) {
              existing.discoveryReason.push("project");
              existing.confidence = Math.max(existing.confidence, 0.85);
              if (!existing.groupId) {
                existing.groupId = `project-${project.id}`;
              }
            } else {
              discoveredEmails.set(email.id, {
                ...email,
                discoveryReason: ["project"],
                confidence: 0.85,
                groupId: `project-${project.id}`,
              });
            }
          }
        }
      }
    } else {
      console.log(`[DEBUG] No project found for email ${seedEmailId}`);
    }

    // ========================================================================
    // Signal 4: Attachment-based discovery
    // ========================================================================
    const seedAttachments = this.getAttachmentsForEmail(seedEmailId);

    // Add seed email attachments
    for (const att of seedAttachments) {
      discoveredAttachments.set(att.id, {
        ...att,
        discoveryReason: ["seed_email"],
        confidence: 1.0,
        relatedEmailIds: [seedEmailId],
      });
    }

    // Find other emails with same attachment names
    // EXCLUDE generic attachment names that cause false positives
    const genericAttachmentPatterns = [
      RE_GENERIC_IMAGE, // image001.png, etc.
      RE_INLINE_IMAGE,
      RE_LOGO_PREFIX,
      RE_SIGNATURE_PREFIX,
      RE_APPLICATION_PAYMENT,
      RE_REPORT_FROM_DESERT,
      RE_LOGO_DASH,
    ];

    const isGenericAttachment = (name: string): boolean => {
      return genericAttachmentPatterns.some((pattern) => pattern.test(name));
    };

    for (const att of seedAttachments) {
      if (att.name && !isGenericAttachment(att.name)) {
        const relatedEmails = this.findEmailsWithAttachmentName(
          att.name,
          seedEmailId
        );

        // Only use attachment matching if it's specific (< 20 matches)
        if (relatedEmails.length > 0 && relatedEmails.length < 20) {
          signals.push({
            type: "attachment",
            confidence: 0.9,
            description: `Found ${relatedEmails.length} emails with attachment: ${att.name}`,
            emailIds: relatedEmails.map((e) => e.id),
          });

          // Add related emails
          for (const email of relatedEmails) {
            const existing = discoveredEmails.get(email.id);
            if (existing) {
              existing.discoveryReason.push("attachment");
              existing.confidence = Math.max(existing.confidence, 0.9);
            } else {
              discoveredEmails.set(email.id, {
                ...email,
                discoveryReason: ["attachment"],
                confidence: 0.9,
              });
            }
          }

          // Get attachments from related emails
          for (const email of relatedEmails) {
            const emailAttachments = this.getAttachmentsForEmail(email.id);
            for (const emailAtt of emailAttachments) {
              if (emailAtt.name === att.name) {
                discoveredAttachments.set(emailAtt.id, {
                  ...emailAtt,
                  discoveryReason: ["shared_attachment"],
                  confidence: 0.9,
                  relatedEmailIds: [email.id],
                });
              }
            }
          }
        }
      }
    }

    // ========================================================================
    // Signal 5: Subject keyword matching (broader than JWZ, but more precise)
    // ========================================================================
    // Only do keyword matching if we didn't find a project (to avoid duplicates)
    if (!project) {
      // NO PROJECT FOUND - Try to extract project identifier from subject
      // Look for patterns like "Project Name - Details" or "[Project Name]"
      // Use ORIGINAL subject (not normalized) to preserve case and brackets
      const originalSubject = (seedEmail.subject || "")
        .replace(RE_REPLY_PREFIXES, "")
        .replace(RE_MULTIPLE_SPACES, " ")
        .trim();
      const baseSubject = extractBaseSubject(seedEmail.subject || "");

      if (originalSubject) {
        // Try to extract project identifier using common patterns
        // Pattern 1: "[ProjectName]" at start
        // Pattern 2: "ProjectName - " at start
        // Pattern 3: First 2-3 capitalized words that look like a name

        let projectIdentifier: string | null = null;
        let keyWord: string | null = null; // Primary key word for broader search

        // Check for bracketed project name (use original to preserve case)
        // e.g., "[Elanto at Prasada]" -> identifier: "Elanto at Prasada", keyWord: "Elanto"
        const bracketMatch = originalSubject.match(RE_BRACKETED_PROJECT);
        if (bracketMatch?.[1]) {
          projectIdentifier = bracketMatch[1].trim();
          // Extract key word before "at", "in", "of" for location-variant matching
          if (projectIdentifier) {
            const keyWordMatch = projectIdentifier.match(
              RE_KEYWORD_BEFORE_LOCATION
            );
            if (keyWordMatch && keyWordMatch[1].length >= 4) {
              keyWord = keyWordMatch[1].trim();
            }
          }
        }

        // Check for "Name - Details" pattern (take a SIMPLIFIED name part)
        // For "Northern Parkway Bldg D- SWPPP", extract just "Northern Parkway"
        if (!projectIdentifier) {
          const dashMatch = originalSubject.match(RE_DASH_PROJECT);
          if (dashMatch && dashMatch[1].trim().length >= 5) {
            let extractedName = dashMatch[1].trim();
            // Remove common suffixes/abbreviations that aren't part of project name
            extractedName = extractedName.replace(RE_SUFFIX_PATTERN, "").trim();

            // If we still have a reasonable name, use it
            if (extractedName.length >= 5) {
              projectIdentifier = extractedName;
            }
          }
        }

        // Check for project codes (e.g., "22-014", "VT303", "251056")
        if (!projectIdentifier) {
          const codeMatch = originalSubject.match(RE_PROJECT_CODE_MIXED);
          if (codeMatch) {
            projectIdentifier = codeMatch[1];
          }
        }

        // If we found a project identifier, search for it
        if (projectIdentifier && projectIdentifier.length >= 3) {
          // First, search for exact identifier
          const identifierEmails = db
            .query<Record<string, unknown>, [number, string]>(
              `SELECT * FROM emails 
             WHERE id != ? AND subject LIKE ? 
             ORDER BY received_at DESC 
             LIMIT 100`
            )
            .all(seedEmailId, `%${projectIdentifier}%`);

          let newIdentifierMatches = identifierEmails
            .map((r) => this.parseEmailRow(r))
            .filter((e) => !discoveredEmails.has(e.id));

          // If exact identifier found few results AND we have a key word, also search for key word
          // This handles cases like "[Elanto at Prasada]" needing to match "Elanto at Queen Creek"
          if (newIdentifierMatches.length < 10 && keyWord) {
            const keyWordEmails = db
              .query<Record<string, unknown>, [number, string]>(
                `SELECT * FROM emails 
               WHERE id != ? AND subject LIKE ? 
               ORDER BY received_at DESC 
               LIMIT 100`
              )
              .all(seedEmailId, `%${keyWord}%`);

            const additionalMatches = keyWordEmails
              .map((r) => this.parseEmailRow(r))
              .filter(
                (e) =>
                  !(
                    discoveredEmails.has(e.id) ||
                    newIdentifierMatches.some((m) => m.id === e.id)
                  )
              );

            newIdentifierMatches = [
              ...newIdentifierMatches,
              ...additionalMatches,
            ];
          }

          if (
            newIdentifierMatches.length > 0 &&
            newIdentifierMatches.length <= 100
          ) {
            const displayIdentifier = keyWord || projectIdentifier;
            signals.push({
              type: "subject",
              confidence: 0.85,
              description: `Found ${newIdentifierMatches.length} emails with identifier: "${displayIdentifier}"`,
              emailIds: newIdentifierMatches.map((e) => e.id),
            });

            groups.push({
              id: `identifier-${projectIdentifier}`,
              name: `Project: ${displayIdentifier}`,
              type: "subject",
              emails: newIdentifierMatches.map((e) => e.id),
              confidence: 0.85,
              metadata: {
                identifier: projectIdentifier,
                keyWord,
              },
            });

            for (const email of newIdentifierMatches) {
              discoveredEmails.set(email.id, {
                ...email,
                discoveryReason: ["identifier"],
                confidence: 0.85,
                groupId: `identifier-${projectIdentifier}`,
              });
            }
          }
        }

        // Fallback: Extract DISTINCTIVE key words (longer than 4 chars, exclude common words)
        if (discoveredEmails.size <= 10) {
          // Only if we haven't found much yet
          const commonWords = new Set([
            "desert",
            "services",
            "service",
            "llc",
            "inc",
            "loi",
            "sow",
            "fw",
            "re",
            "fwd",
            "project",
            "contract",
            "agreement",
            "estimate",
            "proposal",
            "invoice",
            "payment",
            "request",
            "design",
            "review",
            "update",
            "status",
            "meeting",
            "call",
            "email",
            "sent",
            "received",
          ]);

          const keyWords = baseSubject
            .split(RE_WORD_SPLIT)
            .filter((w) => w.length > 4 && !commonWords.has(w.toLowerCase()));

          // Require at least 2 distinctive keywords to do any matching
          if (keyWords.length >= 2) {
            // Find emails with these keywords - but require HIGH similarity
            const keywordMatches = this.findEmailsByKeywords(
              keyWords,
              seedEmailId
            );

            // STRICT filtering: require 80%+ keyword match
            const newKeywordMatches = keywordMatches.filter(
              (m) => !discoveredEmails.has(m.email.id) && m.similarity >= 0.8
            );

            // LIMIT to 30 results max when no project context
            if (
              newKeywordMatches.length > 0 &&
              newKeywordMatches.length <= 30
            ) {
              const avgSimilarity =
                newKeywordMatches.reduce((sum, m) => sum + m.similarity, 0) /
                newKeywordMatches.length;

              signals.push({
                type: "subject",
                confidence: avgSimilarity,
                description: `Found ${newKeywordMatches.length} emails with keywords: ${keyWords.slice(0, 3).join(", ")}`,
                emailIds: newKeywordMatches.map((m) => m.email.id),
              });

              groups.push({
                id: `keywords-${keyWords[0]}`,
                name: `Keywords: ${keyWords.slice(0, 3).join(", ")}`,
                type: "subject",
                emails: newKeywordMatches.map((m) => m.email.id),
                confidence: avgSimilarity,
                metadata: {
                  keywords: keyWords,
                },
              });

              for (const match of newKeywordMatches) {
                discoveredEmails.set(match.email.id, {
                  ...match.email,
                  discoveryReason: ["keywords"],
                  confidence: match.similarity,
                  groupId: `keywords-${keyWords[0]}`,
                });
              }
            }
          }
        }
      }
    }

    // ========================================================================
    // Signal 6: Date proximity (only if project found, filter by project)
    // ========================================================================
    if (project) {
      // Find emails for same project within date range
      const dateRange = this.getDateRange(seedEmail.receivedAt, 90); // 90 days for project
      const projectDateMatches = this.findEmailsByProjectAndDateRange(
        project.id,
        dateRange.start,
        dateRange.end,
        seedEmailId
      );

      const newProjectDateMatches = projectDateMatches.filter(
        (e) => !discoveredEmails.has(e.id)
      );

      if (newProjectDateMatches.length > 0) {
        signals.push({
          type: "date",
          confidence: 0.75,
          description: `Found ${newProjectDateMatches.length} emails for same project within 90 days`,
          emailIds: newProjectDateMatches.map((e) => e.id),
        });

        groups.push({
          id: `project-date-${project.id}`,
          name: `Project Date Range: ${dateRange.start} to ${dateRange.end}`,
          type: "date",
          emails: newProjectDateMatches.map((e) => e.id),
          confidence: 0.75,
          metadata: {
            projectId: project.id,
            startDate: dateRange.start,
            endDate: dateRange.end,
          },
        });

        for (const email of newProjectDateMatches) {
          const existing = discoveredEmails.get(email.id);
          if (existing) {
            existing.discoveryReason.push("project_date");
            existing.confidence = Math.max(existing.confidence, 0.75);
          } else {
            discoveredEmails.set(email.id, {
              ...email,
              discoveryReason: ["project_date"],
              confidence: 0.75,
              groupId: `project-date-${project.id}`,
            });
          }
        }
      }
    }

    // ========================================================================
    // Apply feedback/corrections
    // ========================================================================
    if (options?.includeFeedback) {
      const feedback = this.getFeedback(seedEmailId);
      for (const fb of feedback) {
        if (fb.action === "exclude") {
          discoveredEmails.delete(fb.emailId);
        } else if (fb.action === "include") {
          const email = this.getEmail(fb.emailId);
          if (email) {
            discoveredEmails.set(fb.emailId, {
              ...email,
              discoveryReason: ["manual_include"],
              confidence: 1.0,
            });
          }
        } else if (fb.action === "regroup" && fb.targetGroupId) {
          const email = discoveredEmails.get(fb.emailId);
          if (email) {
            email.groupId = fb.targetGroupId;
          }
        }
      }
    }

    // ========================================================================
    // Filter by confidence and limit results
    // Also deduplicate by message_id (same email in multiple mailboxes)
    // ========================================================================
    const emailMap = new Map<string, DiscoveredEmail>(); // key: message_id

    // Patterns for workflow/administrative emails to exclude from discovery
    // These often mention projects but aren't directly about them
    const EXCLUDE_SUBJECT_PATTERNS = [
      RE_MORNING_CHECKIN,
      RE_CHECKIN_PREFIX, // "Check-in: Your account..."
      RE_COMPLIANCE_NOTICE, // Generic compliance notices
      RE_ACCOUNT_RENEWS,
    ];

    const isWorkflowEmail = (subject: string | null): boolean => {
      if (!subject) {
        return false;
      }
      return EXCLUDE_SUBJECT_PATTERNS.some((pattern) => pattern.test(subject));
    };

    for (const email of discoveredEmails.values()) {
      if (email.confidence >= minConfidence) {
        // Skip workflow/check-in emails unless they're the seed email
        if (isWorkflowEmail(email.subject) && email.id !== seedEmailId) {
          continue;
        }

        // Deduplicate: keep highest confidence version of each message_id
        const existing = emailMap.get(email.messageId);
        if (!existing || email.confidence > existing.confidence) {
          emailMap.set(email.messageId, email);
        }
      }
    }

    const filteredEmails = Array.from(emailMap.values())
      .sort((a, b) => b.confidence - a.confidence) // Sort by confidence
      .slice(0, maxResults);

    const filteredAttachments = Array.from(
      discoveredAttachments.values()
    ).slice(0, maxResults);

    // Calculate overall confidence
    const overallConfidence = this.calculateOverallConfidence(
      signals,
      filteredEmails
    );

    return {
      seedEmailId,
      emails: filteredEmails,
      attachments: filteredAttachments,
      groups,
      confidence: overallConfidence,
      signals,
      metadata: {
        totalEmails: filteredEmails.length,
        totalAttachments: filteredAttachments.length,
        discoveryMethod: "hybrid_jwz_outlook",
        discoveredAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Provide feedback to improve discovery
   */
  provideFeedback(feedback: Feedback): void {
    const seedEmailId = feedback.emailId; // Using emailId as seed for now
    const existing = this.feedbackCache.get(seedEmailId) || [];
    existing.push(feedback);
    this.feedbackCache.set(seedEmailId, existing);

    // TODO: Persist to database
    // db.run(
    //   `INSERT INTO discovery_feedback (seed_email_id, email_id, action, reason, target_group_id)
    //    VALUES (?, ?, ?, ?, ?)`,
    //   [seedEmailId, feedback.emailId, feedback.action, feedback.reason, feedback.targetGroupId]
    // );
  }

  // ========================================================================
  // Helper Methods
  // ========================================================================

  private getEmail(id: number): Email | null {
    const row = db
      .query<Record<string, unknown>, [number]>(
        "SELECT * FROM emails WHERE id = ?"
      )
      .get(id);

    if (!row) {
      return null;
    }
    return this.parseEmailRow(row);
  }

  private getThreadByConversationId(conversationId: string): Email[] {
    const rows = db
      .query<Record<string, unknown>, [string]>(
        `SELECT * FROM emails 
       WHERE conversation_id = ? 
       ORDER BY received_at ASC`
      )
      .all(conversationId);

    return rows.map((r) => this.parseEmailRow(r));
  }

  private findEmailsBySubject(
    baseSubject: string,
    excludeId: number
  ): Array<{ email: Email; similarity: number }> {
    // Extract key words from base subject (words longer than 3 chars)
    const keyWords = baseSubject
      .split(RE_WORD_SPLIT)
      .filter((w) => w.length > 3)
      .map((w) => w.toLowerCase());

    if (keyWords.length === 0) {
      return [];
    }

    // Build SQL query to find emails with matching words
    const wordConditions = keyWords
      .map(() => "(subject LIKE ? OR body_preview LIKE ?)")
      .join(" OR ");
    const params: (string | number)[] = [excludeId];

    for (const word of keyWords) {
      params.push(`%${word}%`, `%${word}%`);
    }

    const allEmails = db
      .query<Record<string, unknown>, (string | number)[]>(
        `SELECT * FROM emails 
       WHERE id != ? AND (${wordConditions})
       ORDER BY received_at DESC 
       LIMIT 500`
      )
      .all(...params);

    const matches: Array<{ email: Email; similarity: number }> = [];

    for (const row of allEmails) {
      const email = this.parseEmailRow(row);
      const similarity = subjectSimilarity(baseSubject, email.subject || "");

      // Lower threshold for keyword matches (0.3 instead of 0.5)
      if (similarity > 0.3) {
        matches.push({ email, similarity });
      }
    }

    return matches.sort((a, b) => b.similarity - a.similarity);
  }

  private extractProjectFromEmail(
    email: Email
  ): { id: number; name: string } | null {
    // Check if email already has project_id
    if (email.projectId) {
      const project = db
        .query<{ id: number; name: string }, [number]>(
          "SELECT id, name FROM projects WHERE id = ?"
        )
        .get(email.projectId);

      if (project) {
        return project;
      }
    }

    // Check if email has project_name field set
    if (email.projectName) {
      const normalizedName = email.projectName
        .toLowerCase()
        .replace(RE_NON_WORD, "");
      const project = db
        .query<{ id: number; name: string }, [string, string]>(
          "SELECT id, name FROM projects WHERE name = ? OR normalized_name = ?"
        )
        .get(email.projectName, normalizedName);

      if (project) {
        return project;
      }
    }

    // Try to match by project name in subject/body
    // IMPORTANT: Be VERY strict to avoid false positives
    const projects = db
      .query<{ id: number; name: string; normalized_name: string }, []>(
        "SELECT id, name, normalized_name FROM projects WHERE normalized_name IS NOT NULL"
      )
      .all();

    const _normalizedSubject = normalizeSubjectJWZ(email.subject || "");
    const subjectLower = (email.subject || "").toLowerCase();

    // Score each project and return the best match
    const projectScores: Array<{
      project: { id: number; name: string };
      score: number;
      reason: string;
    }> = [];

    // Common words to ignore when matching (these cause false positives)
    const commonWords = new Set([
      "desert",
      "services",
      "service",
      "llc",
      "inc",
      "the",
      "and",
      "for",
      "project",
      "contract",
      "phase",
      "building",
      "lot",
      "park",
      "general",
    ]);

    for (const project of projects) {
      const projectNameLower = project.name.toLowerCase();

      // Extract SIGNIFICANT words from project name (ignore common words)
      const projectNameWords = projectNameLower
        .split(RE_WORD_SPLIT)
        .filter((w) => w.length > 2 && !commonWords.has(w));

      // Skip projects with no significant words
      if (projectNameWords.length === 0) {
        continue;
      }

      // Score 1: Exact project name appears in subject (highest priority)
      // Use word boundary matching to avoid partial matches
      const exactMatch = subjectLower.includes(projectNameLower);
      if (exactMatch) {
        projectScores.push({
          project,
          score: 1.0,
          reason: "exact_subject_match",
        });
        continue;
      }

      // Score 2: ALL significant words match in subject (strict)
      // Require at least 2 significant words to match
      if (projectNameWords.length >= 2) {
        const matchingWords = projectNameWords.filter((word) =>
          subjectLower.includes(word)
        );
        if (matchingWords.length === projectNameWords.length) {
          projectScores.push({
            project,
            score: 0.9,
            reason: "all_words_in_subject",
          });
          continue;
        }
      }

      // Score 3: Single distinctive word project (e.g., "VT303") - exact match only
      if (projectNameWords.length === 1 && projectNameWords[0].length >= 4) {
        // Use word boundary matching for single-word projects
        const wordPattern = new RegExp(`\\b${projectNameWords[0]}\\b`, "i");
        if (wordPattern.test(email.subject || "")) {
          projectScores.push({
            project,
            score: 0.85,
            reason: "distinctive_word_match",
          });
        }
      }

      // REMOVED: Partial word matching - causes too many false positives
      // Only match on exact project name or ALL significant words in subject
    }

    // Return the highest scoring project (must be >= 0.85 confidence - raised threshold)
    if (projectScores.length > 0) {
      projectScores.sort((a, b) => b.score - a.score);
      const bestMatch = projectScores[0];
      if (bestMatch.score >= 0.85) {
        return bestMatch.project;
      }
    }

    return null;
  }

  private getProjectAliases(projectId: number): string[] {
    const rows = db
      .query<{ alias: string }, [number]>(
        "SELECT alias FROM project_aliases WHERE project_id = ?"
      )
      .all(projectId);
    return rows.map((r) => r.alias);
  }

  private findEmailsByProject(projectId: number, excludeId: number): Email[] {
    const rows = db
      .query<Record<string, unknown>, [number, number]>(
        `SELECT * FROM emails 
       WHERE project_id = ? AND id != ?
       ORDER BY received_at DESC`
      )
      .all(projectId, excludeId);

    return rows.map((r) => this.parseEmailRow(r));
  }

  private findEmailsByProjectName(
    projectName: string,
    excludeId: number
  ): Email[] {
    // Normalize project name for matching
    const normalizedProject = projectName
      .toLowerCase()
      .replace(RE_NON_WORD_SPACE, "");
    const projectWords = normalizedProject
      .split(RE_WORD_SPLIT)
      .filter((w) => w.length > 3);

    if (projectWords.length === 0) {
      return [];
    }

    // Filter out generic filler words that don't help identify the project
    const fillerWords = new Set([
      "legacy",
      "project",
      "phase",
      "building",
      "center",
      "plaza",
      "development",
    ]);
    const coreWords = projectWords.filter((w) => !fillerWords.has(w));
    const wordsToSearch = coreWords.length >= 2 ? coreWords : projectWords;

    // Require ALL significant words to match (more precise)
    // This prevents matching "Sprouts" alone when looking for "Rita Ranch Sprouts"
    const wordConditions = wordsToSearch
      .map(() => "(subject LIKE ? OR body_preview LIKE ?)")
      .join(" AND ");
    const params: (string | number)[] = [excludeId];

    for (const word of wordsToSearch) {
      params.push(`%${word}%`, `%${word}%`);
    }

    // Also check for project code if available (e.g., "251056")
    // This would require parsing project codes from the project name or a separate lookup

    const rows = db
      .query<Record<string, unknown>, (string | number)[]>(
        `SELECT * FROM emails 
       WHERE id != ? AND (${wordConditions})
       ORDER BY received_at DESC 
       LIMIT 200`
      )
      .all(...params);

    return rows.map((r) => this.parseEmailRow(r));
  }

  private getAttachmentsForEmail(emailId: number): Attachment[] {
    const rows = db
      .query<Record<string, unknown>, [number]>(
        "SELECT * FROM attachments WHERE email_id = ?"
      )
      .all(emailId);

    return rows.map((r) => this.parseAttachmentRow(r));
  }

  private findEmailsWithAttachmentName(
    attachmentName: string,
    excludeId: number
  ): Email[] {
    const rows = db
      .query<Record<string, unknown>, [string, number]>(
        `SELECT DISTINCT e.* FROM emails e
       JOIN attachments a ON e.id = a.email_id
       WHERE a.name = ? AND e.id != ?
       ORDER BY e.received_at DESC`
      )
      .all(attachmentName, excludeId);

    return rows.map((r) => this.parseEmailRow(r));
  }

  private getDateRange(
    dateString: string,
    days: number
  ): { start: string; end: string } {
    const date = new Date(dateString);
    const start = new Date(date);
    start.setDate(start.getDate() - days);
    const end = new Date(date);
    end.setDate(end.getDate() + days);

    return {
      start: start.toISOString().split("T")[0],
      end: end.toISOString().split("T")[0],
    };
  }

  private findEmailsByProjectAndDateRange(
    projectId: number,
    startDate: string,
    endDate: string,
    excludeId: number
  ): Email[] {
    const rows = db
      .query<Record<string, unknown>, [number, string, string, number]>(
        `SELECT * FROM emails 
       WHERE project_id = ? AND received_at >= ? AND received_at <= ? AND id != ?
       ORDER BY received_at DESC`
      )
      .all(projectId, startDate, endDate, excludeId);

    return rows.map((r) => this.parseEmailRow(r));
  }

  private findEmailsByKeywords(
    keyWords: string[],
    excludeId: number
  ): Array<{ email: Email; similarity: number }> {
    if (keyWords.length === 0) {
      return [];
    }

    // Filter out very common words that cause false positives
    const commonWords = new Set([
      "the",
      "and",
      "for",
      "with",
      "from",
      "desert",
      "services",
    ]);
    const filteredKeywords = keyWords.filter(
      (w) => !commonWords.has(w.toLowerCase()) && w.length > 3
    );

    if (filteredKeywords.length === 0) {
      return [];
    }

    // Build SQL query - emails must contain at least 2 of the keywords
    // Simple approach: OR all conditions, then filter in code
    const conditions: string[] = [];
    const params: (string | number)[] = [excludeId];

    for (const word of filteredKeywords) {
      conditions.push("(subject LIKE ? OR body_preview LIKE ?)");
      params.push(`%${word}%`, `%${word}%`);
    }

    // Use OR to find any matches, then filter by keyword count in code
    const whereClause = conditions.join(" OR ");

    const rows = db
      .query<Record<string, unknown>, (string | number)[]>(
        `SELECT * FROM emails 
       WHERE id != ? AND (${whereClause})
       ORDER BY received_at DESC 
       LIMIT 200`
      )
      .all(...params);

    const matches: Array<{ email: Email; similarity: number }> = [];

    for (const row of rows) {
      const email = this.parseEmailRow(row);
      const emailText =
        `${email.subject || ""} ${email.bodyPreview || ""}`.toLowerCase();

      // Count how many keywords match
      const matchingKeywords = filteredKeywords.filter((word) =>
        emailText.includes(word)
      );
      const similarity = matchingKeywords.length / filteredKeywords.length;

      // Require at least 2 keywords AND 60% match (more strict)
      if (matchingKeywords.length >= 2 && similarity >= 0.6) {
        matches.push({ email, similarity });
      }
    }

    return matches.sort((a, b) => b.similarity - a.similarity);
  }

  private getFeedback(seedEmailId: number): Feedback[] {
    return this.feedbackCache.get(seedEmailId) || [];
  }

  private calculateOverallConfidence(
    signals: Signal[],
    _emails: DiscoveredEmail[]
  ): number {
    if (signals.length === 0) {
      return 0;
    }

    // Weight signals by type
    const weights: Record<string, number> = {
      thread: 1.0,
      attachment: 0.9,
      project: 0.85,
      subject: 0.75,
      date: 0.6,
      domain: 0.7,
    };

    const weightedSum = signals.reduce((sum, signal) => {
      const weight = weights[signal.type] || 0.5;
      return sum + signal.confidence * weight;
    }, 0);

    const totalWeight = signals.reduce((sum, signal) => {
      return sum + (weights[signal.type] || 0.5);
    }, 0);

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  private parseEmailRow(row: Record<string, unknown>): Email {
    return {
      id: row.id as number,
      messageId: row.message_id as string,
      mailboxId: row.mailbox_id as number,
      conversationId: row.conversation_id as string | null,
      subject: row.subject as string | null,
      fromEmail: row.from_email as string | null,
      fromName: row.from_name as string | null,
      toEmails: JSON.parse((row.to_emails as string) || "[]"),
      ccEmails: JSON.parse((row.cc_emails as string) || "[]"),
      receivedAt: row.received_at as string,
      hasAttachments: Boolean(row.has_attachments),
      attachmentNames: JSON.parse((row.attachment_names as string) || "[]"),
      bodyPreview: row.body_preview as string | null,
      webUrl: row.web_url as string | null,
      classification:
        (row.classification as EmailClassification | null) ?? null,
      classificationConfidence: row.classification_confidence as number | null,
      classificationMethod:
        (row.classification_method as ClassificationMethod | null) ?? null,
      projectName: row.project_name as string | null,
      contractorName: row.contractor_name as string | null,
      mondayEstimateId: row.monday_estimate_id as string | null,
      notionProjectId: row.notion_project_id as string | null,
      accountId: row.account_id as number | null,
      projectId: row.project_id as number | null,
      bodyFull: row.body_full as string | null,
      bodyHtml: row.body_html as string | null,
      categories: JSON.parse((row.categories as string) || "[]"),
      createdAt: row.created_at as string,
    };
  }

  private parseAttachmentRow(row: Record<string, unknown>): Attachment {
    return {
      id: row.id as number,
      emailId: row.email_id as number,
      attachmentId: row.attachment_id as string,
      name: row.name as string,
      contentType: row.content_type as string | null,
      size: row.size as number | null,
      storageBucket: row.storage_bucket as string | null,
      storagePath: row.storage_path as string | null,
      extractedText: row.extracted_text as string | null,
      extractionStatus:
        (row.extraction_status as ExtractionStatus) ?? "pending",
      extractionError: row.extraction_error as string | null,
      extractedAt: row.extracted_at as string | null,
      createdAt: row.created_at as string,
    };
  }
}

// ============================================================================
// Export singleton instance
// ============================================================================

export const discoveryEngine = new EmailDiscoveryEngine();
