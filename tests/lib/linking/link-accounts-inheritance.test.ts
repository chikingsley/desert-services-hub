import { describe, expect, test } from "bun:test";
import { db } from "@lib/db/client";
import { linkEmailsToAccounts } from "@/packages/archive/email/sync/linking/link-accounts";

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

describe("linkEmailsToAccounts inheritance signals", () => {
  test("links project/estimate/contact inheritance and skips ambiguous candidates", async () => {
    await runInRollbackTransaction(async () => {
      await db.run(`
        CREATE TEMP TABLE accounts (
          id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          domain TEXT UNIQUE,
          name TEXT NOT NULL,
          type TEXT DEFAULT 'contractor'
        );

        CREATE TEMP TABLE projects (
          id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          account_id INTEGER
        );

        CREATE TEMP TABLE estimates (
          id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          account_id INTEGER
        );

        CREATE TEMP TABLE estimate_emails (
          estimate_id INTEGER NOT NULL,
          email_id INTEGER NOT NULL,
          UNIQUE (estimate_id, email_id)
        );

        CREATE TEMP TABLE contacts (
          id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          account_id INTEGER,
          email TEXT
        );

        CREATE TEMP TABLE contact_emails (
          contact_id INTEGER NOT NULL,
          email_id INTEGER NOT NULL,
          relationship TEXT NOT NULL,
          UNIQUE (contact_id, email_id, relationship)
        );

        CREATE TEMP TABLE company_aliases (
          account_id INTEGER NOT NULL,
          alias TEXT NOT NULL,
          UNIQUE (account_id, alias)
        );

        CREATE TEMP TABLE emails (
          id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          project_id INTEGER,
          account_id INTEGER,
          real_sender_domain TEXT,
          real_sender_company TEXT,
          original_sender_domain TEXT,
          from_domain TEXT,
          is_internal INTEGER DEFAULT 0,
          is_excluded INTEGER DEFAULT 0,
          is_platform_email INTEGER DEFAULT 0,
          real_sender_email TEXT,
          from_name TEXT,
          conversation_id TEXT
        );
      `);

      const accountA = requireId(
        await db
          .query<{ id: number }>(
            "INSERT INTO accounts (domain, name, type) VALUES ($1, $2, 'contractor') RETURNING id"
          )
          .get("alpha.example.com", "Alpha"),
        "accountA"
      );
      const accountB = requireId(
        await db
          .query<{ id: number }>(
            "INSERT INTO accounts (domain, name, type) VALUES ($1, $2, 'contractor') RETURNING id"
          )
          .get("beta.example.com", "Beta"),
        "accountB"
      );

      const projectId = requireId(
        await db
          .query<{ id: number }>(
            "INSERT INTO projects (account_id) VALUES ($1) RETURNING id"
          )
          .get(accountA),
        "project"
      );

      const estimateA = requireId(
        await db
          .query<{ id: number }>(
            "INSERT INTO estimates (account_id) VALUES ($1) RETURNING id"
          )
          .get(accountA),
        "estimateA"
      );
      const estimateB = requireId(
        await db
          .query<{ id: number }>(
            "INSERT INTO estimates (account_id) VALUES ($1) RETURNING id"
          )
          .get(accountB),
        "estimateB"
      );

      async function insertEmail(projectRef: number | null): Promise<number> {
        return requireId(
          await db
            .query<{ id: number }>(
              `INSERT INTO emails (
                 project_id, account_id, real_sender_domain, real_sender_company,
                 original_sender_domain, from_domain, is_platform_email,
                 real_sender_email, from_name, conversation_id
               )
               VALUES ($1, NULL, NULL, NULL, NULL, NULL, 0, NULL, NULL, NULL)
               RETURNING id`
            )
            .get(projectRef),
          "email"
        );
      }

      const projectEmailId = await insertEmail(projectId);
      const estimateEmailId = await insertEmail(null);
      const estimateAmbiguousEmailId = await insertEmail(null);
      const contactEmailId = await insertEmail(null);
      const contactAmbiguousEmailId = await insertEmail(null);

      await db.run(
        "INSERT INTO estimate_emails (estimate_id, email_id) VALUES ($1, $2)",
        [estimateA, estimateEmailId]
      );
      await db.run(
        "INSERT INTO estimate_emails (estimate_id, email_id) VALUES ($1, $2)",
        [estimateA, estimateAmbiguousEmailId]
      );
      await db.run(
        "INSERT INTO estimate_emails (estimate_id, email_id) VALUES ($1, $2)",
        [estimateB, estimateAmbiguousEmailId]
      );

      const contactA = requireId(
        await db
          .query<{ id: number }>(
            "INSERT INTO contacts (account_id, email) VALUES ($1, $2) RETURNING id"
          )
          .get(accountA, "person-a@alpha.example.com"),
        "contactA"
      );
      const contactB = requireId(
        await db
          .query<{ id: number }>(
            "INSERT INTO contacts (account_id, email) VALUES ($1, $2) RETURNING id"
          )
          .get(accountA, "person-b@alpha.example.com"),
        "contactB"
      );
      const contactC = requireId(
        await db
          .query<{ id: number }>(
            "INSERT INTO contacts (account_id, email) VALUES ($1, $2) RETURNING id"
          )
          .get(accountB, "person-c@beta.example.com"),
        "contactC"
      );

      await db.run(
        "INSERT INTO contact_emails (contact_id, email_id, relationship) VALUES ($1, $2, 'from')",
        [contactA, contactEmailId]
      );
      await db.run(
        "INSERT INTO contact_emails (contact_id, email_id, relationship) VALUES ($1, $2, 'from')",
        [contactB, contactAmbiguousEmailId]
      );
      await db.run(
        "INSERT INTO contact_emails (contact_id, email_id, relationship) VALUES ($1, $2, 'from')",
        [contactC, contactAmbiguousEmailId]
      );

      const stats = await linkEmailsToAccounts({ useTransaction: false });

      const projectEmail = await db
        .query<{ account_id: number | null }>(
          "SELECT account_id FROM emails WHERE id = $1"
        )
        .get(projectEmailId);
      const estimateEmail = await db
        .query<{ account_id: number | null }>(
          "SELECT account_id FROM emails WHERE id = $1"
        )
        .get(estimateEmailId);
      const contactEmail = await db
        .query<{ account_id: number | null }>(
          "SELECT account_id FROM emails WHERE id = $1"
        )
        .get(contactEmailId);
      const estimateAmbiguousEmail = await db
        .query<{ account_id: number | null }>(
          "SELECT account_id FROM emails WHERE id = $1"
        )
        .get(estimateAmbiguousEmailId);
      const contactAmbiguousEmail = await db
        .query<{ account_id: number | null }>(
          "SELECT account_id FROM emails WHERE id = $1"
        )
        .get(contactAmbiguousEmailId);

      expect(projectEmail?.account_id).toBe(accountA);
      expect(estimateEmail?.account_id).toBe(accountA);
      expect(contactEmail?.account_id).toBe(accountA);
      expect(estimateAmbiguousEmail?.account_id).toBeNull();
      expect(contactAmbiguousEmail?.account_id).toBeNull();

      expect(stats.linkedByProject).toBe(1);
      expect(stats.linkedByEstimate).toBe(1);
      expect(stats.linkedByContact).toBe(1);
      expect(stats.skippedAmbiguous).toBe(2);
      expect(stats.accountsCreated).toBe(0);
    });
  });
});
