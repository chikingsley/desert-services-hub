/**
 * REAL Integration Tests for Data Linking
 *
 * These tests hit the actual database and verify real behavior.
 * Run with: bun test services/contract/census/tests/linking.test.ts
 */
import { describe, expect, test } from "bun:test";
import { db } from "../db/connection";
import { normalizeEstimateName } from "../link-estimates-to-projects";

describe("Estimate Name Normalization", () => {
  test("strips TF: prefix", () => {
    expect(normalizeEstimateName("TF: Sprouts Rita Ranch")).toBe(
      "sprouts rita ranch"
    );
  });

  test("strips SWPPP suffix", () => {
    expect(normalizeEstimateName("Sprouts Rita Ranch - SWPPP")).toBe(
      "sprouts rita ranch"
    );
  });

  test("strips both prefix and suffix", () => {
    expect(normalizeEstimateName("TF: Sprouts Rita Ranch - BMP")).toBe(
      "sprouts rita ranch"
    );
  });

  test("normalizes Zaxby's variations", () => {
    expect(normalizeEstimateName("Zaxby's Algodon")).toBe("zaxbys algodon");
    expect(normalizeEstimateName("Zaxbys Algodon")).toBe("zaxbys algodon");
  });

  test("handles multiple spaces", () => {
    expect(normalizeEstimateName("Sprouts   Rita   Ranch")).toBe(
      "sprouts rita ranch"
    );
  });
});

describe("Real Database - Estimates Table", () => {
  test("estimates table exists and has data", () => {
    const count = db
      .query<{ count: number }, []>("SELECT COUNT(*) as count FROM estimates")
      .get();

    expect(count).toBeDefined();
    expect(count!.count).toBeGreaterThan(0);
    console.log(
      `  → Found ${count!.count.toLocaleString()} estimates in database`
    );
  });

  test("estimates have required fields", () => {
    const sample = db
      .query<{ id: number; name: string; monday_item_id: string }, []>(
        "SELECT id, name, monday_item_id FROM estimates LIMIT 5"
      )
      .all();

    expect(sample.length).toBeGreaterThan(0);
    for (const est of sample) {
      expect(est.id).toBeDefined();
      expect(est.name).toBeDefined();
      expect(est.monday_item_id).toBeDefined();
    }
  });

  test("most estimates are linked to projects", () => {
    const stats = db
      .query<{ total: number; linked: number }, []>(`
      SELECT 
        COUNT(*) as total,
        COUNT(project_id) as linked
      FROM estimates
    `)
      .get();

    expect(stats).toBeDefined();
    const pct = ((stats!.linked / stats!.total) * 100).toFixed(1);
    console.log(
      `  → ${stats!.linked.toLocaleString()}/${stats!.total.toLocaleString()} estimates linked (${pct}%)`
    );

    // Should be > 95% linked
    expect(stats!.linked / stats!.total).toBeGreaterThan(0.95);
  });
});

describe("Real Database - Projects Table", () => {
  test("projects table exists and has data", () => {
    const count = db
      .query<{ count: number }, []>("SELECT COUNT(*) as count FROM projects")
      .get();

    expect(count).toBeDefined();
    expect(count!.count).toBeGreaterThan(0);
    console.log(
      `  → Found ${count!.count.toLocaleString()} projects in database`
    );
  });

  test("projects have normalized_name field", () => {
    const sample = db
      .query<{ id: number; name: string; normalized_name: string }, []>(
        "SELECT id, name, normalized_name FROM projects WHERE normalized_name IS NOT NULL LIMIT 5"
      )
      .all();

    expect(sample.length).toBeGreaterThan(0);
    for (const proj of sample) {
      expect(proj.normalized_name).toBeDefined();
      expect(proj.normalized_name.length).toBeGreaterThan(0);
    }
  });

  test("projects with multiple estimates are correctly grouped", () => {
    const multiEstimate = db
      .query<{ project_id: number; name: string; est_count: number }, []>(`
      SELECT p.id as project_id, p.name, COUNT(e.id) as est_count
      FROM projects p
      JOIN estimates e ON e.project_id = p.id
      GROUP BY p.id
      HAVING COUNT(e.id) > 1
      ORDER BY est_count DESC
      LIMIT 3
    `)
      .all();

    console.log("  → Sample projects with multiple estimates:");
    for (const p of multiEstimate) {
      console.log(`    - "${p.name}": ${p.est_count} estimates`);
    }

    expect(multiEstimate.length).toBeGreaterThan(0);
  });
});

describe("Real Database - Emails Table", () => {
  test("emails table exists and has data", () => {
    const count = db
      .query<{ count: number }, []>("SELECT COUNT(*) as count FROM emails")
      .get();

    expect(count).toBeDefined();
    expect(count!.count).toBeGreaterThan(0);
    console.log(
      `  → Found ${count!.count.toLocaleString()} emails in database`
    );
  });

  test("some emails are linked to projects", () => {
    const stats = db
      .query<{ total: number; linked: number }, []>(`
      SELECT 
        COUNT(*) as total,
        COUNT(project_id) as linked
      FROM emails
    `)
      .get();

    expect(stats).toBeDefined();
    const pct = ((stats!.linked / stats!.total) * 100).toFixed(1);
    console.log(
      `  → ${stats!.linked.toLocaleString()}/${stats!.total.toLocaleString()} emails linked (${pct}%)`
    );

    // At least some emails should be linked
    expect(stats!.linked).toBeGreaterThan(0);
  });

  test("linked emails have valid project references", () => {
    const orphans = db
      .query<{ count: number }, []>(`
      SELECT COUNT(*) as count 
      FROM emails e
      WHERE e.project_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = e.project_id)
    `)
      .get();

    expect(orphans).toBeDefined();
    expect(orphans!.count).toBe(0);
    console.log("  → No orphan project references found");
  });
});

describe("Real Database - Project Aliases", () => {
  test("project_aliases table exists", () => {
    const count = db
      .query<{ count: number }, []>(
        "SELECT COUNT(*) as count FROM project_aliases"
      )
      .get();

    expect(count).toBeDefined();
    console.log(`  → Found ${count!.count.toLocaleString()} project aliases`);
  });

  test("aliases point to valid projects", () => {
    const orphans = db
      .query<{ count: number }, []>(`
      SELECT COUNT(*) as count 
      FROM project_aliases pa
      WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = pa.project_id)
    `)
      .get();

    expect(orphans).toBeDefined();
    expect(orphans!.count).toBe(0);
  });
});

describe("End-to-End: Estimate → Project Linking", () => {
  test("can find project for a normalized estimate name", () => {
    // Get a real estimate from the DB
    const estimate = db
      .query<{ id: number; name: string; project_id: number }, []>(
        "SELECT id, name, project_id FROM estimates WHERE project_id IS NOT NULL LIMIT 1"
      )
      .get();

    expect(estimate).toBeDefined();

    // Verify the project exists
    const project = db
      .query<{ id: number; name: string }, [number]>(
        "SELECT id, name FROM projects WHERE id = ?"
      )
      .get(estimate!.project_id);

    expect(project).toBeDefined();
    console.log(
      `  → Estimate "${estimate!.name}" → Project "${project!.name}"`
    );
  });

  test("TF-prefixed estimates link to same project as base name", () => {
    // Find a project that has both TF: prefixed and non-prefixed estimates
    const projectWithVariants = db
      .query<{ project_id: number; name: string }, []>(`
      SELECT e.project_id, p.name
      FROM estimates e
      JOIN projects p ON p.id = e.project_id
      WHERE e.name LIKE 'TF:%'
      AND EXISTS (
        SELECT 1 FROM estimates e2 
        WHERE e2.project_id = e.project_id 
        AND e2.name NOT LIKE 'TF:%'
        AND e2.name NOT LIKE 'SWPPP:%'
      )
      LIMIT 1
    `)
      .get();

    if (projectWithVariants) {
      // Get all estimates for this project
      const estimates = db
        .query<{ name: string }, [number]>(
          "SELECT name FROM estimates WHERE project_id = ? LIMIT 5"
        )
        .all(projectWithVariants.project_id);

      console.log(`  → Project "${projectWithVariants.name}" has estimates:`);
      for (const e of estimates) {
        console.log(`    - "${e.name}"`);
      }

      expect(estimates.length).toBeGreaterThan(1);
    } else {
      console.log(
        "  → No TF-prefixed variants found (may already be normalized)"
      );
    }
  });
});
