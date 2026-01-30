/**
 * Link Estimates to Projects
 *
 * Auto-creates projects from estimate names and links them.
 * Multiple estimates with the same normalized name roll up to one project.
 *
 * Handles prefixes like "TF:", "PT:" and suffixes like "- SWPPP", "- BMP"
 *
 * Usage:
 *   bun services/contract/census/link-estimates-to-projects.ts
 *   bun services/contract/census/link-estimates-to-projects.ts --dry-run
 *   bun services/contract/census/link-estimates-to-projects.ts --stats
 */

import { db } from "./db/connection";

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
  /\s*\(.*\)$/, // Trailing parentheses
  /\s*#\d+$/, // Trailing numbers like #2
  /\s+r\d+$/i, // Revision numbers like R1, R2
];

// Words to normalize (common variations)
const WORD_NORMALIZATIONS: [RegExp, string][] = [
  [/zaxby'?s?/gi, "zaxbys"],
  [/o'?reilly'?s?/gi, "oreillys"],
  [/mcdonald'?s?/gi, "mcdonalds"],
  [/chick-?fil-?a/gi, "chickfila"],
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
 * Get or create a project by normalized name
 */
function getOrCreateProject(
  normalizedName: string,
  displayName: string
): number {
  // Check if project exists by normalized_name
  const existing = db
    .query<{ id: number }, [string]>(
      "SELECT id FROM projects WHERE normalized_name = ?"
    )
    .get(normalizedName);

  if (existing) {
    return existing.id;
  }

  // Check project_aliases
  const alias = db
    .query<{ project_id: number }, [string]>(
      "SELECT project_id FROM project_aliases WHERE normalized_alias = ?"
    )
    .get(normalizedName);

  if (alias) {
    return alias.project_id;
  }

  // Create new project
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
      const isNewNormalized = !seenNormalizedNames.has(normalizedName);
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
          ? estimate.name.slice(0, 32) + "..."
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
  console.log("\n" + "=".repeat(60));
  console.log("ESTIMATE-PROJECT LINKING STATS");
  console.log("=".repeat(60) + "\n");

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
  console.log("\n" + "-".repeat(60));
  console.log("PROJECTS WITH MULTIPLE ESTIMATES (sample)");
  console.log("-".repeat(60) + "\n");

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

  if (statsOnly) {
    showStats();
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

  console.log("\n" + "-".repeat(60));
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

export { normalizeEstimateName, linkEstimatesToProjects, showStats };
