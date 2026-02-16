import { afterAll, describe, expect, test } from "bun:test";
import { db } from "@lib/db/hub";
import {
  addProjectAlias,
  findProjectCandidates,
  normalizeProjectNameKey,
} from "@lib/db/repositories/project";

const RUN_TAG = crypto.randomUUID().slice(0, 8).toLowerCase();
const TEST_PREFIX = `_TEST_DELETE_ME_PROJECT_MATCH_${RUN_TAG}_`;
const createdProjectIds: number[] = [];
const createdAccountIds: number[] = [];

async function createAccount(name: string): Promise<number> {
  const rows = (await db.run(
    `INSERT INTO accounts (name, domain, type)
     VALUES (?, ?, 'contractor')
     RETURNING id`,
    [name, `${crypto.randomUUID()}@example.test`]
  )) as Array<{ id: number }>;
  const id = rows[0]?.id;
  if (!id) {
    throw new Error("Failed to create test account");
  }
  createdAccountIds.push(id);
  return id;
}

async function createProject(params: {
  accountId: number;
  name: string;
  contractor?: string | null;
  address?: string | null;
}): Promise<number> {
  const rows = (await db.run(
    `INSERT INTO projects (account_id, name, normalized_name, contractor, address)
     VALUES (?, ?, ?, ?, ?)
     RETURNING id`,
    [
      params.accountId,
      params.name,
      normalizeProjectNameKey(params.name),
      params.contractor ?? null,
      params.address ?? null,
    ]
  )) as Array<{ id: number }>;
  const id = rows[0]?.id;
  if (!id) {
    throw new Error("Failed to create test project");
  }
  createdProjectIds.push(id);
  return id;
}

afterAll(async () => {
  if (createdProjectIds.length > 0) {
    await db.run(
      `DELETE FROM project_aliases
       WHERE project_id IN (${createdProjectIds.map(() => "?").join(", ")})`,
      createdProjectIds
    );
    await db.run(
      `DELETE FROM projects
       WHERE id IN (${createdProjectIds.map(() => "?").join(", ")})`,
      createdProjectIds
    );
  } else {
    await db.run("DELETE FROM projects WHERE name LIKE ?", [`${TEST_PREFIX}%`]);
  }

  if (createdAccountIds.length > 0) {
    await db.run(
      `DELETE FROM accounts
       WHERE id IN (${createdAccountIds.map(() => "?").join(", ")})`,
      createdAccountIds
    );
  } else {
    await db.run("DELETE FROM accounts WHERE name LIKE ?", [`${TEST_PREFIX}%`]);
  }
});

describe("project matching contract", () => {
  test("auto-links on exact normalized-name match", async () => {
    const accountId = await createAccount(`${TEST_PREFIX}ACCOUNT_EXACT`);
    const projectId = await createProject({
      accountId,
      name: `${TEST_PREFIX}DPX8 SITE SURRENDER`,
      contractor: "Ganem Construction",
    });

    const result = await findProjectCandidates({
      primaryText: `${TEST_PREFIX}DPX8 SITE SURRENDER`,
      accountIdHint: accountId,
      limit: 5,
    });

    expect(result).toBeTruthy();
    expect(result?.decision.autoLink).toBe(true);
    expect(result?.decision.best?.projectId).toBe(projectId);
    expect(
      result?.decision.best?.reasons.some(
        (reason) => reason.code === "normalized_name_exact"
      )
    ).toBe(true);
  });

  test("ranks exact project alias as top candidate", async () => {
    const accountId = await createAccount(`${TEST_PREFIX}ACCOUNT_ALIAS`);
    const projectId = await createProject({
      accountId,
      name: `${TEST_PREFIX}41ST AVENUE DUST`,
      contractor: "Weis Builders",
    });
    const aliasText = `${TEST_PREFIX}ALIAS TARGET 41ST`;
    await addProjectAlias(projectId, aliasText);

    const result = await findProjectCandidates({
      primaryText: aliasText,
      accountIdHint: accountId,
      limit: 5,
    });

    expect(result).toBeTruthy();
    expect(result?.decision.best?.projectId).toBe(projectId);
    expect(
      result?.decision.best?.reasons.some(
        (reason) => reason.code === "project_alias_exact"
      )
    ).toBe(true);
  });

  test("requires manual review when top candidates are ambiguous", async () => {
    const accountId = await createAccount(`${TEST_PREFIX}ACCOUNT_AMBIG`);
    await createProject({
      accountId,
      name: `${TEST_PREFIX}PHASE ALPHA NORTH`,
      contractor: "Builder One",
    });
    await createProject({
      accountId,
      name: `${TEST_PREFIX}PHASE ALPHA SOUTH`,
      contractor: "Builder One",
    });

    const result = await findProjectCandidates({
      primaryText: `${TEST_PREFIX}PHASE ALPHA`,
      contractorHint: "Builder One",
      accountIdHint: accountId,
      limit: 5,
    });

    expect(result).toBeTruthy();
    expect(result?.candidates.length).toBeGreaterThanOrEqual(2);
    expect(result?.decision.autoLink).toBe(false);
    expect(result?.decision.reason).toBe("manual_review_required");
  });
});
