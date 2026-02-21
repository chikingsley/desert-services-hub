import { describe, expect, test } from "bun:test";
import { db } from "@lib/db/client";
import { linkEmailsToContacts } from "@lib/linking/link-contacts";

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

describe("linkEmailsToContacts real sender behavior", () => {
  test("uses real sender fields for from-linking and contact creation", async () => {
    await runInRollbackTransaction(async () => {
      await db.run(`
        CREATE TEMP TABLE contacts (
          id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          monday_item_id TEXT UNIQUE NOT NULL,
          name TEXT NOT NULL,
          email TEXT,
          phone TEXT,
          title TEXT,
          account_id INTEGER,
          imported_account_name TEXT,
          contractor_searched_at TEXT,
          synced_at TIMESTAMPTZ DEFAULT now(),
          created_at TIMESTAMPTZ DEFAULT now(),
          updated_at TIMESTAMPTZ DEFAULT now()
        );

        CREATE TEMP TABLE emails (
          id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          from_email TEXT,
          real_sender_email TEXT,
          from_name TEXT,
          real_sender_name TEXT,
          to_emails TEXT,
          cc_emails TEXT,
          account_id INTEGER,
          is_internal INTEGER,
          is_excluded INTEGER,
          received_at TIMESTAMPTZ NOT NULL,
          body_preview TEXT
        );

        CREATE TEMP TABLE contact_emails (
          id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          contact_id INTEGER NOT NULL,
          email_id INTEGER NOT NULL,
          relationship TEXT NOT NULL,
          UNIQUE (contact_id, email_id, relationship)
        );
      `);

      const existingContactId = requireId(
        await db
          .query<{ id: number }>(
            `INSERT INTO contacts (monday_item_id, name, email, account_id)
             VALUES ($1, $2, $3, $4)
             RETURNING id`
          )
          .get("contact:existing", "Existing Person", "person@vendor.com", 901),
        "existing contact"
      );

      const emailWithKnownRealSenderId = requireId(
        await db
          .query<{ id: number }>(
            `INSERT INTO emails (
               from_email, real_sender_email, from_name, real_sender_name,
               to_emails, cc_emails, account_id, is_internal, is_excluded,
               received_at, body_preview
             )
             VALUES ($1, $2, $3, $4, '[]', '[]', $5, 0, 0, now(), $6)
             RETURNING id`
          )
          .get(
            "relay@buildingconnected.com",
            "person@vendor.com",
            "Relay Name",
            "Existing Person",
            901,
            "Signature block"
          ),
        "known real sender email"
      );

      const emailWithUnknownRealSenderId = requireId(
        await db
          .query<{ id: number }>(
            `INSERT INTO emails (
               from_email, real_sender_email, from_name, real_sender_name,
               to_emails, cc_emails, account_id, is_internal, is_excluded,
               received_at, body_preview
             )
             VALUES ($1, $2, $3, $4, '[]', '[]', $5, 0, 0, now(), $6)
             RETURNING id`
          )
          .get(
            "notifications@buildingconnected.com",
            "newperson@newco.com",
            "Bid Notifications",
            "New Person",
            902,
            "New Person\\nEstimator"
          ),
        "unknown real sender email"
      );

      const stats = await linkEmailsToContacts({
        skipEnrichment: true,
        createLimit: 25,
      });

      const knownLink = await db
        .query<{ cnt: string }>(
          `SELECT COUNT(*)::text AS cnt
           FROM contact_emails
           WHERE contact_id = $1 AND email_id = $2 AND relationship = 'from'`
        )
        .get(existingContactId, emailWithKnownRealSenderId);

      const createdContact = await db
        .query<{ id: number; name: string }>(
          "SELECT id, name FROM contacts WHERE email = $1"
        )
        .get("newperson@newco.com");

      const relayContact = await db
        .query<{ cnt: string }>(
          "SELECT COUNT(*)::text AS cnt FROM contacts WHERE email = $1"
        )
        .get("notifications@buildingconnected.com");

      const createdLink = await db
        .query<{ cnt: string }>(
          `SELECT COUNT(*)::text AS cnt
           FROM contact_emails
           WHERE email_id = $1 AND relationship = 'from'`
        )
        .get(emailWithUnknownRealSenderId);

      expect(Number(knownLink?.cnt ?? "0")).toBe(1);
      expect(createdContact?.name).toBe("New Person");
      expect(Number(relayContact?.cnt ?? "0")).toBe(0);
      expect(Number(createdLink?.cnt ?? "0")).toBe(1);

      expect(stats.contactsCreated).toBe(1);
      expect(stats.linkedFrom).toBe(2);
      expect(stats.linkedTo).toBe(0);
      expect(stats.linkedCc).toBe(0);
    });
  });
});
