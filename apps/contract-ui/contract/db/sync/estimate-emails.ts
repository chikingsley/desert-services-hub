#!/usr/bin/env bun
/**
 * Pre-compute email history for all estimates.
 * 
 * This is a background sync job that links emails to estimates based on:
 * 1. Contractor match (real_sender_company or from_domain)
 * 2. Project name tokens in subject
 * 3. Estimate number in subject
 * 4. Conversation thread expansion
 * 
 * Run: bun apps/contract-ui/contract/db/sync/estimate-emails.ts
 * Or:  bun apps/contract-ui/contract/db/sync/estimate-emails.ts --estimate=10142559
 */

import { db } from "@contract/db/connection";

// Common words to skip when tokenizing project names (too generic = false positives)
const SKIP_WORDS = new Set([
  "the", "and", "for", "with", "project", "phase", "building", "bldg",
  "site", "new", "add", "addition", "renovation", "remodel", "tenant",
  "improvement", "improvements", "construction", "at", "of", "in",
  // Location words that match too broadly
  "park", "center", "plaza", "village", "place", "tower", "towers",
  "square", "court", "commons", "crossing", "station", "point",
  // Business words
  "business", "industrial", "commercial", "retail", "office", "warehouse",
  "distribution", "logistics", "storage", "campus", "corporate",
  // School words
  "school", "elementary", "middle", "high", "university", "college",
  // Housing words
  "apartments", "homes", "residential", "living", "senior", "multifamily",
  // Generic
  "north", "south", "east", "west", "block", "lot", "unit", "building"
])

/**
 * Extract search tokens from a project/estimate name
 */
function extractTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length >= 3 && !SKIP_WORDS.has(w))
}

/**
 * Ensure estimate_emails table exists
 */
function ensureTable() {
  db.run(`
    CREATE TABLE IF NOT EXISTS estimate_emails (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      estimate_id INTEGER NOT NULL,
      email_id INTEGER NOT NULL,
      match_type TEXT NOT NULL, -- 'contractor', 'number', 'name', 'thread'
      match_detail TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(estimate_id, email_id),
      FOREIGN KEY (estimate_id) REFERENCES estimates(id),
      FOREIGN KEY (email_id) REFERENCES emails(id)
    )
  `)
  db.run(`CREATE INDEX IF NOT EXISTS idx_estimate_emails_estimate ON estimate_emails(estimate_id)`)
  db.run(`CREATE INDEX IF NOT EXISTS idx_estimate_emails_email ON estimate_emails(email_id)`)
}

type EstimateRow = {
  id: number
  name: string
  contractor: string | null
  estimate_number: string | null
  account_domain: string | null
  project_id: number | null
}

type EmailRow = {
  id: number
  subject: string
  conversation_id: string | null
}

/**
 * Find and link emails for a single estimate
 */
function processEstimate(estimate: EstimateRow): { linked: number; byType: Record<string, number> } {
  const tokens = extractTokens(estimate.name)
  const byType: Record<string, number> = { contractor: 0, number: 0, name: 0, thread: 0 }
  const linkedEmailIds = new Set<number>()
  const conversationIds = new Set<string>()

  // Prepare insert statement
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO estimate_emails (estimate_id, email_id, match_type, match_detail)
    VALUES (?, ?, ?, ?)
  `)

  // 1. Find platform emails from matching contractor
  if (estimate.contractor) {
    const contractorEmails = db.query<EmailRow, [string]>(`
      SELECT id, subject, conversation_id FROM emails 
      WHERE is_platform_email = 1 
      AND LOWER(real_sender_company) = LOWER(?)
    `).all(estimate.contractor)

    for (const email of contractorEmails) {
      // Check if subject contains any name token
      const subjectLower = email.subject?.toLowerCase() || ""
      const matchedToken = tokens.find(t => subjectLower.includes(t))

      if (matchedToken && email && byType.contractor !== undefined) {
        insertStmt.run(estimate.id, email.id, "contractor", `token:${matchedToken}`)
        linkedEmailIds.add(email.id)
        byType.contractor++
        if (email.conversation_id) conversationIds.add(email.conversation_id)
      }
    }
  }

  // 2. Find emails with estimate number in subject
  if (estimate.estimate_number) {
    const numberEmails = db.query<EmailRow, [string]>(`
      SELECT id, subject, conversation_id FROM emails 
      WHERE subject LIKE '%' || ? || '%'
    `).all(estimate.estimate_number)

    for (const email of numberEmails) {
      if (!linkedEmailIds.has(email.id) && byType.number !== undefined) {
        insertStmt.run(estimate.id, email.id, "number", estimate.estimate_number)
        linkedEmailIds.add(email.id)
        byType.number++
        if (email.conversation_id) conversationIds.add(email.conversation_id)
      }
    }
  }

  // 3. Find emails from contractor domain with name tokens
  if (estimate.account_domain && tokens.length > 0) {
    const domainEmails = db.query<EmailRow, [string]>(`
      SELECT id, subject, conversation_id FROM emails 
      WHERE from_domain = ?
    `).all(estimate.account_domain)

    for (const email of domainEmails) {
      if (linkedEmailIds.has(email.id)) continue

      const subjectLower = email.subject?.toLowerCase() || ""
      const matchedToken = tokens.find(t => subjectLower.includes(t))

      if (matchedToken && byType.name !== undefined) {
        insertStmt.run(estimate.id, email.id, "name", `domain:${estimate.account_domain},token:${matchedToken}`)
        linkedEmailIds.add(email.id)
        byType.name++
        if (email.conversation_id) conversationIds.add(email.conversation_id)
      }
    }
  }

  // 4. Expand via conversation threads
  for (const convId of conversationIds) {
    const threadEmails = db.query<{ id: number }, [string]>(`
      SELECT id FROM emails WHERE conversation_id = ?
    `).all(convId)

    for (const email of threadEmails) {
      if (!linkedEmailIds.has(email.id) && byType.thread !== undefined) {
        insertStmt.run(estimate.id, email.id, "thread", `conversation:${convId.slice(0, 20)}...`)
        linkedEmailIds.add(email.id)
        byType.thread++
      }
    }
  }

  return { linked: linkedEmailIds.size, byType }
}

/**
 * Fast batch processing: loop through emails once, match to estimates
 */
function processBatch(): void {
  console.log("Pre-computing email history for all estimates (optimized)...\n")

  // Build contractor -> estimates lookup
  const estimates = db.query<EstimateRow, []>(`
    SELECT id, name, contractor, estimate_number, account_domain, project_id 
    FROM estimates 
    WHERE contractor IS NOT NULL
  `).all()

  console.log(`Building lookup for ${estimates.length} estimates...`)

  // Load aliases for better token matching
  const aliasRows = db.query<{ project_id: number; alias: string }, []>(`
    SELECT project_id, alias FROM project_aliases
  `).all()

  const aliasesByProject = new Map<number, string[]>()
  for (const row of aliasRows) {
    if (!aliasesByProject.has(row.project_id)) {
      aliasesByProject.set(row.project_id, [])
    }
    aliasesByProject.get(row.project_id)!.push(row.alias)
  }
  console.log(`  Loaded ${aliasRows.length} aliases`)

  // Map: normalized contractor -> array of { estimate, tokens }
  // Normalize by removing LLC, Inc, etc. and extra spaces
  const contractorMap = new Map<string, Array<{ estimate: EstimateRow; tokens: string[] }>>()

  function normalizeContractor(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")  // Remove punctuation first
      .replace(/\b(llc|inc|corp|co|ltd|company|companies|construction|builders|building|group|services|contracting)\b/g, "")  // Remove whole words only
      .replace(/\s+/g, " ")
      .trim()
  }

  for (const est of estimates) {
    const key = normalizeContractor(est.contractor!)

    // Get tokens from estimate name AND all aliases
    const allNames = [est.name]
    const projectAliases = aliasesByProject.get(est.project_id ?? 0) || []
    allNames.push(...projectAliases)

    // Extract tokens from all names, dedupe
    const tokenSet = new Set<string>()
    for (const name of allNames) {
      for (const token of extractTokens(name)) {
        tokenSet.add(token)
      }
    }
    const tokens = Array.from(tokenSet)

    if (!contractorMap.has(key)) {
      contractorMap.set(key, [])
    }
    contractorMap.get(key)!.push({ estimate: est, tokens })
  }

  console.log(`  ${contractorMap.size} unique contractors (normalized)`)

  // Get all platform emails with contractor info
  type PlatformEmail = { id: number; subject: string; conversation_id: string | null; real_sender_company: string }
  const platformEmails = db.query<PlatformEmail, []>(`
    SELECT id, subject, conversation_id, real_sender_company 
    FROM emails 
    WHERE is_platform_email = 1 AND real_sender_company IS NOT NULL
  `).all()

  console.log(`  ${platformEmails.length} platform emails to process\n`)

  // Prepare insert
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO estimate_emails (estimate_id, email_id, match_type, match_detail)
    VALUES (?, ?, ?, ?)
  `)

  const byType = { contractor: 0, thread: 0 }
  const linkedPairs = new Set<string>() // "estimateId-emailId"
  const conversationsByEstimate = new Map<number, Set<string>>() // estimate_id -> conversation_ids

  db.run("BEGIN TRANSACTION")

  // Build reverse lookup for fuzzy matching: check if email contractor CONTAINS estimate contractor
  function findMatchingEstimates(emailContractor: string): Array<{ estimate: EstimateRow; tokens: string[] }> {
    const normalizedEmail = normalizeContractor(emailContractor)

    // Exact match first
    const exact = contractorMap.get(normalizedEmail)
    if (exact) return exact

    // Fuzzy: check if one contains the other (handles "EBS DBA Empire" matching "Empire")
    const matches: Array<{ estimate: EstimateRow; tokens: string[] }> = []
    for (const [estContractor, estimates] of contractorMap) {
      // Email contractor contains estimate contractor OR vice versa
      if (normalizedEmail.includes(estContractor) || estContractor.includes(normalizedEmail)) {
        // Extra check: must share a significant word (not just "co" or "inc")
        const emailWords = normalizedEmail.split(" ").filter(w => w.length > 3)
        const estWords = estContractor.split(" ").filter(w => w.length > 3)
        const hasCommonWord = emailWords.some(ew => estWords.some(ew2 => ew === ew2))
        if (hasCommonWord) {
          matches.push(...estimates)
        }
      }
    }
    return matches
  }

  // Process each platform email
  for (let i = 0; i < platformEmails.length; i++) {
    const email = platformEmails[i]

    if (!email) continue;
    const matchingEstimates = findMatchingEstimates(email.real_sender_company)
    if (matchingEstimates.length === 0) continue

    const subjectLower = email.subject?.toLowerCase() || ""

    for (const { estimate, tokens } of matchingEstimates) {
      const pairKey = `${estimate.id}-${email.id}`
      if (linkedPairs.has(pairKey)) continue

      // Check if subject contains any token
      const matchedToken = tokens.find(t => subjectLower.includes(t))
      if (matchedToken && email) {
        insertStmt.run(estimate.id, email.id, "contractor", `token:${matchedToken}`)
        linkedPairs.add(pairKey)
        byType.contractor++

        // Track conversation for thread expansion
        if (email.conversation_id) {
          if (!conversationsByEstimate.has(estimate.id)) {
            conversationsByEstimate.set(estimate.id, new Set())
          }
          conversationsByEstimate.get(estimate.id)!.add(email.conversation_id)
        }
      }
    }
    if ((i + 1) % 2000 === 0) {
      console.log(`  Processed ${i + 1}/${platformEmails.length} emails...`)
    }
  }

  console.log(`\nPass 2: Direct emails by contractor domain...`)

  // Build domain -> estimates lookup for direct email matching
  // Get account domains from estimates
  const domainMap = new Map<string, Array<{ estimate: EstimateRow; tokens: string[] }>>()

  for (const est of estimates) {
    if (!est.account_domain) continue
    // account_domain might be "domain.com - https://domain.com", extract just the domain
    const splitDomain = est.account_domain.split(" ")[0];
    if (!splitDomain) continue;
    const domain = splitDomain.toLowerCase();

    // Get tokens (reuse from contractorMap if possible)
    const allNames = [est.name]
    const projectAliases = aliasesByProject.get(est.project_id ?? 0) || []
    allNames.push(...projectAliases)

    const tokenSet = new Set<string>()
    for (const name of allNames) {
      for (const token of extractTokens(name)) tokenSet.add(token)
    }
    const tokens = Array.from(tokenSet)

    if (!domainMap.has(domain)) domainMap.set(domain, [])
    domainMap.get(domain)!.push({ estimate: est, tokens })
  }

  console.log(`  ${domainMap.size} contractor domains to check`)

  // Get ALL emails (not just platform) grouped by from_domain
  type DirectEmail = { id: number; subject: string; conversation_id: string | null; from_domain: string }
  const directEmails = db.query<DirectEmail, []>(`
    SELECT id, subject, conversation_id, from_domain 
    FROM emails 
    WHERE from_domain IS NOT NULL
    AND is_platform_email = 0
  `).all()

  console.log(`  ${directEmails.length} direct emails to check`)

  let directMatches = 0
  for (const email of directEmails) {
    const domain = email.from_domain?.toLowerCase()
    if (!domain) continue

    const matchingEstimates = domainMap.get(domain)
    if (!matchingEstimates) continue

    const subjectLower = email.subject?.toLowerCase() || ""

    for (const { estimate, tokens } of matchingEstimates) {
      const matchedToken = tokens.find(t => subjectLower.includes(t))
      if (!matchedToken) continue

      const pairKey = `${estimate.id}-${email.id}`
      if (linkedPairs.has(pairKey)) continue

      insertStmt.run(estimate.id, email.id, "direct", `domain:${domain},token:${matchedToken}`)
      linkedPairs.add(pairKey)
      directMatches++

      if (email.conversation_id) {
        if (!conversationsByEstimate.has(estimate.id)) {
          conversationsByEstimate.set(estimate.id, new Set())
        }
        conversationsByEstimate.get(estimate.id)!.add(email.conversation_id)
      }
    }
  }

  console.log(`  Found ${directMatches} direct email matches`)

  console.log(`\nExpanding conversation threads...`)

  // Thread expansion
  for (const [estimateId, convIds] of conversationsByEstimate) {
    for (const convId of convIds) {
      const threadEmails = db.query<{ id: number }, [string]>(`
        SELECT id FROM emails WHERE conversation_id = ?
      `).all(convId)

      for (const email of threadEmails) {
        const pairKey = `${estimateId}-${email.id}`
        if (linkedPairs.has(pairKey)) continue

        insertStmt.run(estimateId, email.id, "thread", `conversation`)
        linkedPairs.add(pairKey)
        byType.thread++
      }
    }
  }

  db.run("COMMIT")

  // Count estimates with emails
  const estimatesWithEmails = db.query<{ c: number }, []>(`
    SELECT COUNT(DISTINCT estimate_id) as c FROM estimate_emails
  `).get()?.c || 0

  console.log("\n=== Results ===")
  console.log(`Total email links: ${linkedPairs.size}`)
  console.log(`Estimates with emails: ${estimatesWithEmails}`)
  console.log(`\nBy match type:`)
  console.log(`  Contractor + name token: ${byType.contractor}`)
  console.log(`  Direct email (domain + token): ${directMatches}`)
  console.log(`  Thread expansion: ${byType.thread}`)
}

// Main
const singleEstimate = process.argv.find(a => a.startsWith("--estimate="))?.split("=")[1]

ensureTable()

if (singleEstimate) {
  // Process single estimate (for testing)
  const estimate = db.query<EstimateRow, [string]>(`
    SELECT id, name, contractor, estimate_number, account_domain 
    FROM estimates WHERE estimate_number = ?
  `).get(singleEstimate)

  if (!estimate) {
    console.error(`Estimate ${singleEstimate} not found`)
    process.exit(1)
  }

  console.log(`Processing: ${estimate.name}`)
  console.log(`  Contractor: ${estimate.contractor}`)
  console.log(`  Tokens: ${extractTokens(estimate.name).join(", ")}`)

  const result = processEstimate(estimate)
  console.log(`\nLinked ${result.linked} emails:`)
  console.log(`  By contractor+name: ${result.byType.contractor}`)
  console.log(`  By estimate number: ${result.byType.number}`)
  console.log(`  By domain+name: ${result.byType.name}`)
  console.log(`  By thread expansion: ${result.byType.thread}`)

} else {
  // Use fast batch processing
  processBatch()
}

db.close()
