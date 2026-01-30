/**
 * Link Emails to Projects
 *
 * Batch links emails to projects by matching project names in subject/body.
 * Uses the projects table (populated from estimates).
 *
 * Usage:
 *   bun services/contract/census/link-emails-to-projects.ts
 *   bun services/contract/census/link-emails-to-projects.ts --limit=1000
 *   bun services/contract/census/link-emails-to-projects.ts --stats
 */

import cliProgress from "cli-progress";
import { db } from "./db/connection";

// ============================================
// Types
// ============================================

interface LinkResult {
  emailsProcessed: number;
  emailsLinked: number;
  alreadyLinked: number;
  noMatch: number;
  bySubject: number;
  byBody: number;
}

// ============================================
// Matching Logic
// ============================================

/**
 * Normalize text for matching (lowercase, strip prefixes)
 */
function normalizeForMatching(text: string): string {
  return text
    .toLowerCase()
    .replace(/^(re|fw|fwd):\s*/gi, "")
    .replace(/^(re|fw|fwd):\s*/gi, "")
    .trim();
}

/**
 * Check if project name appears in text (word boundary match)
 */
function projectMatchesText(projectName: string, text: string): boolean {
  if (projectName.length < 4) {
    return false;
  }

  const normalizedProject = projectName.toLowerCase();
  const normalizedText = text.toLowerCase();

  // Exact phrase match
  if (normalizedText.includes(normalizedProject)) {
    return true;
  }

  // Word boundary match using regex
  const escapedName = normalizedProject.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`\\b${escapedName}\\b`, "i");
  return regex.test(normalizedText);
}

/**
 * Find best project match for an email
 */
function findProjectMatch(
  subject: string | null,
  bodyPreview: string | null,
  bodyFull: string | null,
  projectNames: Map<number, string>
): { projectId: number; signal: string } | null {
  const normalizedSubject = subject ? normalizeForMatching(subject) : "";
  const normalizedBody = bodyFull || bodyPreview || "";

  // Score projects by match quality
  let bestMatch: { projectId: number; signal: string; score: number } | null =
    null;

  for (const [projectId, projectName] of projectNames) {
    // Skip very short names (too many false positives)
    if (projectName.length < 5) {
      continue;
    }

    // Check subject first (higher confidence)
    if (
      normalizedSubject &&
      projectMatchesText(projectName, normalizedSubject)
    ) {
      const score = projectName.length; // Longer names = better match
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { projectId, signal: "subject_match", score };
      }
    }

    // Check body (lower confidence, only if no subject match)
    if (
      !bestMatch &&
      normalizedBody &&
      projectMatchesText(projectName, normalizedBody)
    ) {
      const score = projectName.length * 0.8; // Slightly lower score for body matches
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { projectId, signal: "body_match", score };
      }
    }
  }

  if (bestMatch) {
    return { projectId: bestMatch.projectId, signal: bestMatch.signal };
  }

  return null;
}

// ============================================
// Main Logic (SQL-based for performance)
// ============================================

function linkEmailsToProjects(_limit = 50_000): LinkResult {
  const result: LinkResult = {
    emailsProcessed: 0,
    emailsLinked: 0,
    alreadyLinked: 0,
    noMatch: 0,
    bySubject: 0,
    byBody: 0,
  };

  // Get all projects with their names (only projects with 5+ char names)
  const projects = db
    .query<{ id: number; name: string }, []>(
      "SELECT id, name FROM projects WHERE LENGTH(name) >= 5 ORDER BY LENGTH(name) DESC"
    )
    .all();

  console.log(`Loaded ${projects.length} projects for matching`);

  if (projects.length === 0) {
    console.log("No projects found. Run link-estimates-to-projects.ts first.");
    return result;
  }

  // Process each project and find matching emails via SQL (MUCH faster)
  // Longer project names first (more specific matches)
  db.run("BEGIN TRANSACTION");

  // Custom progress bar that shows linked count and current project
  const bar = new cliProgress.SingleBar({
    format:
      "Linking |{bar}| {percentage}% | {value}/{total} projects | {linked} emails linked | {project}",
    barCompleteChar: "█",
    barIncompleteChar: "░",
    hideCursor: true,
    clearOnComplete: false,
  });
  bar.start(projects.length, 0, { linked: 0, project: "" });

  try {
    for (const project of projects) {
      // Escape SQL LIKE special characters
      const searchPattern = project.name.replace(/[%_]/g, "\\$&").toLowerCase();

      // Match in subject (higher priority)
      const subjectMatches = db.run(
        `UPDATE emails 
         SET project_id = ? 
         WHERE project_id IS NULL 
         AND LOWER(subject) LIKE '%' || ? || '%'`,
        [project.id, searchPattern]
      );

      const subjectCount = subjectMatches.changes;
      result.bySubject += subjectCount;
      result.emailsLinked += subjectCount;

      // Match in body_preview (for emails not matched by subject)
      const bodyMatches = db.run(
        `UPDATE emails 
         SET project_id = ? 
         WHERE project_id IS NULL 
         AND LOWER(body_preview) LIKE '%' || ? || '%'`,
        [project.id, searchPattern]
      );

      const bodyCount = bodyMatches.changes;
      result.byBody += bodyCount;
      result.emailsLinked += bodyCount;

      result.emailsProcessed++;

      // Update bar with linked count and truncated project name
      const displayName =
        project.name.length > 30
          ? project.name.slice(0, 27) + "..."
          : project.name.padEnd(30);
      bar.increment({
        linked: result.emailsLinked.toLocaleString(),
        project: displayName,
      });
    }

    bar.stop();
    db.run("COMMIT");
  } catch (error) {
    bar.stop();
    db.run("ROLLBACK");
    throw error;
  }

  // Get final unlinked count
  const unlinked =
    db
      .query<{ count: number }, []>(
        "SELECT COUNT(*) as count FROM emails WHERE project_id IS NULL"
      )
      .get()?.count ?? 0;

  result.noMatch = unlinked;

  return result;
}

function showStats(): void {
  console.log("\n" + "=".repeat(60));
  console.log("EMAIL-PROJECT LINKING STATS");
  console.log("=".repeat(60) + "\n");

  const totalEmails =
    db
      .query<{ count: number }, []>("SELECT COUNT(*) as count FROM emails")
      .get()?.count ?? 0;

  const linkedEmails =
    db
      .query<{ count: number }, []>(
        "SELECT COUNT(*) as count FROM emails WHERE project_id IS NOT NULL"
      )
      .get()?.count ?? 0;

  const totalProjects =
    db
      .query<{ count: number }, []>("SELECT COUNT(*) as count FROM projects")
      .get()?.count ?? 0;

  const projectsWithEmails =
    db
      .query<{ count: number }, []>(
        "SELECT COUNT(DISTINCT project_id) as count FROM emails WHERE project_id IS NOT NULL"
      )
      .get()?.count ?? 0;

  console.log(`Total Emails: ${totalEmails.toLocaleString()}`);
  console.log(
    `Linked to Projects: ${linkedEmails.toLocaleString()} (${((linkedEmails / totalEmails) * 100).toFixed(1)}%)`
  );
  console.log(`Unlinked: ${(totalEmails - linkedEmails).toLocaleString()}`);
  console.log();
  console.log(`Total Projects: ${totalProjects.toLocaleString()}`);
  console.log(`Projects with Emails: ${projectsWithEmails.toLocaleString()}`);

  // Show top projects by email count
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

  for (const proj of topProjects) {
    console.log(
      `${proj.email_count.toLocaleString().padStart(6)} emails: ${proj.name}`
    );
  }
}

// ============================================
// CLI
// ============================================

if (import.meta.main) {
  const args = process.argv.slice(2);
  const statsOnly = args.includes("--stats");

  if (statsOnly) {
    showStats();
    process.exit(0);
  }

  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg
    ? Number.parseInt(limitArg.split("=")[1], 10)
    : 500_000; // Default: 500k

  console.log("=".repeat(60));
  console.log("LINK EMAILS TO PROJECTS");
  console.log("=".repeat(60));
  console.log(`Limit: ${limit.toLocaleString()}`);
  console.log();

  const result = linkEmailsToProjects(limit);

  console.log("\n" + "-".repeat(60));
  console.log("RESULTS");
  console.log("-".repeat(60));
  console.log(`Emails processed: ${result.emailsProcessed.toLocaleString()}`);
  console.log(`Emails linked: ${result.emailsLinked.toLocaleString()}`);
  console.log(`  - By subject: ${result.bySubject.toLocaleString()}`);
  console.log(`  - By body: ${result.byBody.toLocaleString()}`);
  console.log(`No match: ${result.noMatch.toLocaleString()}`);

  showStats();
}

export { linkEmailsToProjects, showStats };
