import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { db } from "@lib/db/hub";
import type { ProjectMatchResult } from "@lib/db/repositories/project";
import {
  getProjectMatchReview,
  resolveProjectMatchReview,
  upsertProjectMatchReview,
} from "@lib/db/repositories/project-match-review";
import {
  normalizeProjectAlias,
  normalizeProjectNameKey,
} from "@lib/project-matching";

const RUN_TAG = crypto.randomUUID().slice(0, 8).toLowerCase();
const TEST_PREFIX = `_TEST_DELETE_ME_PROJECT_REVIEW_${RUN_TAG}_`;
const SOURCE = "folder_watcher" as const;
const SOURCE_KEY = normalizeProjectAlias(`${TEST_PREFIX} folder alpha`);
const createdProjectIds: number[] = [];

function buildResult(primaryText: string): ProjectMatchResult {
  return {
    context: {
      primaryText,
      aliasHints: ["Alt Name"],
      contractorHint: "Builder",
      addressHint: "123 Main St Phoenix AZ",
      accountIdHint: null,
      primaryNameKey: normalizeProjectNameKey(primaryText),
      nameKeys: [normalizeProjectNameKey(primaryText)],
      aliasKeys: [normalizeProjectAlias("Alt Name")],
      primaryTokens: ["alpha", "site"],
      contractorTokens: ["builder"],
      addressTokens: ["123", "main", "phoenix", "az"],
    },
    candidates: [
      {
        projectId: 999_999,
        name: "Alpha Site",
        contractor: "Builder",
        address: "123 Main St",
        outlookFolder: null,
        accountId: null,
        updatedAt: new Date().toISOString(),
        score: 120,
        confidence: 0.375,
        reasons: [
          {
            code: "primary_token_overlap",
            points: 60,
            detail: "alpha, site",
          },
        ],
      },
    ],
    decision: {
      best: null,
      runnerUp: null,
      autoLink: false,
      gap: 0,
      reason: "manual_review_required",
      thresholds: {
        minScore: 230,
        minGap: 45,
      },
    },
  };
}

async function createProject(name: string): Promise<number> {
  const rows = (await db.run(
    `INSERT INTO projects (name, normalized_name)
     VALUES (?, ?)
     RETURNING id`,
    [name, normalizeProjectNameKey(name)]
  )) as Array<{ id: number }>;
  const id = rows[0]?.id;
  if (!id) {
    throw new Error("Failed to create test project");
  }
  createdProjectIds.push(id);
  return id;
}

beforeAll(async () => {
  await db.run(`
    CREATE TABLE IF NOT EXISTS project_match_reviews (
      id BIGSERIAL PRIMARY KEY,
      source TEXT NOT NULL,
      source_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      primary_text TEXT NOT NULL,
      alias_hints JSONB NOT NULL DEFAULT '[]'::jsonb,
      contractor_hint TEXT,
      address_hint TEXT,
      account_id_hint INTEGER REFERENCES accounts(id),
      candidates JSONB NOT NULL DEFAULT '[]'::jsonb,
      decision JSONB NOT NULL DEFAULT '{}'::jsonb,
      selected_project_id INTEGER REFERENCES projects(id),
      note TEXT,
      resolution_note TEXT,
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (source, source_key)
    )
  `);
});

afterAll(async () => {
  await db.run(
    "DELETE FROM project_match_reviews WHERE source = ? AND source_key = ?",
    [SOURCE, SOURCE_KEY]
  );

  if (createdProjectIds.length > 0) {
    await db.run(
      `DELETE FROM projects
       WHERE id IN (${createdProjectIds.map(() => "?").join(", ")})`,
      createdProjectIds
    );
  } else {
    await db.run("DELETE FROM projects WHERE name LIKE ?", [`${TEST_PREFIX}%`]);
  }
});

describe("project_match_reviews repository", () => {
  test("upserts pending review payloads", async () => {
    const id = await upsertProjectMatchReview({
      source: SOURCE,
      sourceKey: SOURCE_KEY,
      result: buildResult(`${TEST_PREFIX} Primary`),
      note: "first pass",
    });

    expect(id).toBeTruthy();

    const stored = await getProjectMatchReview(SOURCE, SOURCE_KEY);
    expect(stored).toBeTruthy();
    expect(stored?.status).toBe("pending");
    expect(stored?.note).toBe("first pass");
    expect(Array.isArray(stored?.candidates)).toBe(true);

    await upsertProjectMatchReview({
      source: SOURCE,
      sourceKey: SOURCE_KEY,
      result: buildResult(`${TEST_PREFIX} Updated`),
      note: "updated pass",
    });

    const updated = await getProjectMatchReview(SOURCE, SOURCE_KEY);
    expect(updated?.primaryText).toContain("Updated");
    expect(updated?.note).toBe("updated pass");
  });

  test("marks review as resolved with selected project", async () => {
    const projectId = await createProject(`${TEST_PREFIX} Resolve Target`);
    await resolveProjectMatchReview({
      source: SOURCE,
      sourceKey: SOURCE_KEY,
      projectId,
      resolutionNote: "linked during deterministic pass",
    });

    const resolved = await getProjectMatchReview(SOURCE, SOURCE_KEY);
    expect(resolved?.status).toBe("resolved");
    expect(resolved?.selectedProjectId).toBe(projectId);
    expect(resolved?.resolutionNote).toContain("deterministic");
    expect(resolved?.resolvedAt).toBeTruthy();
  });
});
