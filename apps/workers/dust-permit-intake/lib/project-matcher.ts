/**
 * Project Matcher for Dust Permit Intake
 *
 * Multi-signal matching: alias lookup → normalized name → fuzzy ILIKE.
 */
import { db } from "@lib/db/hub";
import { findProjectByText } from "@lib/db/repositories/project";
import type { Project } from "@lib/db/types";

const STRIP_RE = /^(?:re|fw|fwd|forwarded):\s*/gi;

/**
 * Strip FW:/RE: prefixes and common noise from subject lines.
 */
function cleanSubject(subject: string): string {
  return subject.replace(STRIP_RE, "").trim();
}

/**
 * Extract significant words (3+ chars) from text for fuzzy matching.
 */
function significantWords(text: string): string[] {
  const stopWords = new Set([
    "the",
    "and",
    "for",
    "from",
    "with",
    "this",
    "that",
    "desert",
    "services",
    "swppp",
    "subcontract",
    "agreement",
    "contract",
    "permit",
    "dust",
    "noi",
    "notice",
    "intent",
  ]);
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !stopWords.has(w));
}

/**
 * Try to match an email to a project using multiple signals.
 *
 * Order:
 *   1. findProjectByText (alias + normalized_name exact match)
 *   2. Fuzzy ILIKE on projects.name using significant words
 *   3. If NOI site_name provided, search by that
 */
export async function matchProject(
  subject: string,
  noiSiteName?: string
): Promise<Project | null> {
  const cleaned = cleanSubject(subject);

  // 1. Exact match via alias/normalized name
  const exact = await findProjectByText(cleaned);
  if (exact) return exact;

  // 2. Fuzzy ILIKE with significant words from subject
  const words = significantWords(cleaned);
  for (const word of words) {
    const row = await db
      .query<Record<string, unknown>, [string]>(
        "SELECT * FROM projects WHERE name ILIKE '%' || ? || '%' LIMIT 1"
      )
      .get(word);
    if (row) {
      // Import parseProjectRow logic inline to avoid circular deps
      const { getProjectById } = await import("@lib/db/repositories/project");
      return getProjectById(row.id as number);
    }
  }

  // 3. Try NOI site name if provided
  if (noiSiteName) {
    const bySite = await findProjectByText(noiSiteName);
    if (bySite) return bySite;

    const siteWords = significantWords(noiSiteName);
    for (const word of siteWords) {
      const row = await db
        .query<Record<string, unknown>, [string]>(
          "SELECT * FROM projects WHERE name ILIKE '%' || ? || '%' LIMIT 1"
        )
        .get(word);
      if (row) {
        const { getProjectById } = await import(
          "@lib/db/repositories/project"
        );
        return getProjectById(row.id as number);
      }
    }
  }

  return null;
}
