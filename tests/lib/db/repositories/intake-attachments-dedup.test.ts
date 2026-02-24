import { afterAll, describe, expect, test } from "bun:test";
import { db } from "@lib/db/client";
import {
  findContentHashAttachmentDuplicate,
  findInternetMessageAttachmentDuplicate,
} from "@lib/db/repositories/intake-attachments";

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
}): Promise<number> {
  const rows = (await db.run(
    `INSERT INTO documents (email_id, file_name, file_size, extraction_status, content_hash, source, created_at, updated_at, extraction_attempts, last_attempted_at)
     VALUES ($1, $2, $3, $4, $5, 'email_attachment', now(), now(), 1, now())
     RETURNING id`,
    [
      params.emailId,
      params.fileName,
      params.fileSize,
      params.extractionStatus,
      params.contentHash ?? null,
    ]
  )) as Array<{ id: number }>;
  const id = rows[0]?.id;
  if (!id) {
    throw new Error("Failed to create test document");
  }
  createdDocIds.push(id);
  return id;
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
});
