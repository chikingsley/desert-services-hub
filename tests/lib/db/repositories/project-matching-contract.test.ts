import { afterAll, describe, expect, test } from "bun:test";
import { db } from "@lib/db/client";
import { findProjectCandidates } from "@lib/db/repositories/project-matching";
import { normalizeProjectNameKey } from "@lib/db/repositories/project-matching-utils";

const RUN_TAG = crypto.randomUUID().slice(0, 8).toLowerCase();
const TEST_PREFIX = `_TEST_DELETE_ME_PROJECT_MATCH_${RUN_TAG}_`;
const createdProjectIds: number[] = [];
const createdAccountIds: number[] = [];

async function createAccount(name: string): Promise<number> {
  const rows = (await db.run(
    `INSERT INTO accounts (name, domain, type)
     VALUES ($1, $2, 'contractor')
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
     VALUES ($1, $2, $3, $4, $5)
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
    const placeholders = createdProjectIds
      .map((_, index) => `$${index + 1}`)
      .join(", ");
    await db.run(
      `DELETE FROM projects
       WHERE id IN (${placeholders})`,
      createdProjectIds
    );
  } else {
    await db.run("DELETE FROM projects WHERE name LIKE $1", [
      `${TEST_PREFIX}%`,
    ]);
  }

  if (createdAccountIds.length > 0) {
    const placeholders = createdAccountIds
      .map((_, index) => `$${index + 1}`)
      .join(", ");
    await db.run(
      `DELETE FROM accounts
       WHERE id IN (${placeholders})`,
      createdAccountIds
    );
  } else {
    await db.run("DELETE FROM accounts WHERE name LIKE $1", [
      `${TEST_PREFIX}%`,
    ]);
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

  test("keeps account-scoped candidates when enough matches exist", async () => {
    const accountA = await createAccount(`${TEST_PREFIX}ACCOUNT_SCOPED_A`);
    const accountB = await createAccount(`${TEST_PREFIX}ACCOUNT_SCOPED_B`);

    for (let index = 0; index < 5; index++) {
      await createProject({
        accountId: accountA,
        name: `${TEST_PREFIX}IRONWOOD PAD ${index}`,
        contractor: "Builder Team",
      });
    }
    await createProject({
      accountId: accountB,
      name: `${TEST_PREFIX}IRONWOOD PAD OUTSIDE`,
      contractor: "Builder Team",
    });

    const result = await findProjectCandidates({
      primaryText: `${TEST_PREFIX}IRONWOOD PAD`,
      accountIdHint: accountA,
      contractorHint: "Builder Team",
      limit: 5,
    });

    expect(result).toBeTruthy();
    expect(result?.candidates).toHaveLength(5);
    expect(
      result?.candidates.every((candidate) => candidate.accountId === accountA)
    ).toBe(true);
  });

  test("falls back to global candidates when account scope is too narrow", async () => {
    const accountA = await createAccount(`${TEST_PREFIX}ACCOUNT_FALLBACK_A`);
    const accountB = await createAccount(`${TEST_PREFIX}ACCOUNT_FALLBACK_B`);

    await createProject({
      accountId: accountA,
      name: `${TEST_PREFIX}UNRELATED SITE`,
      contractor: "Builder Team",
    });
    const outsideProjectId = await createProject({
      accountId: accountB,
      name: `${TEST_PREFIX}IRONWOOD FALLBACK TARGET`,
      contractor: "Builder Team",
    });

    const result = await findProjectCandidates({
      primaryText: `${TEST_PREFIX}IRONWOOD FALLBACK TARGET`,
      accountIdHint: accountA,
      contractorHint: "Builder Team",
      limit: 5,
    });

    expect(result).toBeTruthy();
    expect(
      result?.candidates.some(
        (candidate) => candidate.projectId === outsideProjectId
      )
    ).toBe(true);
  });
});
