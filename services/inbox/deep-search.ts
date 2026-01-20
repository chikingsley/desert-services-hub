/**
 * Deep Search - Iterative email research pattern
 *
 * Implements the deep research loop:
 * 1. Start with seed (email or query)
 * 2. Extract entities (people, projects, companies)
 * 3. Search for related emails
 * 4. Process attachments
 * 5. Analyze gaps - what's still missing?
 * 6. Generate new queries and repeat
 * 7. Terminate when: max iterations, no new results, or sufficient info
 */

import type { GraphEmailClient } from "../email/client";
import type { EmailMessage } from "../email/types";

// ============================================================================
// Top-level regex patterns (for performance)
// ============================================================================

const EMAIL_REGEX = /[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}/g;
const PROJECT_REGEX = /(?:Project|Job|Site)[\s:]+([A-Z][A-Za-z0-9\s-]+)/g;
const COMPANY_REGEX = /([A-Z][A-Za-z0-9\s&]+(?:Inc|LLC|Corp|Company|Co)\.?)/g;
const WHITESPACE_REGEX = /\s+/g;
const HTML_TAG_REGEX = /<[^>]*>/g;

// ============================================================================
// Types
// ============================================================================

export interface Entity {
  type: "person" | "company" | "project" | "keyword" | "date" | "reference";
  value: string;
  source: "email" | "attachment";
  confidence: number;
}

export interface ProcessedEmail {
  id: string;
  subject: string;
  from: string;
  date: Date;
  snippet: string;
  entities: Entity[];
  attachmentCount: number;
}

export interface ProcessedAttachment {
  emailId: string;
  name: string;
  contentType: string;
  entities: Entity[];
  summary?: string;
}

export interface SearchState {
  // What we're looking for
  goal: string;

  // Accumulated findings
  relevantEmails: ProcessedEmail[];
  extractedEntities: Entity[];
  downloadedAttachments: ProcessedAttachment[];

  // Deduplication
  seenEmailIds: Set<string>;
  seenAttachmentIds: Set<string>;

  // Search history
  queriesExecuted: string[];

  // Progress tracking
  iteration: number;
  maxIterations: number;
  knowledgeGaps: string[];

  // Logs for debugging
  log: string[];
}

export interface DeepSearchConfig {
  maxIterations?: number;
  maxEmailsPerQuery?: number;
  userId: string;
  verbose?: boolean;
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Create initial search state
 */
export function createSearchState(
  goal: string,
  maxIterations = 5
): SearchState {
  return {
    goal,
    relevantEmails: [],
    extractedEntities: [],
    downloadedAttachments: [],
    seenEmailIds: new Set(),
    seenAttachmentIds: new Set(),
    queriesExecuted: [],
    iteration: 0,
    maxIterations,
    knowledgeGaps: [goal],
    log: [`[init] Goal: ${goal}`],
  };
}

/**
 * Extract searchable entities from email content
 * This is a simple regex-based version - replace with LLM for better results
 */
export function extractEntities(
  content: string,
  source: "email" | "attachment"
): Entity[] {
  const entities: Entity[] = [];

  // Email patterns
  for (const match of content.matchAll(EMAIL_REGEX)) {
    entities.push({
      type: "person",
      value: match[0],
      source,
      confidence: 0.9,
    });
  }

  // Project-like patterns (capitalized multi-word phrases)
  for (const match of content.matchAll(PROJECT_REGEX)) {
    if (match[1]) {
      entities.push({
        type: "project",
        value: match[1].trim(),
        source,
        confidence: 0.7,
      });
    }
  }

  // Company patterns (Inc, LLC, Corp, etc.)
  for (const match of content.matchAll(COMPANY_REGEX)) {
    if (match[1]) {
      entities.push({
        type: "company",
        value: match[1].trim(),
        source,
        confidence: 0.8,
      });
    }
  }

  return entities;
}

/**
 * Convert email to processed format with entities
 */
export function processEmail(email: EmailMessage): ProcessedEmail {
  const content = `${email.subject} ${email.bodyContent}`;
  const entities = extractEntities(content, "email");

  // Create snippet (first 200 chars of body, strip HTML)
  const textBody = email.bodyContent
    .replace(HTML_TAG_REGEX, " ")
    .replace(WHITESPACE_REGEX, " ")
    .trim();
  const snippet = textBody.slice(0, 200) + (textBody.length > 200 ? "..." : "");

  return {
    id: email.id,
    subject: email.subject,
    from: email.fromEmail,
    date: email.receivedDateTime,
    snippet,
    entities,
    attachmentCount: email.hasAttachments ? 1 : 0,
  };
}

/**
 * Generate search queries from entities and gaps
 */
export function generateQueries(
  entities: Entity[],
  gaps: string[],
  previousQueries: string[]
): string[] {
  const queries: string[] = [];
  const previousSet = new Set(previousQueries.map((q) => q.toLowerCase()));

  // Generate queries from high-confidence entities
  for (const entity of entities) {
    if (entity.confidence >= 0.7) {
      const query = entity.value;
      if (query.length > 2 && !previousSet.has(query.toLowerCase())) {
        queries.push(query);
      }
    }
  }

  // Add gap-based queries (simplified - would use LLM in production)
  for (const gap of gaps) {
    const words = gap.split(WHITESPACE_REGEX).filter((w) => w.length > 3);
    if (words.length > 0 && words.length <= 3) {
      const query = words.join(" ");
      if (!previousSet.has(query.toLowerCase())) {
        queries.push(query);
      }
    }
  }

  // Dedupe and limit
  const unique = [...new Set(queries)];
  return unique.slice(0, 4); // Max 4 queries per iteration
}

// ============================================================================
// Search Loop Helpers
// ============================================================================

interface ExecuteQueriesParams {
  client: GraphEmailClient;
  queries: string[];
  config: DeepSearchConfig;
  state: SearchState;
  iterLog: string;
}

/**
 * Execute queries and return all results
 */
async function executeQueries(
  params: ExecuteQueriesParams
): Promise<EmailMessage[]> {
  const { client, queries, config, state, iterLog } = params;
  const allEmails: EmailMessage[] = [];

  for (const query of queries) {
    try {
      const results = await client.searchEmails({
        query,
        userId: config.userId,
        limit: config.maxEmailsPerQuery ?? 10,
      });
      allEmails.push(...results);
      state.queriesExecuted.push(query);
      state.log.push(
        `${iterLog} Query "${query}" returned ${results.length} results`
      );
    } catch (err) {
      state.log.push(`${iterLog} Query "${query}" failed: ${err}`);
    }
  }

  return allEmails;
}

/**
 * Filter out already-seen emails
 */
function dedupeEmails(
  emails: EmailMessage[],
  seenIds: Set<string>
): EmailMessage[] {
  const newEmails: EmailMessage[] = [];

  for (const email of emails) {
    if (!seenIds.has(email.id)) {
      seenIds.add(email.id);
      newEmails.push(email);
    }
  }

  return newEmails;
}

/**
 * Process emails and add to state
 */
function processAndAccumulate(
  emails: EmailMessage[],
  state: SearchState
): void {
  for (const email of emails) {
    const processed = processEmail(email);
    state.relevantEmails.push(processed);
    state.extractedEntities.push(...processed.entities);
  }
}

/**
 * Log iteration progress
 */
function logProgress(verbose: boolean, iterLog: string, message: string): void {
  if (verbose) {
    console.log(`${iterLog} ${message}`);
  }
}

// ============================================================================
// Main Search Function
// ============================================================================

/**
 * Main deep search function
 */
export async function deepSearch(
  client: GraphEmailClient,
  initialQuery: string,
  goal: string,
  config: DeepSearchConfig
): Promise<SearchState> {
  const state = createSearchState(goal, config.maxIterations ?? 5);
  const verbose = config.verbose ?? true;
  let queries = [initialQuery];

  while (state.iteration < state.maxIterations && queries.length > 0) {
    state.iteration += 1;
    const iterLog = `[iter ${state.iteration}/${state.maxIterations}]`;

    if (verbose) {
      console.log(`\n${iterLog} Searching with ${queries.length} queries...`);
      for (const q of queries) {
        console.log(`  - "${q}"`);
      }
    }

    // 1. Execute all queries
    const allEmails = await executeQueries({
      client,
      queries,
      config,
      state,
      iterLog,
    });

    // 2. Dedupe - skip already-seen emails
    const newEmails = dedupeEmails(allEmails, state.seenEmailIds);
    const dupeCount = allEmails.length - newEmails.length;
    logProgress(
      verbose,
      iterLog,
      `Found ${newEmails.length} new emails (${dupeCount} duplicates)`
    );

    // 3. Check if we found anything new
    if (newEmails.length === 0) {
      state.log.push(`${iterLog} No new emails found, stopping`);
      logProgress(verbose, iterLog, "No new emails, stopping search");
      break;
    }

    // 4. Process emails and extract entities
    processAndAccumulate(newEmails, state);

    // 5. Generate next queries
    queries = generateQueries(
      state.extractedEntities,
      state.knowledgeGaps,
      state.queriesExecuted
    );

    logProgress(
      verbose,
      iterLog,
      `Extracted ${state.extractedEntities.length} entities`
    );
    logProgress(verbose, iterLog, `Generated ${queries.length} new queries`);

    // 6. Check termination
    if (queries.length === 0) {
      state.log.push(`${iterLog} No more queries to execute, stopping`);
      logProgress(verbose, iterLog, "No more queries, stopping search");
      break;
    }
  }

  // Summary
  state.log.push(
    `[done] Found ${state.relevantEmails.length} emails, ${state.extractedEntities.length} entities in ${state.iteration} iterations`
  );

  return state;
}

/**
 * Print search results summary
 */
export function printResults(state: SearchState): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log("DEEP SEARCH RESULTS");
  console.log("=".repeat(60));
  console.log(`Goal: ${state.goal}`);
  console.log(`Iterations: ${state.iteration}/${state.maxIterations}`);
  console.log(`Emails found: ${state.relevantEmails.length}`);
  console.log(`Entities extracted: ${state.extractedEntities.length}`);
  console.log(`Queries executed: ${state.queriesExecuted.length}`);

  console.log("\n--- Emails ---");
  for (const email of state.relevantEmails.slice(0, 10)) {
    console.log(`  [${email.date.toISOString().slice(0, 10)}] ${email.from}`);
    console.log(`    ${email.subject}`);
  }
  if (state.relevantEmails.length > 10) {
    console.log(`  ... and ${state.relevantEmails.length - 10} more`);
  }

  console.log("\n--- Top Entities ---");
  const entityCounts = new Map<string, number>();
  for (const e of state.extractedEntities) {
    const key = `${e.type}:${e.value}`;
    entityCounts.set(key, (entityCounts.get(key) ?? 0) + 1);
  }
  const sorted = [...entityCounts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [key, count] of sorted.slice(0, 10)) {
    console.log(`  ${key} (${count}x)`);
  }

  console.log("\n--- Queries Executed ---");
  for (const q of state.queriesExecuted) {
    console.log(`  - ${q}`);
  }
}
