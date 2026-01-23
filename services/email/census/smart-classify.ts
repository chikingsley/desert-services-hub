/**
 * Smart Email Classifier
 *
 * Two-stage classification using SWPPP Master projects + Jina zero-shot:
 * 1. Match sender domain → contractor name
 * 2. Get contractor's projects from SWPPP Master
 * 3. Classify email against those projects using Jina
 *
 * This narrows 700+ projects down to 5-20 per contractor, making zero-shot feasible.
 */

import { classifyOne } from "../../jina/client";
import {
  getContractors,
  getJobNames,
  queryProjects,
} from "../../swppp-master/db";
import { db, type Email, getAllAccounts, linkEmailToProject } from "./db";

// ============================================================================
// Constants & Regex Patterns
// ============================================================================

const EMAIL_DOMAIN_REGEX = /@([^@]+)$/;
const WHITESPACE_REGEX = /\s+/;

// ============================================================================
// Types
// ============================================================================

export interface ClassificationResult {
  /** Matched project name (if any) */
  project: string | null;
  /** Confidence score (0-1) */
  confidence: number;
  /** Matched contractor name (if any) */
  contractor: string | null;
  /** How the contractor was matched */
  contractorMatchMethod: "domain" | "fuzzy" | "none";
  /** How the project was matched */
  projectMatchMethod: "string" | "jina" | "none";
  /** Number of candidate projects considered */
  candidateCount: number;
  /** Whether this is a high-confidence match */
  isHighConfidence: boolean;
}

export interface ContractorMapping {
  domain: string;
  name: string;
  aliases: string[];
}

// ============================================================================
// Contractor Domain Mapping
// ============================================================================

/**
 * Known domain → contractor name mappings
 * Built from analyzing email patterns and matching to SWPPP Master
 */
const DOMAIN_TO_CONTRACTOR: Record<string, string> = {
  // Major GCs
  "fclbuilders.com": "FCL Builders",
  "weisbuilders.com": "Weis Builders",
  "nrpgroup.com": "NRP Contractors",
  "bprcompanies.com": "BPR Companies",
  "clayco.com": "Clayco",
  "chasse.us": "Chasse Building Team",
  "arco1.com": "ARCO",
  "dfrbuilding.com": "DFR Building",
  "sunrisecompanies.com": "Sunrise Companies",
  "coresettlementservices.com": "Core Settlement",
  "sunsetstone.com": "Sunset Stone",
  "beamrealty.com": "Beam Realty",
  "lecesse.com": "Lecesse Construction",
  "jebuildsinc.com": "JE Dunn",
  "jedunn.com": "JE Dunn",
  "rfrprop.com": "RFR Properties",
  "hfrprop.com": "HFR Properties",
  "ashtonwoods.com": "Ashton Woods",
  "hubbellealty.com": "Hubbell Realty",
  "meritage.com": "Meritage Homes",
  "tfrbuilding.com": "TFR Building",
  "wfrcompanies.com": "WFR Companies",
  "graycor.com": "Graycor",
  "kitchell.com": "Kitchell",
  "mortenson.com": "Mortenson",
  "mccarthy.com": "McCarthy Building Companies",
  "rfrbuilding.com": "RFR Building",
  "oklandconstruction.com": "Okland Construction",
  "layton.com": "Layton Construction",
  "willmeng.com": "Willmeng",
  "corbins.com": "Corbins Electric",
  "sundt.com": "Sundt Construction",
  "pfrprop.com": "PFR Properties",
  "lfrbuilding.com": "LFR Building",
  "jacobsengineering.com": "Jacobs Engineering",
  "amswoodpartners.com": "AMS Wood Partners",
  "woodpartners.com": "Wood Partners",
};

/**
 * Fuzzy contractor name matching patterns
 * Maps partial names to full SWPPP Master contractor names
 */
const CONTRACTOR_ALIASES: Record<string, string[]> = {
  FCL: ["FCL Builders", "FCL Builders LLC"],
  Weis: ["Weis Builders", "Weis Builders Inc"],
  NRP: ["NRP Contractors", "NRP Group", "The NRP Group"],
  BPR: ["BPR Companies", "BPR Construction"],
  Clayco: ["Clayco", "Clayco Inc"],
  Chasse: ["Chasse", "Chasse Building Team", "Chasse Building"],
  ARCO: ["ARCO", "ARCO Design Build", "ARCO Construction"],
  JE: ["JE Dunn", "JE Dunn Construction"],
  Meritage: ["Meritage", "Meritage Homes"],
  Graycor: ["Graycor", "Graycor Construction"],
  Kitchell: ["Kitchell", "Kitchell Contractors"],
  Mortenson: ["Mortenson", "Mortenson Construction"],
  McCarthy: ["McCarthy", "McCarthy Building Companies"],
  Sundt: ["Sundt", "Sundt Construction"],
  Wood: ["Wood Partners", "AMS Wood Partners"],
};

/**
 * Extract domain from email address
 */
function extractDomain(email: string): string | null {
  const match = email.match(EMAIL_DOMAIN_REGEX);
  return match?.[1]?.toLowerCase() ?? null;
}

/**
 * Find contractor by email domain
 * 1. Check census accounts first (most accurate for active contractors)
 * 2. Fall back to hardcoded mappings
 */
export function getContractorByDomain(domain: string): string | null {
  const normalized = domain.toLowerCase();

  // Check census accounts first (real data from emails)
  const account = db
    .query<{ name: string }, [string]>(
      "SELECT name FROM accounts WHERE domain = ? AND type = 'contractor'"
    )
    .get(normalized);

  if (account?.name) {
    return account.name;
  }

  // Fall back to hardcoded mappings
  return DOMAIN_TO_CONTRACTOR[normalized] ?? null;
}

/**
 * Fuzzy match contractor name against SWPPP Master contractors
 */
export function fuzzyMatchContractor(name: string): string | null {
  const nameLower = name.toLowerCase();
  const swpppContractors = getContractors();

  // Direct match
  for (const contractor of swpppContractors) {
    if (contractor.toLowerCase() === nameLower) {
      return contractor;
    }
  }

  // Partial match
  for (const contractor of swpppContractors) {
    if (
      contractor.toLowerCase().includes(nameLower) ||
      nameLower.includes(contractor.toLowerCase())
    ) {
      return contractor;
    }
  }

  // Alias match
  for (const [prefix, aliases] of Object.entries(CONTRACTOR_ALIASES)) {
    if (nameLower.includes(prefix.toLowerCase())) {
      for (const alias of aliases) {
        const match = swpppContractors.find(
          (c) => c.toLowerCase() === alias.toLowerCase()
        );
        if (match) {
          return match;
        }
      }
    }
  }

  return null;
}

// ============================================================================
// Project Classification
// ============================================================================

/**
 * Get projects for a contractor from census DB first, then SWPPP Master
 */
export function getProjectsForContractor(contractorName: string): string[] {
  const contractorLower = contractorName.toLowerCase();

  // First check census DB (more current projects)
  const censusProjects = db
    .query<{ name: string }, []>(
      `SELECT p.name FROM projects p
       JOIN accounts a ON a.id = p.account_id
       WHERE LOWER(a.name) LIKE ?`
    )
    .all(`%${contractorLower}%`)
    .map((p) => p.name);

  if (censusProjects.length > 0) {
    return [...new Set(censusProjects)];
  }

  // Fall back to SWPPP Master
  const swpppProjects = queryProjects({ contractor: contractorName });
  const jobNames = swpppProjects
    .map((p) => p.job_name)
    .filter((name): name is string => name !== null && name.trim() !== "");

  return [...new Set(jobNames)];
}

/**
 * Get ALL census projects (for internal email matching)
 */
function getAllCensusProjects(): string[] {
  return db
    .query<{ name: string }, []>("SELECT name FROM projects")
    .all()
    .map((p) => p.name);
}

/**
 * Check if email is internal (from desertservices)
 */
function isInternalEmail(email: Email): boolean {
  const from = email.fromEmail?.toLowerCase() ?? "";
  return from.includes("desertservices");
}

/**
 * Build email text for classification
 * Combines subject + body preview + attachment names
 */
function buildEmailText(email: Email): string {
  const parts: string[] = [];

  if (email.subject) {
    parts.push(`Subject: ${email.subject}`);
  }

  if (email.bodyPreview) {
    parts.push(email.bodyPreview);
  }

  if (email.attachmentNames.length > 0) {
    parts.push(`Attachments: ${email.attachmentNames.join(", ")}`);
  }

  return parts.join("\n");
}

/**
 * Try to find a project name in the email text using string matching
 * This is more reliable than semantic classification for proper nouns
 */
function stringMatchProject(
  text: string,
  projects: string[]
): { project: string; confidence: number } | null {
  const textLower = text.toLowerCase();

  // Sort projects by name length (longer names first to avoid partial matches)
  const sortedProjects = [...projects].sort((a, b) => b.length - a.length);

  for (const project of sortedProjects) {
    // Skip very short project names that could false-match
    if (project.length < 4) {
      continue;
    }

    const projectLower = project.toLowerCase();

    // Check for exact match (with word boundaries)
    // Allow the project name to appear with reasonable separators
    const escapedProject = projectLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`\\b${escapedProject}\\b`, "i");

    if (pattern.test(text)) {
      // Found direct match - high confidence
      return { project, confidence: 0.95 };
    }

    // Also check if email subject starts with project number/code
    // e.g., "25404 Bethany Bay" where 25404 is job number
    const projectWords = projectLower
      .split(WHITESPACE_REGEX)
      .filter((w) => w.length > 2);
    if (projectWords.length >= 2) {
      // Check if all significant words appear in the text
      const allWordsPresent = projectWords.every(
        (word) => word.length < 3 || textLower.includes(word)
      );
      if (allWordsPresent) {
        return { project, confidence: 0.85 };
      }
    }
  }

  return null;
}

/**
 * Classify email to a project using Jina zero-shot
 * Only used as fallback when string matching fails
 *
 * @param text - Email text to classify
 * @param projects - List of project names to choose from
 * @returns Classification result with project and confidence
 */
async function classifyToProjectJina(
  text: string,
  projects: string[]
): Promise<{ project: string; confidence: number }> {
  if (projects.length === 0) {
    return { project: "", confidence: 0 };
  }

  if (projects.length === 1) {
    // Only one option, return it with medium confidence
    return { project: projects[0], confidence: 0.5 };
  }

  // Add "Unknown/Other" as a catch-all option
  const labels = [...projects, "Unknown/Other Project"];

  const result = await classifyOne(text, labels);

  // If it matched "Unknown/Other", return no match
  if (result.label === "Unknown/Other Project") {
    return { project: "", confidence: result.score };
  }

  return { project: result.label, confidence: result.score };
}

/**
 * Classify email to a project using hybrid approach:
 * 1. Try string matching first (high confidence for proper nouns)
 * 2. Fall back to Jina classifier if no match
 */
async function classifyToProject(
  text: string,
  projects: string[]
): Promise<{ project: string; confidence: number; method: "string" | "jina" }> {
  if (projects.length === 0) {
    return { project: "", confidence: 0, method: "string" };
  }

  // Stage 1: Try string matching first
  const stringMatch = stringMatchProject(text, projects);
  if (stringMatch) {
    return { ...stringMatch, method: "string" };
  }

  // Stage 2: Fall back to Jina classifier
  const jinaResult = await classifyToProjectJina(text, projects);
  return { ...jinaResult, method: "jina" };
}

// ============================================================================
// Main Classification Function
// ============================================================================

const HIGH_CONFIDENCE_THRESHOLD = 0.7;
const MIN_CONFIDENCE_THRESHOLD = 0.4;

/**
 * Classify an email to a project
 * - Internal emails: match against ALL census projects
 * - External emails: match domain → contractor → contractor's projects
 */
export async function classifyEmail(
  email: Email
): Promise<ClassificationResult> {
  const emailText = buildEmailText(email);

  // INTERNAL EMAILS: Match against all census projects
  if (isInternalEmail(email)) {
    const allProjects = getAllCensusProjects();
    const match = stringMatchProject(emailText, allProjects);

    if (match) {
      return {
        project: match.project,
        confidence: match.confidence,
        contractor: null,
        contractorMatchMethod: "none",
        projectMatchMethod: "string",
        candidateCount: allProjects.length,
        isHighConfidence: match.confidence >= HIGH_CONFIDENCE_THRESHOLD,
      };
    }

    // No match for internal email
    return {
      project: null,
      confidence: 0,
      contractor: null,
      contractorMatchMethod: "none",
      projectMatchMethod: "none",
      candidateCount: allProjects.length,
      isHighConfidence: false,
    };
  }

  // EXTERNAL EMAILS: Use contractor-based matching
  const domain = email.fromEmail ? extractDomain(email.fromEmail) : null;

  // Stage 1: Find contractor
  let contractor: string | null = null;
  let matchMethod: "domain" | "fuzzy" | "none" = "none";

  if (domain) {
    // Try domain mapping first
    contractor = getContractorByDomain(domain);
    if (contractor) {
      matchMethod = "domain";
    } else {
      // Try to extract company name from domain and fuzzy match
      const domainPart = domain.split(".")[0];
      if (domainPart && domainPart.length > 2) {
        contractor = fuzzyMatchContractor(domainPart);
        if (contractor) {
          matchMethod = "fuzzy";
        }
      }
    }
  }

  // If no contractor match from domain, try from name
  if (!contractor && email.fromName) {
    contractor = fuzzyMatchContractor(email.fromName);
    if (contractor) {
      matchMethod = "fuzzy";
    }
  }

  // Stage 2: Get projects for contractor
  let projects: string[] = [];
  if (contractor) {
    projects = getProjectsForContractor(contractor);
  }

  // If no contractor-specific projects, skip classification
  if (projects.length === 0) {
    return {
      project: null,
      confidence: 0,
      contractor,
      contractorMatchMethod: matchMethod,
      projectMatchMethod: "none",
      candidateCount: 0,
      isHighConfidence: false,
    };
  }

  // Stage 3: Classify email to project (string match first, then Jina fallback)
  const externalEmailText = buildEmailText(email);
  const result = await classifyToProject(externalEmailText, projects);

  const isHighConfidence = result.confidence >= HIGH_CONFIDENCE_THRESHOLD;

  return {
    project: result.project || null,
    confidence: result.confidence,
    contractor,
    contractorMatchMethod: matchMethod,
    projectMatchMethod: result.project ? result.method : "none",
    candidateCount: projects.length,
    isHighConfidence,
  };
}

/**
 * Classify multiple emails (with rate limiting for Jina API)
 */
export async function classifyEmails(
  emails: Email[],
  options: {
    /** Delay between API calls in ms (default: 500) */
    delayMs?: number;
    /** Skip emails below this confidence threshold */
    minConfidence?: number;
    /** Callback for progress updates */
    onProgress?: (current: number, total: number) => void;
  } = {}
): Promise<Map<number, ClassificationResult>> {
  const { delayMs = 500, minConfidence = MIN_CONFIDENCE_THRESHOLD } = options;
  const results = new Map<number, ClassificationResult>();

  for (let i = 0; i < emails.length; i++) {
    const email = emails[i];

    try {
      const result = await classifyEmail(email);
      results.set(email.id, result);

      // Only update database if we have a high-confidence project match
      if (result.project && result.confidence >= minConfidence) {
        // Find or create the project in census DB and link
        const censusProject = findOrCreateCensusProject(
          result.project,
          result.contractor
        );
        if (censusProject) {
          linkEmailToProject(email.id, censusProject.id);
        }
      }

      options.onProgress?.(i + 1, emails.length);

      // Rate limit: Jina classifier is 20 RPM
      if (i < emails.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    } catch (error) {
      console.error(`Failed to classify email ${email.id}:`, error);
      results.set(email.id, {
        project: null,
        confidence: 0,
        contractor: null,
        contractorMatchMethod: "none",
        candidateCount: 0,
        isHighConfidence: false,
      });
    }
  }

  return results;
}

// ============================================================================
// Census Project Integration
// ============================================================================

interface CensusProject {
  id: number;
  name: string;
  accountId: number | null;
}

/**
 * Find or create a project in the census database
 */
function findOrCreateCensusProject(
  projectName: string,
  contractorName: string | null
): CensusProject | null {
  const normalized = projectName.toLowerCase().replace(/[^a-z0-9]/g, "");

  // Check if project exists
  const existing = db
    .query<{ id: number; name: string; account_id: number | null }, [string]>(
      "SELECT id, name, account_id FROM projects WHERE normalized_name = ?"
    )
    .get(normalized);

  if (existing) {
    return {
      id: existing.id,
      name: existing.name,
      accountId: existing.account_id,
    };
  }

  // Find account for contractor
  let accountId: number | null = null;
  if (contractorName) {
    const accounts = getAllAccounts("contractor");
    for (const account of accounts) {
      if (
        account.name.toLowerCase().includes(contractorName.toLowerCase()) ||
        contractorName.toLowerCase().includes(account.name.toLowerCase())
      ) {
        accountId = account.id;
        break;
      }
    }
  }

  // Create new project
  const result = db.run(
    "INSERT INTO projects (name, normalized_name, account_id) VALUES (?, ?, ?)",
    [projectName, normalized, accountId]
  );

  return {
    id: Number(result.lastInsertRowid),
    name: projectName,
    accountId,
  };
}

// ============================================================================
// Statistics & Reporting
// ============================================================================

/**
 * Get classification statistics from SWPPP Master
 */
export function getSwpppMasterStats(): {
  totalProjects: number;
  uniqueContractors: number;
  contractorProjectCounts: Array<{ contractor: string; count: number }>;
} {
  const contractors = getContractors();
  const jobNames = getJobNames();

  const contractorCounts: Record<string, number> = {};
  for (const contractor of contractors) {
    const projects = getProjectsForContractor(contractor);
    if (projects.length > 0) {
      contractorCounts[contractor] = projects.length;
    }
  }

  const sorted = Object.entries(contractorCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([contractor, count]) => ({ contractor, count }));

  return {
    totalProjects: jobNames.length,
    uniqueContractors: contractors.length,
    contractorProjectCounts: sorted,
  };
}

/**
 * Preview classification for a single email (for testing/debugging)
 */
export async function previewClassification(email: Email): Promise<{
  email: Pick<Email, "id" | "subject" | "fromEmail" | "fromName">;
  domain: string | null;
  result: ClassificationResult;
  candidateProjects: string[];
}> {
  const domain = email.fromEmail ? extractDomain(email.fromEmail) : null;
  const result = await classifyEmail(email);

  let candidateProjects: string[] = [];
  if (result.contractor) {
    candidateProjects = getProjectsForContractor(result.contractor);
  }

  return {
    email: {
      id: email.id,
      subject: email.subject,
      fromEmail: email.fromEmail,
      fromName: email.fromName,
    },
    domain,
    result,
    candidateProjects,
  };
}

// ============================================================================
// Batch Operations
// ============================================================================

/**
 * Preview what the classifier would do on unlinked emails
 */
async function previewUnlinked(): Promise<void> {
  // Get unlinked emails (both internal and external)
  const unlinked = db
    .query<{ id: number; from_email: string; subject: string }, []>(
      `SELECT id, from_email, subject FROM emails
       WHERE project_id IS NULL
       ORDER BY received_at DESC
       LIMIT 100`
    )
    .all();

  const internalCount = unlinked.filter((e) =>
    e.from_email?.includes("desertservices")
  ).length;
  const externalCount = unlinked.length - internalCount;

  console.log(
    `Found ${unlinked.length} unlinked emails (${internalCount} internal, ${externalCount} external)\n`
  );

  let matched = 0;
  let noContractor = 0;
  let noProject = 0;

  for (const row of unlinked) {
    const isInternal = row.from_email?.includes("desertservices");
    const email = {
      id: row.id,
      fromEmail: row.from_email,
      fromName: null,
      subject: row.subject,
      bodyPreview: null,
      attachmentNames: [],
    } as Parameters<typeof classifyEmail>[0];

    const result = await classifyEmail(email);

    // Check if we got a match
    if (result.project) {
      matched++;
      const prefix = isInternal ? "[INTERNAL]" : "[EXTERNAL]";
      console.log(`${prefix} ${row.subject?.substring(0, 50)}`);
      console.log(
        `  → ${result.project} (${result.confidence.toFixed(2)}) via ${result.projectMatchMethod}`
      );
    } else if (isInternal) {
      // Internal with no match - no project name in subject
      noProject++;
    } else if (result.contractor) {
      // External with contractor but no project
      noProject++;
      console.log(`[NO PROJECT] ${row.subject?.substring(0, 50)}`);
      console.log(
        `  Contractor: ${result.contractor} (${result.candidateCount} candidates)`
      );
    } else {
      // External with no contractor
      noContractor++;
    }

    // Rate limit
    await new Promise((r) => setTimeout(r, 100));
  }

  console.log("\n--- Summary ---");
  console.log(`Matched to project: ${matched}`);
  console.log(`External - unknown domain: ${noContractor}`);
  console.log(`No project match: ${noProject}`);
}

/**
 * Run classifier on unlinked emails and optionally link them
 */
async function runClassifier(dryRun: boolean): Promise<void> {
  console.log(
    dryRun
      ? "DRY RUN - no changes will be made\n"
      : "LIVE RUN - will update database\n"
  );

  const unlinked = db
    .query<{ id: number }, []>("SELECT id FROM emails WHERE project_id IS NULL")
    .all();

  console.log(`Processing ${unlinked.length} unlinked emails...\n`);

  let linked = 0;
  let noMatch = 0;

  for (let i = 0; i < unlinked.length; i++) {
    const email = db
      .query<Record<string, unknown>, [number]>(
        "SELECT * FROM emails WHERE id = ?"
      )
      .get(unlinked[i].id);

    if (!email) {
      continue;
    }

    const parsedEmail = {
      id: email.id as number,
      fromEmail: email.from_email as string | null,
      fromName: email.from_name as string | null,
      subject: email.subject as string | null,
      bodyPreview: email.body_preview as string | null,
      attachmentNames: JSON.parse(
        (email.attachment_names as string) || "[]"
      ) as string[],
    } as Parameters<typeof classifyEmail>[0];

    const result = await classifyEmail(parsedEmail);

    if (result.project && result.confidence >= 0.7) {
      linked++;
      console.log(
        `[${i + 1}/${unlinked.length}] Linked: ${parsedEmail.subject?.substring(0, 40)} → ${result.project}`
      );

      if (!dryRun) {
        const project = findOrCreateCensusProject(
          result.project,
          result.contractor
        );
        if (project) {
          linkEmailToProject(parsedEmail.id, project.id);
        }
      }
    } else {
      noMatch++;
    }

    // Rate limit for Jina API
    if (result.projectMatchMethod === "jina") {
      await new Promise((r) => setTimeout(r, 500));
    } else {
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  console.log("\n--- Results ---");
  console.log(`Linked: ${linked}`);
  console.log(`No match: ${noMatch}`);
}

// ============================================================================
// CLI
// ============================================================================

function main(): void {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case "stats": {
      console.log("SWPPP Master Statistics\n");
      const stats = getSwpppMasterStats();
      console.log(`Total Projects: ${stats.totalProjects}`);
      console.log(`Unique Contractors: ${stats.uniqueContractors}`);
      console.log("\nTop 20 Contractors by Project Count:");
      for (const { contractor, count } of stats.contractorProjectCounts.slice(
        0,
        20
      )) {
        console.log(`  ${contractor}: ${count} projects`);
      }
      break;
    }

    case "test": {
      const testDomain = args[1];
      if (!testDomain) {
        console.log("Usage: bun smart-classify.ts test <domain>");
        break;
      }
      const contractor = getContractorByDomain(testDomain);
      if (contractor) {
        const projects = getProjectsForContractor(contractor);
        console.log(`Domain: ${testDomain}`);
        console.log(`Contractor: ${contractor}`);
        console.log(`Projects (${projects.length}):`);
        for (const project of projects.slice(0, 10)) {
          console.log(`  - ${project}`);
        }
        if (projects.length > 10) {
          console.log(`  ... and ${projects.length - 10} more`);
        }
      } else {
        console.log(`No contractor mapping found for domain: ${testDomain}`);
      }
      break;
    }

    case "domains": {
      console.log("Known Domain Mappings:\n");
      for (const [domain, contractor] of Object.entries(DOMAIN_TO_CONTRACTOR)) {
        const projects = getProjectsForContractor(contractor);
        console.log(`${domain} → ${contractor} (${projects.length} projects)`);
      }
      break;
    }

    case "preview": {
      // Preview what classifier would do on unlinked emails
      previewUnlinked().catch(console.error);
      break;
    }

    case "run": {
      // Actually run the classifier and link emails
      const dryRun = args.includes("--dry-run");
      runClassifier(dryRun).catch(console.error);
      break;
    }

    default:
      console.log("Smart Email Classifier\n");
      console.log("Commands:");
      console.log("  stats              Show SWPPP Master statistics");
      console.log(
        "  test <domain>      Test domain → contractor → projects lookup"
      );
      console.log("  domains            List all known domain mappings");
      console.log(
        "  preview            Preview classification on unlinked emails"
      );
      console.log("  run                Run classifier and link emails");
      console.log(
        "  run --dry-run      Show what would be linked without changes"
      );
  }
}

if (import.meta.main) {
  main();
}
