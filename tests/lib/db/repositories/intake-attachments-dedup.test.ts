import { afterAll, describe, expect, test } from "bun:test";
import { db } from "@lib/db/client";
import {
  findContentHashAttachmentDuplicate,
  findInternetMessageAttachmentDuplicate,
  getIntakeAttachmentRows,
} from "@documents-intake/db/intake-attachments";

/**
 * Tests that the dedup queries only match against 'success' status,
 * NOT against other 'deduped' records. Matching against 'deduped'
 * creates orphan chains where no copy is ever extracted.
 */

const RUN_TAG = crypto.randomUUID().slice(0, 8).toLowerCase();
const INTERNET_MSG_ID = `<test-dedup-${RUN_TAG}@example.test>`;
const FILE_NAME = `_TEST_DEDUP_${RUN_TAG}.pdf`;
const FILE_SIZE = 12_345;
const CONTENT_HASH = `test_hash_${RUN_TAG}`;

const createdDocIds: number[] = [];
const createdEmailIds: number[] = [];
const createdMailboxIds: number[] = [];

async function createMailbox(): Promise<number> {
  const rows = (await db.run(
    `INSERT INTO mailboxes (email, display_name)
     VALUES ($1, $2)
     RETURNING id`,
    [`test-dedup-${RUN_TAG}@example.test`, `Test Dedup ${RUN_TAG}`]
  )) as Array<{ id: number }>;
  const id = rows[0]?.id;
  if (!id) {
    throw new Error("Failed to create test mailbox");
  }
  createdMailboxIds.push(id);
  return id;
}

let sharedMailboxId: number;

async function ensureMailbox(): Promise<number> {
  if (sharedMailboxId) {
    return sharedMailboxId;
  }
  sharedMailboxId = await createMailbox();
  return sharedMailboxId;
}

async function createEmail(internetMessageId: string): Promise<number> {
  const mailboxId = await ensureMailbox();
  const rows = (await db.run(
    `INSERT INTO emails (mailbox_id, message_id, internet_message_id, subject, from_email, received_at)
     VALUES ($1, $2, $3, $4, $5, now())
     RETURNING id`,
    [
      mailboxId,
      `msg-${crypto.randomUUID().slice(0, 8)}`,
      internetMessageId,
      `Test dedup ${RUN_TAG}`,
      "test@example.test",
    ]
  )) as Array<{ id: number }>;
  const id = rows[0]?.id;
  if (!id) {
    throw new Error("Failed to create test email");
  }
  createdEmailIds.push(id);
  return id;
}

async function createDocument(params: {
  emailId: number;
  fileName: string;
  fileSize: number;
  extractionStatus: string;
  contentHash?: string;
  outlookAttachmentId?: string | null;
  storagePath?: string | null;
}): Promise<number> {
  const rows = (await db.run(
    `INSERT INTO documents (
       email_id,
       file_name,
       file_size,
       extraction_status,
       content_hash,
       source,
       outlook_attachment_id,
       storage_path,
       created_at,
       updated_at,
       extraction_attempts,
       last_attempted_at
     )
     VALUES ($1, $2, $3, $4, $5, 'email_attachment', $6, $7, now(), now(), 1, now())
     RETURNING id`,
    [
      params.emailId,
      params.fileName,
      params.fileSize,
      params.extractionStatus,
      params.contentHash ?? null,
      params.outlookAttachmentId ?? null,
      params.storagePath ?? null,
    ]
  )) as Array<{ id: number }>;
  const id = rows[0]?.id;
  if (!id) {
    throw new Error("Failed to create test document");
  }
  createdDocIds.push(id);
  return id;
}

async function findBodyLinkPreflightViolations(
  attachmentIdLike: string
): Promise<number[]> {
  const rows = (await db.run(
    `SELECT id
     FROM documents
     WHERE source = 'email_attachment'
       AND outlook_attachment_id LIKE $1
       AND extraction_status IN ('pending', 'downloaded')
       AND (
         storage_path IS NULL
         OR storage_path NOT LIKE '/app/data/attachments/body-links/%'
       )
     ORDER BY id`,
    [attachmentIdLike]
  )) as Array<{ id: number }>;

  return rows.map((r) => r.id);
}

afterAll(async () => {
  for (const id of createdDocIds) {
    await db.run("DELETE FROM documents WHERE id = $1", [id]);
  }
  for (const id of createdEmailIds) {
    await db.run("DELETE FROM emails WHERE id = $1", [id]);
  }
  for (const id of createdMailboxIds) {
    await db.run("DELETE FROM mailboxes WHERE id = $1", [id]);
  }
});

describe("intake-attachments dedup queries", () => {
  describe("findInternetMessageAttachmentDuplicate", () => {
    test("does NOT match a 'deduped' sibling (prevents orphan chains)", async () => {
      const emailId = await createEmail(INTERNET_MSG_ID);

      // Create a doc marked 'deduped' — should NOT count as a valid duplicate
      const dedupedDocId = await createDocument({
        emailId,
        fileName: FILE_NAME,
        fileSize: FILE_SIZE,
        extractionStatus: "deduped",
      });

      // A new doc checking for duplicates should find nothing
      const newDocId = dedupedDocId + 999_999; // non-existent ID, just for the exclude param
      const result = await findInternetMessageAttachmentDuplicate(
        INTERNET_MSG_ID,
        FILE_NAME,
        FILE_SIZE,
        newDocId
      );

      expect(result).toBeNull();
    });

    test("DOES match a 'success' sibling (valid dedup)", async () => {
      const emailId = await createEmail(INTERNET_MSG_ID);

      // Create a doc marked 'success' — this IS a valid duplicate target
      const successDocId = await createDocument({
        emailId,
        fileName: FILE_NAME,
        fileSize: FILE_SIZE,
        extractionStatus: "success",
      });

      const newDocId = successDocId + 999_999;
      const result = await findInternetMessageAttachmentDuplicate(
        INTERNET_MSG_ID,
        FILE_NAME,
        FILE_SIZE,
        newDocId
      );

      expect(result).toBe(successDocId);
    });

    test("does NOT match 'failed' or 'pending' siblings", async () => {
      // Use a unique message ID so previous tests' 'success' docs don't interfere
      const isolatedMsgId = `<test-fail-pending-${RUN_TAG}@example.test>`;
      const emailId = await createEmail(isolatedMsgId);

      const failedId = await createDocument({
        emailId,
        fileName: FILE_NAME,
        fileSize: FILE_SIZE,
        extractionStatus: "failed",
      });
      await createDocument({
        emailId,
        fileName: FILE_NAME,
        fileSize: FILE_SIZE,
        extractionStatus: "pending",
      });

      const result = await findInternetMessageAttachmentDuplicate(
        isolatedMsgId,
        FILE_NAME,
        FILE_SIZE,
        failedId + 999_999
      );

      expect(result).toBeNull();
    });
  });

  describe("findContentHashAttachmentDuplicate", () => {
    test("does NOT match a 'deduped' doc with same hash", async () => {
      const emailId = await createEmail(`<other-${RUN_TAG}@test>`);

      await createDocument({
        emailId,
        fileName: `other_${FILE_NAME}`,
        fileSize: FILE_SIZE,
        extractionStatus: "deduped",
        contentHash: CONTENT_HASH,
      });

      const result = await findContentHashAttachmentDuplicate(
        CONTENT_HASH,
        999_999_999
      );

      expect(result).toBeNull();
    });

    test("DOES match a 'success' doc with same hash", async () => {
      const emailId = await createEmail(`<hash-ok-${RUN_TAG}@test>`);

      const successDocId = await createDocument({
        emailId,
        fileName: `hash_ok_${FILE_NAME}`,
        fileSize: FILE_SIZE,
        extractionStatus: "success",
        contentHash: CONTENT_HASH,
      });

      const result = await findContentHashAttachmentDuplicate(
        CONTENT_HASH,
        999_999_999
      );

      expect(result).toBe(successDocId);
    });
  });

  describe("body-link preflight invariants", () => {
    test("flags pending bodylink rows when storage_path is missing", async () => {
      const emailId = await createEmail(`<bodylink-missing-${RUN_TAG}@test>`);
      const attachmentId = `bodylink:onedrive:${RUN_TAG}-missing-path`;
      const badDocId = await createDocument({
        emailId,
        fileName: `missing_${FILE_NAME}`,
        fileSize: FILE_SIZE,
        extractionStatus: "pending",
        outlookAttachmentId: attachmentId,
        storagePath: null,
      });

      const violations = await findBodyLinkPreflightViolations(
        `${attachmentId}%`
      );
      expect(violations).toContain(badDocId);
    });

    test("flags pending bodylink rows when storage_path is /tmp", async () => {
      const emailId = await createEmail(`<bodylink-tmp-${RUN_TAG}@test>`);
      const attachmentId = `bodylink:dropbox:${RUN_TAG}-tmp-path`;
      const badDocId = await createDocument({
        emailId,
        fileName: `tmp_${FILE_NAME}`,
        fileSize: FILE_SIZE,
        extractionStatus: "pending",
        outlookAttachmentId: attachmentId,
        storagePath: `/tmp/bodylink-${RUN_TAG}.pdf`,
      });

      const violations = await findBodyLinkPreflightViolations(
        `${attachmentId}%`
      );
      expect(violations).toContain(badDocId);
    });

    test("does NOT flag pending bodylink rows with durable storage_path", async () => {
      const emailId = await createEmail(`<bodylink-good-${RUN_TAG}@test>`);
      const attachmentId = `bodylink:egnyte:${RUN_TAG}-durable-path`;
      await createDocument({
        emailId,
        fileName: `good_${FILE_NAME}`,
        fileSize: FILE_SIZE,
        extractionStatus: "pending",
        outlookAttachmentId: attachmentId,
        storagePath: `/app/data/attachments/body-links/bodylink-${RUN_TAG}.pdf`,
      });

      const violations = await findBodyLinkPreflightViolations(
        `${attachmentId}%`
      );
      expect(violations).toHaveLength(0);
    });

    test("intake rows include storage_path for bodylink attachments", async () => {
      const emailId = await createEmail(
        `<bodylink-intake-row-${RUN_TAG}@test>`
      );
      const attachmentId = `bodylink:buildingconnected:${RUN_TAG}-row-shape`;
      const durablePath = `/app/data/attachments/body-links/bodylink-${RUN_TAG}-row-shape.zip`;
      const docId = await createDocument({
        emailId,
        fileName: `row_${FILE_NAME}`,
        fileSize: FILE_SIZE,
        extractionStatus: "pending",
        outlookAttachmentId: attachmentId,
        storagePath: durablePath,
      });

      const rows = await getIntakeAttachmentRows(500);
      const row = rows.find((r) => r.attachment_id_pk === docId);

      expect(row).toBeTruthy();
      expect(row?.graph_attachment_id).toBe(attachmentId);
      expect(row?.storage_path).toBe(durablePath);
    });
  });
});
