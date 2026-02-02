/**
 * Link Emails to Projects (FTS5 Version)
 *
 * Uses SQLite FTS5 full-text search for fast matching.
 * Projects are matched against email subjects using inverted index.
 *
 * Usage:
 *   bun services/contract/census/link/emails-to-projects.ts
 *   bun services/contract/census/link/emails-to-projects.ts --rebuild-index
 *   bun services/contract/census/link/emails-to-projects.ts --stats
 */

import { db } from "../db/connection";
import "../db/schema"; // Ensure FTS5 table exists

// ============================================
// FTS5 Index Management
// ============================================

/**
 * Check if FTS index is populated
 */
function isFtsIndexPopulated(): boolean {
  const count = db
    .query<{ c: number }, []>("SELECT COUNT(*) as c FROM emails_fts")
    .get();
  return (count?.c ?? 0) > 0;
}

/**
 * Populate FTS index from emails table
 */
function populateFtsIndex(): number {
  console.log("Populating FTS5 index...");

  // Clear existing index
  db.run("DELETE FROM emails_fts");

  // Populate from emails table
  const result = db.run(`
    INSERT INTO emails_fts(email_id, subject, body_preview)
    SELECT id, COALESCE(subject, ''), COALESCE(body_preview, '') FROM emails
  `);

  console.log(`Indexed ${result.changes} emails`);
  return result.changes;
}

/**
 * Rebuild FTS index (for maintenance)
 */
function rebuildFtsIndex(): void {
  console.log("Rebuilding FTS5 index...");
  db.run("INSERT INTO emails_fts(emails_fts) VALUES('rebuild')");
  console.log("Index rebuilt");
}

// ============================================
// Linking Logic
// ============================================

interface LinkResult {
  projectsProcessed: number;
  emailsLinked: number;
  alreadyLinked: number;
}

/**
 * Escape FTS5 query special characters
 * Returns null if the search term is invalid
 */
function escapeFtsQuery(text: string): string | null {
  // Remove all special characters that FTS5 interprets
  const cleaned = text
    .replace(/["'*^()\-+:@#$%&,;.<>{}[\]\\|/!?]/g, " ") // Remove special chars
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim()
    .toLowerCase();
  
  // Skip if too short or contains only stop words
  if (cleaned.length < 4) return null;
  
  // Wrap each word in quotes for exact matching
  const words = cleaned.split(" ").filter(w => w.length >= 3);
  if (words.length === 0) return null;
  
  // Return as phrase query (all words must appear)
  return `"${words.join(" ")}"`;
}

/**
 * Link emails to projects using FTS5
 */
function linkEmailsToProjects(): LinkResult {
  const result: LinkResult = {
    projectsProcessed: 0,
    emailsLinked: 0,
    alreadyLinked: 0,
  };

  // Ensure FTS index is populated
  if (!isFtsIndexPopulated()) {
    populateFtsIndex();
  }

  // Get all projects, ordered by name length (most specific first)
  const projects = db
    .query<{ id: number; name: string }, []>(
      "SELECT id, name FROM projects WHERE LENGTH(name) >= 5 ORDER BY LENGTH(name) DESC"
    )
    .all();

  console.log(`\nLinking ${projects.length} projects to emails...`);

  // Also get project aliases
  const aliases = db
    .query<{ project_id: number; alias: string }, []>(
      "SELECT project_id, alias FROM project_aliases WHERE LENGTH(alias) >= 5"
    )
    .all();

  console.log(`Plus ${aliases.length} aliases\n`);

  // Track already-linked emails to avoid re-linking
  const linkedEmailIds = new Set<number>();

  // Check how many are already linked
  const alreadyLinkedCount = db
    .query<{ c: number }, []>(
      "SELECT COUNT(*) as c FROM emails WHERE project_id IS NOT NULL"
    )
    .get();
  result.alreadyLinked = alreadyLinkedCount?.c ?? 0;

  db.run("BEGIN TRANSACTION");

  try {
    // Process each project
    for (const project of projects) {
      result.projectsProcessed++;

      // Escape for FTS query
      const searchTerm = escapeFtsQuery(project.name);
      if (!searchTerm) continue;

      // Use FTS5 MATCH to find emails containing project name
      const matches = db
        .query<{ email_id: number }, [string]>(
          `SELECT email_id FROM emails_fts WHERE emails_fts MATCH ?`
        )
        .all(searchTerm);

      for (const match of matches) {
        const emailId = Number(match.email_id);
        if (linkedEmailIds.has(emailId)) continue;

        // Update email with project_id (only if not already linked)
        const updateResult = db.run(
          "UPDATE emails SET project_id = ? WHERE id = ? AND project_id IS NULL",
          [project.id, emailId]
        );

        if (updateResult.changes > 0) {
          linkedEmailIds.add(emailId);
          result.emailsLinked++;
        }
      }

      // Progress every 100 projects
      if (result.projectsProcessed % 100 === 0) {
        console.log(
          `  Processed ${result.projectsProcessed}/${projects.length} projects, ${result.emailsLinked} emails linked`
        );
      }
    }

    // Process aliases
    for (const alias of aliases) {
      const searchTerm = escapeFtsQuery(alias.alias);
      if (!searchTerm) continue;

      const matches = db
        .query<{ email_id: number }, [string]>(
          `SELECT email_id FROM emails_fts WHERE emails_fts MATCH ?`
        )
        .all(searchTerm);

      for (const match of matches) {
        const emailId = Number(match.email_id);
        if (linkedEmailIds.has(emailId)) continue;

        const updateResult = db.run(
          "UPDATE emails SET project_id = ? WHERE id = ? AND project_id IS NULL",
          [alias.project_id, emailId]
        );

        if (updateResult.changes > 0) {
          linkedEmailIds.add(emailId);
          result.emailsLinked++;
        }
      }
    }

    db.run("COMMIT");
  } catch (error) {
    db.run("ROLLBACK");
    throw error;
  }

  return result;
}

// ============================================
// Stats
// ============================================

function showStats(): void {
  console.log("\n" + "=".repeat(60));
  console.log("EMAIL-PROJECT LINKING STATS");
  console.log("=".repeat(60) + "\n");

  const totalEmails = db
    .query<{ c: number }, []>("SELECT COUNT(*) as c FROM emails")
    .get()?.c ?? 0;

  const linkedEmails = db
    .query<{ c: number }, []>(
      "SELECT COUNT(*) as c FROM emails WHERE project_id IS NOT NULL"
    )
    .get()?.c ?? 0;

  const projectsWithEmails = db
    .query<{ c: number }, []>(
      "SELECT COUNT(DISTINCT project_id) as c FROM emails WHERE project_id IS NOT NULL"
    )
    .get()?.c ?? 0;

  const totalProjects = db
    .query<{ c: number }, []>("SELECT COUNT(*) as c FROM projects")
    .get()?.c ?? 0;

  const ftsCount = db
    .query<{ c: number }, []>("SELECT COUNT(*) as c FROM emails_fts")
    .get()?.c ?? 0;

  console.log(`Total Emails: ${totalEmails.toLocaleString()}`);
  console.log(
    `Linked to Projects: ${linkedEmails.toLocaleString()} (${((linkedEmails / totalEmails) * 100).toFixed(1)}%)`
  );
  console.log(
    `Unlinked: ${(totalEmails - linkedEmails).toLocaleString()}`
  );
  console.log();
  console.log(`Total Projects: ${totalProjects.toLocaleString()}`);
  console.log(`Projects with Emails: ${projectsWithEmails.toLocaleString()}`);
  console.log();
  console.log(`FTS Index Size: ${ftsCount.toLocaleString()} entries`);

  // Top projects by email count
  console.log("\n" + "-".repeat(60));
  console.log("TOP PROJECTS BY EMAIL COUNT");
  console.log("-".repeat(60) + "\n");

  const topProjects = db
    .query<{ name: string; email_count: number }, []>(
      `SELECT p.name, COUNT(e.id) as email_count
       FROM projects p
       JOIN emails e ON e.project_id = p.id
       GROUP BY p.id
       ORDER BY email_count DESC
       LIMIT 15`
    )
    .all();

  for (const p of topProjects) {
    console.log(`  ${p.email_count.toString().padStart(5)} emails | ${p.name}`);
  }
}

// ============================================
// CLI
// ============================================

if (import.meta.main) {
  const args = process.argv.slice(2);
  const rebuildIndex = args.includes("--rebuild-index");
  const statsOnly = args.includes("--stats");

  console.log("=".repeat(60));
  console.log("LINK EMAILS TO PROJECTS (FTS5)");
  console.log("=".repeat(60));

  if (rebuildIndex) {
    populateFtsIndex();
    rebuildFtsIndex();
    process.exit(0);
  }

  if (statsOnly) {
    showStats();
    process.exit(0);
  }

  const startTime = Date.now();
  const result = linkEmailsToProjects();
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log("\n" + "-".repeat(60));
  console.log("RESULTS");
  console.log("-".repeat(60));
  console.log(`Projects processed: ${result.projectsProcessed.toLocaleString()}`);
  console.log(`Emails linked: ${result.emailsLinked.toLocaleString()}`);
  console.log(`Already linked: ${result.alreadyLinked.toLocaleString()}`);
  console.log(`Time: ${elapsed}s`);

  showStats();
}

export { linkEmailsToProjects, populateFtsIndex, rebuildFtsIndex, showStats };
