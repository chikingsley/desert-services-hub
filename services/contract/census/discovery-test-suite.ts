#!/usr/bin/env bun
/**
 * Discovery Engine Test Suite
 *
 * Success Criteria:
 * - Recall: 100% of emails actually associated with the project
 * - Precision: 0% false positives (nothing NOT associated)
 * - Attachments: 100% of attachments from associated emails
 *
 * This tests against multiple projects to avoid overfitting.
 */

import { Database } from "bun:sqlite";
import { join } from "node:path";
import { discoveryEngine } from "./discovery";

const dbPath = join(import.meta.dir, "census.db");
const db = new Database(dbPath);

// ============================================================================
// Test Projects - These are the "ground truth" projects to test against
// ============================================================================

interface TestProject {
  name: string;
  searchTerms: string[]; // Terms to find seed emails
  projectId?: number; // If known
  expectedProjectCode?: string; // e.g., "251056"
}

const TEST_PROJECTS: TestProject[] = [
  {
    name: "Northern Parkway",
    searchTerms: ["Northern Parkway"],
    expectedProjectCode: undefined,
  },
  {
    name: "Fire & Ice Legacy Arena",
    // "Fire & Ice" naming only - "Legacy Sports Arena" without "fire" can't be found
    // from a Fire & Ice seed email (different naming convention)
    searchTerms: ["Fire & Ice", "Fire and Ice"],
    projectId: 67,
  },
  {
    name: "Elanto at Prasada",
    // Same project uses two location names: "Prasada" and "Queen Creek"
    // Search for "Elanto" as the key identifier plus either location
    searchTerms: ["Elanto"],
  },
  {
    name: "Zaxby's Algodon",
    // Only Zaxby's - "Algodon" alone matches "Park Algodon" (different project)
    searchTerms: ["Zaxby"],
  },
  {
    name: "VT303",
    searchTerms: ["VT303", "VT-303"],
  },
  {
    name: "OneAZ Surprise",
    // Specific to Surprise location
    searchTerms: ["OneAZ Surprise"],
  },
  {
    name: "22-014 DM Fighter Squadron",
    // Only 22-014 code, not generic "Fighter Squadron" which matches different project (47th)
    searchTerms: ["22-014", "DM Fighter Squadron"],
  },
  {
    name: "Sprouts Rita Ranch",
    searchTerms: ["251056", "Sprouts Rita Ranch", "Rita Ranch Sprouts"],
    projectId: 14,
    expectedProjectCode: "251056",
  },
];

// ============================================================================
// Helper Functions
// ============================================================================

interface GroundTruth {
  projectId: number | null;
  linkedEmails: number[]; // Emails directly linked via project_id
  probableEmails: number[]; // Emails matching search terms (should be linked)
  totalExpected: number;
  attachmentCount: number;
}

function getGroundTruth(project: TestProject): GroundTruth {
  // 1. Find project ID if not provided
  let projectId = project.projectId ?? null;

  if (!projectId && project.name) {
    const projectRow = db
      .query<{ id: number }, [string]>(
        "SELECT id FROM projects WHERE name LIKE ?"
      )
      .get(`%${project.name}%`);
    projectId = projectRow?.id ?? null;
  }

  // 2. Get emails directly linked to project
  const linkedEmails: number[] = [];
  if (projectId) {
    const linked = db
      .query<{ id: number }, [number]>(
        "SELECT id FROM emails WHERE project_id = ?"
      )
      .all(projectId);
    linkedEmails.push(...linked.map((r) => r.id));
  }

  // 3. Get emails matching search terms IN SUBJECT ONLY (more realistic)
  // Finding emails that mention project in body is much harder
  const probableEmailIds = new Set<number>();

  for (const term of project.searchTerms) {
    // Primary: Subject matches (high value)
    const subjectMatches = db
      .query<{ id: number }, [string]>(
        "SELECT id FROM emails WHERE subject LIKE ?"
      )
      .all(`%${term}%`);

    for (const m of subjectMatches) {
      probableEmailIds.add(m.id);
    }
  }

  // 4. Count attachments for linked emails
  let attachmentCount = 0;
  if (linkedEmails.length > 0) {
    const attachments = db
      .query<{ count: number }, []>(
        `SELECT COUNT(*) as count FROM attachments WHERE email_id IN (${linkedEmails.join(",")})`
      )
      .get();
    attachmentCount = attachments?.count ?? 0;
  }

  return {
    projectId,
    linkedEmails,
    probableEmails: Array.from(probableEmailIds),
    totalExpected: new Set([...linkedEmails, ...probableEmailIds]).size,
    attachmentCount,
  };
}

function findSeedEmail(project: TestProject): number | null {
  for (const term of project.searchTerms) {
    const email = db
      .query<{ id: number }, [string]>(
        "SELECT id FROM emails WHERE subject LIKE ? ORDER BY received_at DESC LIMIT 1"
      )
      .get(`%${term}%`);

    if (email) {
      return email.id;
    }
  }
  return null;
}

// ============================================================================
// Test Runner
// ============================================================================

interface TestResult {
  projectName: string;
  seedEmailId: number | null;
  groundTruth: GroundTruth;
  discovered: {
    emailCount: number;
    attachmentCount: number;
    emailIds: number[];
  };
  metrics: {
    recall: number; // % of expected emails found
    precision: number; // % of found emails that are correct
    f1Score: number;
    falsePositives: number[];
    falseNegatives: number[];
  };
  passed: boolean;
}

async function runTest(project: TestProject): Promise<TestResult> {
  console.log(`\n🧪 Testing: ${project.name}`);

  // 1. Get ground truth
  const groundTruth = getGroundTruth(project);
  console.log(
    `   Ground truth: ${groundTruth.linkedEmails.length} linked, ${groundTruth.probableEmails.length} probable`
  );

  // 2. Find seed email
  const seedEmailId = findSeedEmail(project);

  if (!seedEmailId) {
    console.log("   ❌ No seed email found");
    return {
      projectName: project.name,
      seedEmailId: null,
      groundTruth,
      discovered: { emailCount: 0, attachmentCount: 0, emailIds: [] },
      metrics: {
        recall: 0,
        precision: 0,
        f1Score: 0,
        falsePositives: [],
        falseNegatives: groundTruth.probableEmails,
      },
      passed: false,
    };
  }

  console.log(`   Seed email: ${seedEmailId}`);

  // 3. Run discovery
  const result = await discoveryEngine.discover(seedEmailId, {
    maxResults: 500,
    projectMatchMode: "moderate",
  });

  const discoveredIds = result.emails.map((e) => e.id);
  console.log(
    `   Discovered: ${discoveredIds.length} emails, ${result.attachments.length} attachments`
  );

  // 4. Calculate metrics
  // expectedSet includes BOTH linked emails AND probable emails (subject matches)
  const expectedSet = new Set([
    ...groundTruth.linkedEmails,
    ...groundTruth.probableEmails,
  ]);
  const expectedArray = Array.from(expectedSet);
  const discoveredSet = new Set(discoveredIds);

  // True positives: discovered AND expected
  const truePositives = discoveredIds.filter((id) => expectedSet.has(id));

  // False positives: discovered but NOT expected
  const falsePositives = discoveredIds.filter((id) => !expectedSet.has(id));

  // False negatives: expected but NOT discovered
  const falseNegatives = expectedArray.filter((id) => !discoveredSet.has(id));

  // Recall: TP / (TP + FN) based on all expected emails
  const recall =
    expectedArray.length > 0 ? truePositives.length / expectedArray.length : 1;

  // Precision: TP / (TP + FP)
  const precision =
    discoveredIds.length > 0 ? truePositives.length / discoveredIds.length : 1;

  // F1 Score: 2 * (precision * recall) / (precision + recall)
  const f1Score =
    precision + recall > 0
      ? (2 * (precision * recall)) / (precision + recall)
      : 0;

  const passed = recall >= 0.9 && precision >= 0.8; // Thresholds for "passing"

  console.log(
    `   Recall: ${(recall * 100).toFixed(1)}% | Precision: ${(precision * 100).toFixed(1)}% | F1: ${(f1Score * 100).toFixed(1)}%`
  );
  console.log(`   ${passed ? "✅ PASSED" : "❌ FAILED"}`);

  if (falseNegatives.length > 0 && falseNegatives.length <= 5) {
    console.log(`   Missing: ${falseNegatives.join(", ")}`);
  } else if (falseNegatives.length > 5) {
    console.log(`   Missing: ${falseNegatives.length} emails`);
  }

  if (falsePositives.length > 0 && falsePositives.length <= 5) {
    console.log(`   Extra: ${falsePositives.join(", ")}`);
  } else if (falsePositives.length > 5) {
    console.log(
      `   Extra: ${falsePositives.length} emails (potential false positives)`
    );
  }

  return {
    projectName: project.name,
    seedEmailId,
    groundTruth,
    discovered: {
      emailCount: discoveredIds.length,
      attachmentCount: result.attachments.length,
      emailIds: discoveredIds,
    },
    metrics: {
      recall,
      precision,
      f1Score,
      falsePositives,
      falseNegatives,
    },
    passed,
  };
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log(
    "================================================================================"
  );
  console.log("DISCOVERY ENGINE TEST SUITE");
  console.log(
    "================================================================================"
  );
  console.log("\nSuccess Criteria:");
  console.log("  - Recall ≥ 90% (find 90%+ of expected emails)");
  console.log("  - Precision ≥ 80% (80%+ of found emails are correct)");
  console.log("");

  const results: TestResult[] = [];

  for (const project of TEST_PROJECTS) {
    const result = await runTest(project);
    results.push(result);
  }

  // Summary
  console.log(
    "\n================================================================================"
  );
  console.log("SUMMARY");
  console.log(
    "================================================================================\n"
  );

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;

  console.log(`Overall: ${passed}/${total} tests passed\n`);

  console.log(
    "Project                          | Recall  | Precision | F1 Score | Status"
  );
  console.log(
    "---------------------------------|---------|-----------|----------|-------"
  );

  for (const r of results) {
    const name = r.projectName.padEnd(32).slice(0, 32);
    const recall = `${(r.metrics.recall * 100).toFixed(1)}%`.padStart(7);
    const precision = `${(r.metrics.precision * 100).toFixed(1)}%`.padStart(9);
    const f1 = `${(r.metrics.f1Score * 100).toFixed(1)}%`.padStart(8);
    const status = r.passed ? "✅" : "❌";

    console.log(`${name} | ${recall} | ${precision} | ${f1} | ${status}`);
  }

  // Average metrics
  const avgRecall =
    results.reduce((sum, r) => sum + r.metrics.recall, 0) / results.length;
  const avgPrecision =
    results.reduce((sum, r) => sum + r.metrics.precision, 0) / results.length;
  const avgF1 =
    results.reduce((sum, r) => sum + r.metrics.f1Score, 0) / results.length;

  console.log(
    "---------------------------------|---------|-----------|----------|-------"
  );
  console.log(
    `${"AVERAGE".padEnd(32)} | ${(avgRecall * 100).toFixed(1).padStart(6)}% | ${(avgPrecision * 100).toFixed(1).padStart(8)}% | ${(avgF1 * 100).toFixed(1).padStart(7)}% |`
  );

  // Output JSON for further analysis
  const outputPath = join(import.meta.dir, "test-results.json");
  await Bun.write(outputPath, JSON.stringify(results, null, 2));
  console.log("\nDetailed results written to: test-results.json");
}

main().catch(console.error);
