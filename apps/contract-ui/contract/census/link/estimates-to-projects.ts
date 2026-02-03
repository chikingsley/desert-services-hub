/**
 * Link Estimates to Projects
 *
 * Auto-creates projects from estimate names and links them.
 * Multiple estimates with the same normalized name roll up to one project.
 *
 * Handles prefixes like "TF:", "PT:" and suffixes like "- SWPPP", "- BMP"
 *
 * Usage:
 *   bun services/contract/census/link/estimates-to-projects.ts
 *   bun services/contract/census/link/estimates-to-projects.ts --dry-run
 *   bun services/contract/census/link/estimates-to-projects.ts --stats
 */

import cliProgress from "cli-progress";
import { db } from "../db/connection";

// Ensure project_id column exists on estimates
try {
  db.run(
    "ALTER TABLE estimates ADD COLUMN project_id INTEGER REFERENCES projects(id)"
  );
  console.log("Added project_id column to estimates table");
} catch {
  // Column already exists
}

// Create index if not exists
db.run(
  "CREATE INDEX IF NOT EXISTS idx_estimates_project ON estimates(project_id)"
);

// ============================================
// Normalization Logic
// ============================================

// Common prefixes to strip (service line indicators)
const PREFIXES_TO_STRIP = [
  /^tf:\s*/i, // Temp Facilities
  /^pt:\s*/i, // ?
  /^swppp:\s*/i, // SWPPP
  /^bmp:\s*/i, // BMP
  /^dp:\s*/i, // Dust Permit
  /^ec:\s*/i, // Erosion Control
  /^re:\s*/i, // RE: from email forwards
  /^fw:\s*/i, // FW: from email forwards
  /^fwd:\s*/i, // FWD: from email forwards
];

// Common suffixes to strip (service line indicators)
const SUFFIXES_TO_STRIP = [
  /\s*-\s*swppp$/i,
  /\s*-\s*bmp$/i,
  /\s*-\s*tf$/i,
  /\s*-\s*temp\s*facilities?$/i,
  /\s*-\s*dust\s*permit$/i,
  /\s*-\s*erosion\s*control$/i,
  /\s*-\s*pt$/i,
  /\s*-\s*phase\s*\d+$/i,
  /\s*-\s*ph\s*\d+$/i,
  /\s*\bph(?:ase)?\s*\d+\b/i, // Phase anywhere
  /\s*\bphi+\b/i, // PhI, PhII, etc.
  /\s*\(.*\)$/, // Trailing parentheses
  /\s*#\d+$/, // Trailing numbers like #2
  /\s+r\d+$/i, // Revision numbers like R1, R2
  /\s*-\s*(?:on-?site|off-?site|onsite|offsite)$/i,
  /\s*-\s*rebid$/i,
  /\s*-\s*full\s*swppp$/i,
  /\s*-\s*subcontract$/i,
];

// Words to normalize (common variations)
const WORD_NORMALIZATIONS: [RegExp, string][] = [
  // Brands
  [/zaxby'?s?/gi, "zaxbys"],
  [/o'?reilly'?s?/gi, "oreillys"],
  [/mcdonald'?s?/gi, "mcdonalds"],
  [/chick-?fil-?a/gi, "chickfila"],
  // Arizona abbreviations
  [/\bphx\b/gi, "phoenix"],
  [/\bpv\b/gi, "paradise valley"],
  [/\baz\b/gi, "arizona"],
  [/\bphoenix\s*az\b/gi, "phoenix"],
  // Common words
  [/\bapartments?\b/gi, "apts"],
  [/\bconstruction\b/gi, "const"],
  [/\bdevelopment\b/gi, "dev"],
  [/\bbuilding\b/gi, "bldg"],
  [/\bparkway\b/gi, "pkwy"],
  [/\bhighway\b/gi, "hwy"],
  [/\broad\b/gi, "rd"],
  [/\bdrive\b/gi, "dr"],
  [/\bstreet\b/gi, "st"],
  [/\bavenue\b/gi, "ave"],
  [/\bboulevard\b/gi, "blvd"],
  // Directional
  [/\bnorth\b/gi, "n"],
  [/\bsouth\b/gi, "s"],
  [/\beast\b/gi, "e"],
  [/\bwest\b/gi, "w"],
  // Contractor suffixes (strip for matching)
  [/\s*-\s*(llc|inc|corp|co|company|construction|builders?|contracting)\.?$/gi, ""],
  [/\s*,?\s*(llc|inc|corp)\.?$/gi, ""],
];

/**
 * Normalize an estimate name to a canonical project name
 */
function normalizeEstimateName(name: string): string {
  let normalized = name.trim();

  // Strip prefixes
  for (const prefix of PREFIXES_TO_STRIP) {
    normalized = normalized.replace(prefix, "");
  }

  // Strip suffixes
  for (const suffix of SUFFIXES_TO_STRIP) {
    normalized = normalized.replace(suffix, "");
  }

  // Normalize specific words
  for (const [pattern, replacement] of WORD_NORMALIZATIONS) {
    normalized = normalized.replace(pattern, replacement);
  }

  // Normalize whitespace and case
  normalized = normalized.replace(/\s+/g, " ").trim().toLowerCase();

  // Remove non-alphanumeric for matching (but keep original for display)
  return normalized;
}

/**
 * Create a display name from normalized name
 */
function toDisplayName(normalized: string): string {
  // Title case
  return normalized
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Extract key words from a name (for fuzzy matching)
 */
function extractKeyWords(name: string): string[] {
  const stopWords = new Set([
    "the", "and", "for", "at", "of", "in", "on", "to", "a", "an",
    "llc", "inc", "corp", "co", "const", "dev", "bldg", "apts",
    "n", "s", "e", "w", "rd", "dr", "st", "ave", "blvd", "pkwy", "hwy"
  ]);

  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));
}

/**
 * Get or create a project by normalized name
 */
function getOrCreateProject(
  normalizedName: string,
  displayName: string
): number {
  // 1. Check exact match on normalized_name
  const existing = db
    .query<{ id: number }, [string]>(
      "SELECT id FROM projects WHERE normalized_name = ?"
    )
    .get(normalizedName);

  if (existing) {
    return existing.id;
  }

  // 2. Check project_aliases
  const alias = db
    .query<{ project_id: number }, [string]>(
      "SELECT project_id FROM project_aliases WHERE normalized_alias = ?"
    )
    .get(normalizedName);

  if (alias) {
    return alias.project_id;
  }

  // 3. Try fuzzy match - find projects with same key words
  const keyWords = extractKeyWords(normalizedName);

  if (keyWords.length >= 2) {
    // Look for projects that contain the first 2-3 significant words
    const searchPattern = keyWords.slice(0, 3).join("%");
    const fuzzyMatch = db
      .query<{ id: number; normalized_name: string }, [string]>(
        `SELECT id, normalized_name FROM projects
         WHERE normalized_name LIKE ?
         ORDER BY LENGTH(normalized_name) ASC
         LIMIT 1`
      )
      .get(`%${searchPattern}%`);

    if (fuzzyMatch) {
      // Verify it's a good match (shares at least 2 key words)
      const existingKeyWords = extractKeyWords(fuzzyMatch.normalized_name);
      const overlap = keyWords.filter(w => existingKeyWords.includes(w));

      if (overlap.length >= 2) {
        // Add this name as an alias to the existing project
        try {
          db.run(
            `INSERT OR IGNORE INTO project_aliases (project_id, alias, normalized_alias, source, created_at)
             VALUES (?, ?, ?, 'auto-match', datetime('now'))`,
            [fuzzyMatch.id, displayName, normalizedName]
          );
        } catch {
          // Alias already exists
        }
        return fuzzyMatch.id;
      }
    }
  }

  // 4. Create new project only if no match found
  db.run(
    `INSERT INTO projects (name, normalized_name, created_at, updated_at)
     VALUES (?, ?, datetime('now'), datetime('now'))`,
    [displayName, normalizedName]
  );

  const newProject = db
    .query<{ id: number }, []>(
      "SELECT id FROM projects WHERE id = last_insert_rowid()"
    )
    .get();

  return newProject?.id ?? 0;
}

/**
 * Link an estimate to a project
 */
function linkEstimateToProject(estimateId: number, projectId: number): void {
  db.run(
    "UPDATE estimates SET project_id = ?, updated_at = datetime('now') WHERE id = ?",
    [projectId, estimateId]
  );
}

/**
 * Add an alias to a project (if the original name differs)
 */
function addProjectAlias(
  projectId: number,
  alias: string,
  normalizedAlias: string
): void {
  try {
    db.run(
      `INSERT OR IGNORE INTO project_aliases (project_id, alias, normalized_alias, source, created_at)
       VALUES (?, ?, ?, 'estimate', datetime('now'))`,
      [projectId, alias, normalizedAlias]
    );
  } catch {
    // Alias already exists
  }
}

// ============================================
// Main Logic
// ============================================

interface LinkResult {
  estimatesProcessed: number;
  projectsCreated: number;
  projectsReused: number;
  aliasesAdded: number;
  alreadyLinked: number;
}

function linkEstimatesToProjects(dryRun = false): LinkResult {
  const result: LinkResult = {
    estimatesProcessed: 0,
    projectsCreated: 0,
    projectsReused: 0,
    aliasesAdded: 0,
    alreadyLinked: 0,
  };

  // Get all estimates
  const estimates = db
    .query<{ id: number; name: string; project_id: number | null }, []>(
      "SELECT id, name, project_id FROM estimates ORDER BY name"
    )
    .all();

  // Track which normalized names we've seen (to count new vs reused)
  const seenNormalizedNames = new Set<string>();
  const projectsBeforeCount =
    db
      .query<{ count: number }, []>("SELECT COUNT(*) as count FROM projects")
      .get()?.count ?? 0;

  if (!dryRun) {
    db.run("BEGIN TRANSACTION");
  }

  // Custom progress bar showing linked count and current estimate
  let bar: cliProgress.SingleBar | null = null;
  if (!dryRun) {
    bar = new cliProgress.SingleBar({
      format:
        "Linking |{bar}| {percentage}% | {value}/{total} | {linked} linked, {projects} projects | {estimate}",
      barCompleteChar: "█",
      barIncompleteChar: "░",
      hideCursor: true,
      clearOnComplete: false,
    });
    bar.start(estimates.length, 0, { linked: 0, projects: 0, estimate: "" });
  }

  let linkedCount = 0;

  try {
    for (const estimate of estimates) {
      result.estimatesProcessed++;

      // Skip if already linked
      if (estimate.project_id) {
        result.alreadyLinked++;
        bar?.increment({
          linked: linkedCount,
          projects: seenNormalizedNames.size,
          estimate: "",
        });
        continue;
      }

      const normalizedName = normalizeEstimateName(estimate.name);

      // Skip if name is too short after normalization
      if (normalizedName.length < 3) {
        bar?.increment({
          linked: linkedCount,
          projects: seenNormalizedNames.size,
          estimate: "",
        });
        continue;
      }

      const displayName = toDisplayName(normalizedName);
      const _isNewNormalized = !seenNormalizedNames.has(normalizedName);
      seenNormalizedNames.add(normalizedName);

      if (dryRun) {
        console.log(
          `  "${estimate.name}" → "${displayName}" (normalized: "${normalizedName}")`
        );
        continue;
      }

      // Get or create project
      const projectId = getOrCreateProject(normalizedName, displayName);

      // Link estimate to project
      linkEstimateToProject(estimate.id, projectId);
      linkedCount++;

      // Add original name as alias if it differs significantly
      const originalNormalized = estimate.name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      if (originalNormalized !== normalizedName.replace(/[^a-z0-9]/g, "")) {
        addProjectAlias(projectId, estimate.name, normalizedName);
        result.aliasesAdded++;
      }

      // Update bar with current estimate name (truncated)
      const truncatedName =
        estimate.name.length > 35
          ? `${estimate.name.slice(0, 32)}...`
          : estimate.name.padEnd(35);
      bar?.increment({
        linked: linkedCount,
        projects: seenNormalizedNames.size,
        estimate: truncatedName,
      });
    }

    bar?.stop();
    if (!dryRun) {
      db.run("COMMIT");
    }
  } catch (error) {
    bar?.stop();
    if (!dryRun) {
      db.run("ROLLBACK");
    }
    throw error;
  }

  // Count projects created
  const projectsAfterCount =
    db
      .query<{ count: number }, []>("SELECT COUNT(*) as count FROM projects")
      .get()?.count ?? 0;

  result.projectsCreated = projectsAfterCount - projectsBeforeCount;
  result.projectsReused = seenNormalizedNames.size - result.projectsCreated;

  return result;
}

function showStats(): void {
  console.log(`\n${"=".repeat(60)}`);
  console.log("ESTIMATE-PROJECT LINKING STATS");
  console.log(`${"=".repeat(60)}\n`);

  const totalEstimates =
    db
      .query<{ count: number }, []>("SELECT COUNT(*) as count FROM estimates")
      .get()?.count ?? 0;

  const linkedEstimates =
    db
      .query<{ count: number }, []>(
        "SELECT COUNT(*) as count FROM estimates WHERE project_id IS NOT NULL"
      )
      .get()?.count ?? 0;

  const totalProjects =
    db
      .query<{ count: number }, []>("SELECT COUNT(*) as count FROM projects")
      .get()?.count ?? 0;

  const projectsWithEstimates =
    db
      .query<{ count: number }, []>(
        "SELECT COUNT(DISTINCT project_id) as count FROM estimates WHERE project_id IS NOT NULL"
      )
      .get()?.count ?? 0;

  const aliasCount =
    db
      .query<{ count: number }, []>(
        "SELECT COUNT(*) as count FROM project_aliases"
      )
      .get()?.count ?? 0;

  console.log(`Total Estimates: ${totalEstimates.toLocaleString()}`);
  console.log(
    `Linked to Projects: ${linkedEstimates.toLocaleString()} (${((linkedEstimates / totalEstimates) * 100).toFixed(1)}%)`
  );
  console.log(
    `Unlinked: ${(totalEstimates - linkedEstimates).toLocaleString()}`
  );
  console.log();
  console.log(`Total Projects: ${totalProjects.toLocaleString()}`);
  console.log(
    `Projects with Estimates: ${projectsWithEstimates.toLocaleString()}`
  );
  console.log(`Project Aliases: ${aliasCount.toLocaleString()}`);

  // Show sample of projects with multiple estimates
  console.log(`\n${"-".repeat(60)}`);
  console.log("PROJECTS WITH MULTIPLE ESTIMATES (sample)");
  console.log(`${"-".repeat(60)}\n`);

  const multiEstimateProjects = db
    .query<{ project_id: number; name: string; estimate_count: number }, []>(
      `SELECT p.id as project_id, p.name, COUNT(e.id) as estimate_count
       FROM projects p
       JOIN estimates e ON e.project_id = p.id
       GROUP BY p.id
       HAVING COUNT(e.id) > 1
       ORDER BY estimate_count DESC
       LIMIT 10`
    )
    .all();

  for (const proj of multiEstimateProjects) {
    console.log(`${proj.name}: ${proj.estimate_count} estimates`);

    // Show the estimate names
    const estimates = db
      .query<{ name: string }, [number]>(
        "SELECT name FROM estimates WHERE project_id = ? LIMIT 5"
      )
      .all(proj.project_id);

    for (const est of estimates) {
      console.log(`  - ${est.name}`);
    }
    if (proj.estimate_count > 5) {
      console.log(`  ... and ${proj.estimate_count - 5} more`);
    }
    console.log();
  }
}

// ============================================
// CLI
// ============================================

if (import.meta.main) {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const statsOnly = args.includes("--stats");
  const mergeOnly = args.includes("--merge");

  if (statsOnly) {
    showStats();
    process.exit(0);
  }

  if (mergeOnly) {
    console.log("=".repeat(60));
    console.log("MERGE DUPLICATE PROJECTS");
    console.log("=".repeat(60));
    console.log(`Mode: ${dryRun ? "DRY RUN (no changes)" : "LIVE"}`);
    console.log();

    const mergeResult = mergeDuplicateProjects(dryRun);

    if (!dryRun) {
      console.log(`\n${"-".repeat(60)}`);
      console.log("MERGE RESULTS");
      console.log("-".repeat(60));
      console.log(`Duplicate groups found: ${mergeResult.groupsFound}`);
      console.log(`Projects merged: ${mergeResult.projectsMerged}`);
      console.log(`Emails moved: ${mergeResult.emailsMoved}`);
      console.log(`Estimates moved: ${mergeResult.estimatesMoved}`);
      console.log(`Aliases moved: ${mergeResult.aliasesMoved}`);
    }
    process.exit(0);
  }

  console.log("=".repeat(60));
  console.log("LINK ESTIMATES TO PROJECTS");
  console.log("=".repeat(60));
  console.log(`Mode: ${dryRun ? "DRY RUN (no changes)" : "LIVE"}`);
  console.log();

  if (dryRun) {
    console.log("Sample normalizations:\n");
  }

  const result = linkEstimatesToProjects(dryRun);

  console.log(`\n${"-".repeat(60)}`);
  console.log("RESULTS");
  console.log("-".repeat(60));
  console.log(
    `Estimates processed: ${result.estimatesProcessed.toLocaleString()}`
  );
  console.log(`Already linked: ${result.alreadyLinked.toLocaleString()}`);
  console.log(`Projects created: ${result.projectsCreated.toLocaleString()}`);
  console.log(`Projects reused: ${result.projectsReused.toLocaleString()}`);
  console.log(`Aliases added: ${result.aliasesAdded.toLocaleString()}`);

  if (!dryRun) {
    showStats();
  }
}

// ============================================
// Merge Duplicate Projects
// ============================================

interface MergeResult {
  groupsFound: number;
  projectsMerged: number;
  emailsMoved: number;
  estimatesMoved: number;
  aliasesMoved: number;
}

/**
 * Find and merge duplicate projects based on key word overlap
 */
function mergeDuplicateProjects(dryRun = false): MergeResult {
  const result: MergeResult = {
    groupsFound: 0,
    projectsMerged: 0,
    emailsMoved: 0,
    estimatesMoved: 0,
    aliasesMoved: 0,
  };

  // Get all projects with their email counts
  const projects = db
    .query<{ id: number; name: string; normalized_name: string; email_count: number }, []>(
      `SELECT p.id, p.name, p.normalized_name,
        (SELECT COUNT(*) FROM emails WHERE project_id = p.id) as email_count
       FROM projects p
       ORDER BY p.name`
    )
    .all();

  // Group by first 3 key words (more precise)
  const groups = new Map<string, typeof projects>();

  for (const p of projects) {
    const keyWords = extractKeyWords(p.normalized_name || p.name);
    if (keyWords.length < 2) continue;

    // Use first 3 words for more precision
    const key = keyWords.slice(0, 3).sort().join("|");
    const list = groups.get(key) || [];
    list.push(p);
    groups.set(key, list);
  }

  // Patterns that indicate distinct sub-projects (don't merge these)
  const distinctPatterns = [
    /\b(building|bldg)\s*[a-z0-9]+\b/i,  // Building A, Building B
    /\b(lot|parcel)\s*\d+\b/i,            // Lot 1, Lot 2
    /\b(unit|suite)\s*[a-z0-9]+\b/i,      // Unit 1, Suite A
    /\b(east|west|north|south)\s*(side|campus|wing)?\b/i, // East, West, North Side
    /\bph(?:ase)?\s*[ivx0-9]+\b/i,        // Phase 1, Ph2
  ];

  // Check if two project names differ only in a distinct pattern
  function areDifferentSubProjects(name1: string, name2: string): boolean {
    const n1 = name1.toLowerCase();
    const n2 = name2.toLowerCase();

    for (const pattern of distinctPatterns) {
      const match1 = n1.match(pattern);
      const match2 = n2.match(pattern);

      if (match1 && match2 && match1[0] !== match2[0]) {
        // Both have the pattern but different values - distinct sub-projects
        return true;
      }
    }
    return false;
  }

  // Find groups with duplicates (excluding distinct sub-projects)
  const duplicateGroups = Array.from(groups.entries())
    .filter(([_, projects]) => projects.length > 1)
    .map(([key, projects]) => {
      // Filter out distinct sub-projects within the group
      const filtered = projects.filter((p, i) => {
        // Keep first one always
        if (i === 0) return true;
        // Check if this is a distinct sub-project from any keeper
        const keeper = projects[0];
        if (keeper && !areDifferentSubProjects(p.name, keeper.name)) {
          return false;
        }
        return true;
      });

      return {
        key,
        projects: filtered.sort((a, b) => b.email_count - a.email_count),
      };
    })
    .filter(g => g.projects.length > 1); // Only keep groups that still have dupes

  result.groupsFound = duplicateGroups.length;

  if (dryRun) {
    console.log(`\nFound ${duplicateGroups.length} duplicate groups:\n`);
    for (const group of duplicateGroups.slice(0, 20)) {
      console.log(`--- ${group.key} ---`);
      for (const p of group.projects) {
        console.log(`  ${p.name} (${p.email_count} emails) [id=${p.id}]`);
      }
    }
    if (duplicateGroups.length > 20) {
      console.log(`\n... and ${duplicateGroups.length - 20} more groups`);
    }
    return result;
  }

  // Merge duplicates
  db.run("BEGIN TRANSACTION");

  try {
    for (const group of duplicateGroups) {
      const keeper = group.projects[0]; // Most emails
      if (!keeper) continue;
      const toMerge = group.projects.slice(1);

      for (const dup of toMerge) {
        // Move emails to keeper
        const emailResult = db.run(
          "UPDATE emails SET project_id = ? WHERE project_id = ?",
          [keeper.id, dup.id]
        );
        result.emailsMoved += emailResult.changes;

        // Move estimates to keeper
        const estResult = db.run(
          "UPDATE estimates SET project_id = ? WHERE project_id = ?",
          [keeper.id, dup.id]
        );
        result.estimatesMoved += estResult.changes;

        // Move aliases to keeper
        const aliasResult = db.run(
          "UPDATE OR IGNORE project_aliases SET project_id = ? WHERE project_id = ?",
          [keeper.id, dup.id]
        );
        result.aliasesMoved += aliasResult.changes;

        // Add duplicate name as alias
        db.run(
          `INSERT OR IGNORE INTO project_aliases (project_id, alias, normalized_alias, source, created_at)
           VALUES (?, ?, ?, 'merge', datetime('now'))`,
          [keeper.id, dup.name, dup.normalized_name]
        );

        // Delete orphaned aliases
        db.run("DELETE FROM project_aliases WHERE project_id = ?", [dup.id]);

        // Delete duplicate project
        db.run("DELETE FROM projects WHERE id = ?", [dup.id]);
        result.projectsMerged++;
      }
    }

    db.run("COMMIT");
  } catch (error) {
    db.run("ROLLBACK");
    throw error;
  }

  return result;
}

export { normalizeEstimateName, linkEstimatesToProjects, showStats, mergeDuplicateProjects };
