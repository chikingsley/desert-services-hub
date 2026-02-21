import { describe, expect, test } from "bun:test";
import { db } from "@lib/db/client";
import { linkEmail } from "@lib/linking/link-email";

const ROLLBACK = new Error("ROLLBACK_TEST_TRANSACTION");

async function runInRollbackTransaction(
  run: () => Promise<void>
): Promise<void> {
  try {
    await db.transaction(async () => {
      await run();
      throw ROLLBACK;
    });
  } catch (error) {
    if (error !== ROLLBACK) {
      throw error;
    }
  }
}

function requireId(row: { id: number } | null, entity: string): number {
  if (!row) {
    throw new Error(`Failed to create ${entity}`);
  }
  return row.id;
}

describe("linkEmail body_full signal coverage", () => {
  test("links estimate when estimate number appears only in body_full", async () => {
    await runInRollbackTransaction(async () => {
      await db.run(`
        CREATE TEMP TABLE emails (
          id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          subject TEXT,
          normalized_subject TEXT,
          body_preview TEXT,
          body_full TEXT,
          attachment_names TEXT,
          from_domain TEXT,
          project_id INTEGER,
          conversation_id TEXT,
          received_at TIMESTAMPTZ
        );

        CREATE TEMP TABLE estimates (
          id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          monday_item_id TEXT,
          estimate_number TEXT,
          account_domain TEXT,
          name TEXT
        );

        CREATE TEMP TABLE estimate_emails (
          estimate_id INTEGER NOT NULL,
          email_id INTEGER NOT NULL,
          match_type TEXT,
          match_detail TEXT,
          UNIQUE (estimate_id, email_id)
        );

        CREATE TEMP TABLE project_estimates (
          project_id INTEGER NOT NULL,
          estimate_id INTEGER NOT NULL
        );

        CREATE TEMP TABLE projects (
          id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          name TEXT,
          email_count INTEGER,
          first_seen TEXT,
          last_seen TEXT,
          updated_at TIMESTAMPTZ
        );
      `);

      const estimateId = requireId(
        await db
          .query<{ id: number }>(
            `INSERT INTO estimates (monday_item_id, estimate_number, account_domain, name)
             VALUES ($1, $2, $3, $4)
             RETURNING id`
          )
          .get("900000001", "7654321", "newco.com", "Estimate 7654321"),
        "estimate"
      );

      const emailId = requireId(
        await db
          .query<{ id: number }>(
            `INSERT INTO emails (
               subject, normalized_subject, body_preview, body_full,
               attachment_names, from_domain, project_id, conversation_id, received_at
             )
             VALUES ($1, $2, $3, $4, $5, $6, NULL, NULL, now())
             RETURNING id`
          )
          .get(
            null,
            null,
            null,
            "Please review and approve Estimate # 7654321 today.",
            "[]",
            null
          ),
        "email"
      );

      const result = await linkEmail(emailId);

      const links = await db
        .query<{ cnt: string }>(
          "SELECT COUNT(*)::text AS cnt FROM estimate_emails WHERE estimate_id = $1 AND email_id = $2"
        )
        .get(estimateId, emailId);

      expect(result.estimateLinked).toBe(true);
      expect(result.projectLinked).toBe(false);
      expect(
        result.signals.some((signal) => signal.includes("estimate_number"))
      ).toBe(true);
      expect(Number(links?.cnt ?? "0")).toBe(1);
    });
  });
});
