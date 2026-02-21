import { afterAll, describe, expect, test } from "bun:test";
import { db } from "@lib/db/client";

/**
 * Tests the reactive link cascade triggers from migration:
 * 20260220120000_reactive_link_cascade_triggers.sql
 *
 * These triggers propagate project_id through the entity graph:
 *   project_estimates → emails (via estimate_emails) → documents
 *   emails → conversation siblings → documents
 *
 * Forward cascades only fill NULLs (never overwrite).
 * Backward cascades recompute from remaining paths.
 */

const RUN = crypto.randomUUID().slice(0, 8).toLowerCase();

const ids = {
  projects: [] as number[],
  estimates: [] as number[],
  mailboxes: [] as number[],
  emails: [] as number[],
  documents: [] as number[],
  estimateEmails: [] as number[],
  projectEstimates: [] as Array<{ projectId: number; estimateId: number }>,
};

async function createProject(name: string): Promise<number> {
  const rows = (await db.run(
    `INSERT INTO projects (name, lifecycle_state, created_at, updated_at)
     VALUES ($1, 'active', now(), now()) RETURNING id`,
    [`_test_cascade_${RUN}_${name}`]
  )) as Array<{ id: number }>;
  const id = rows[0]?.id;
  if (!id) throw new Error("Failed to create project");
  ids.projects.push(id);
  return id;
}

async function createEstimate(num: string): Promise<number> {
  const rows = (await db.run(
    `INSERT INTO estimates (name, estimate_number, job_name, created_at, updated_at)
     VALUES ($1, $2, $3, now(), now()) RETURNING id`,
    [
      `_test_cascade_${RUN}_${num}`,
      `_TC_${RUN}_${num}`,
      `_test_cascade_job_${RUN}`,
    ]
  )) as Array<{ id: number }>;
  const id = rows[0]?.id;
  if (!id) throw new Error("Failed to create estimate");
  ids.estimates.push(id);
  return id;
}

let mailboxId: number | undefined;
async function ensureMailbox(): Promise<number> {
  if (mailboxId) return mailboxId;
  const rows = (await db.run(
    `INSERT INTO mailboxes (email, display_name)
     VALUES ($1, $2) RETURNING id`,
    [`_test_cascade_${RUN}@example.test`, `Test Cascade ${RUN}`]
  )) as Array<{ id: number }>;
  const id = rows[0]?.id;
  if (!id) throw new Error("Failed to create mailbox");
  ids.mailboxes.push(id);
  mailboxId = id;
  return id;
}

async function createEmail(
  msgId: string,
  conversationId?: string
): Promise<number> {
  const mbId = await ensureMailbox();
  const rows = (await db.run(
    `INSERT INTO emails (mailbox_id, message_id, subject, from_email, received_at, conversation_id)
     VALUES ($1, $2, $3, $4, now(), $5) RETURNING id`,
    [
      mbId,
      `_tc_${RUN}_${msgId}`,
      `Test cascade ${RUN}`,
      "test@example.test",
      conversationId ?? null,
    ]
  )) as Array<{ id: number }>;
  const id = rows[0]?.id;
  if (!id) throw new Error("Failed to create email");
  ids.emails.push(id);
  return id;
}

async function createDocument(emailId: number): Promise<number> {
  const rows = (await db.run(
    `INSERT INTO documents (email_id, file_name, source, document_type, created_at, updated_at)
     VALUES ($1, $2, 'email_attachment', 'unknown', now(), now()) RETURNING id`,
    [emailId, `_tc_${RUN}_${emailId}.pdf`]
  )) as Array<{ id: number }>;
  const id = rows[0]?.id;
  if (!id) throw new Error("Failed to create document");
  ids.documents.push(id);
  return id;
}

async function linkEstimateEmail(
  estimateId: number,
  emailId: number
): Promise<number> {
  const rows = (await db.run(
    `INSERT INTO estimate_emails (estimate_id, email_id, match_type)
     VALUES ($1, $2, 'test') RETURNING id`,
    [estimateId, emailId]
  )) as Array<{ id: number }>;
  const id = rows[0]?.id;
  if (!id) throw new Error("Failed to link estimate to email");
  ids.estimateEmails.push(id);
  return id;
}

async function linkProjectEstimate(
  projectId: number,
  estimateId: number
): Promise<void> {
  await db.run(
    `INSERT INTO project_estimates (project_id, estimate_id)
     VALUES ($1, $2)`,
    [projectId, estimateId]
  );
  ids.projectEstimates.push({ projectId, estimateId });
}

async function getProjectId(
  table: string,
  id: number
): Promise<number | null> {
  const row = await db
    .query<{ project_id: number | null }>(`SELECT project_id FROM ${table} WHERE id = $1`)
    .get(id);
  return row?.project_id ?? null;
}

afterAll(async () => {
  // Reverse order to respect FK constraints
  for (const pe of ids.projectEstimates) {
    await db.run(
      "DELETE FROM project_estimates WHERE project_id = $1 AND estimate_id = $2",
      [pe.projectId, pe.estimateId]
    );
  }
  for (const id of ids.estimateEmails) {
    await db.run("DELETE FROM estimate_emails WHERE id = $1", [id]);
  }
  for (const id of ids.documents) {
    await db.run("DELETE FROM documents WHERE id = $1", [id]);
  }
  for (const id of ids.emails) {
    await db.run("DELETE FROM emails WHERE id = $1", [id]);
  }
  for (const id of ids.estimates) {
    await db.run("DELETE FROM estimates WHERE id = $1", [id]);
  }
  for (const id of ids.projects) {
    await db.run("DELETE FROM projects WHERE id = $1", [id]);
  }
  for (const id of ids.mailboxes) {
    await db.run("DELETE FROM mailboxes WHERE id = $1", [id]);
  }
});

describe("reactive link cascade triggers", () => {
  describe("forward cascade: project_estimates INSERT", () => {
    test("propagates project_id to email via estimate_emails link", async () => {
      const projectId = await createProject("fwd1");
      const estimateId = await createEstimate("FWD1");
      const emailId = await createEmail("fwd1");

      // Link estimate → email first (no project yet, so email stays NULL)
      await linkEstimateEmail(estimateId, emailId);
      expect(await getProjectId("emails", emailId)).toBeNull();

      // Link project → estimate (triggers cascade)
      await linkProjectEstimate(projectId, estimateId);
      expect(await getProjectId("emails", emailId)).toBe(projectId);
    });

    test("propagates project_id to document via email", async () => {
      const projectId = await createProject("fwd2");
      const estimateId = await createEstimate("FWD2");
      const emailId = await createEmail("fwd2");
      const docId = await createDocument(emailId);

      await linkEstimateEmail(estimateId, emailId);
      await linkProjectEstimate(projectId, estimateId);

      expect(await getProjectId("documents", docId)).toBe(projectId);
    });

    test("propagates project_id to conversation siblings", async () => {
      const projectId = await createProject("fwd3");
      const estimateId = await createEstimate("FWD3");
      const convId = `_tc_conv_${RUN}_fwd3`;

      const email1 = await createEmail("fwd3a", convId);
      const email2 = await createEmail("fwd3b", convId);

      await linkEstimateEmail(estimateId, email1);
      await linkProjectEstimate(projectId, estimateId);

      // Email 1 gets project via estimate chain
      expect(await getProjectId("emails", email1)).toBe(projectId);
      // Email 2 gets project via conversation propagation
      expect(await getProjectId("emails", email2)).toBe(projectId);
    });

    test("does NOT overwrite existing project_id on email", async () => {
      const project1 = await createProject("fwd4a");
      const project2 = await createProject("fwd4b");
      const estimateId = await createEstimate("FWD4");
      const emailId = await createEmail("fwd4");

      // Manually set project on email first
      await db.run("UPDATE emails SET project_id = $1 WHERE id = $2", [
        project1,
        emailId,
      ]);

      // Now link via estimate to a different project
      await linkEstimateEmail(estimateId, emailId);
      await linkProjectEstimate(project2, estimateId);

      // Email should keep its original project (forward only fills NULLs)
      expect(await getProjectId("emails", emailId)).toBe(project1);
    });
  });

  describe("forward cascade: estimate_emails INSERT", () => {
    test("sets project on email when estimate already has a project", async () => {
      const projectId = await createProject("ee1");
      const estimateId = await createEstimate("EE1");
      const emailId = await createEmail("ee1");

      // Link project → estimate first
      await linkProjectEstimate(projectId, estimateId);

      // Then link estimate → email (should immediately set project)
      await linkEstimateEmail(estimateId, emailId);
      expect(await getProjectId("emails", emailId)).toBe(projectId);
    });
  });

  describe("forward cascade: document INSERT inherits email project", () => {
    test("new document inherits project_id from its email", async () => {
      const projectId = await createProject("doc1");
      const emailId = await createEmail("doc1");

      // Set project on email
      await db.run("UPDATE emails SET project_id = $1 WHERE id = $2", [
        projectId,
        emailId,
      ]);

      // Insert document linked to that email
      const docId = await createDocument(emailId);
      expect(await getProjectId("documents", docId)).toBe(projectId);
    });
  });

  describe("backward cascade: project_estimates DELETE", () => {
    test("clears project_id from email and document when unlinked", async () => {
      const projectId = await createProject("back1");
      const estimateId = await createEstimate("BACK1");
      const emailId = await createEmail("back1");
      const docId = await createDocument(emailId);

      await linkEstimateEmail(estimateId, emailId);
      await linkProjectEstimate(projectId, estimateId);

      // Confirm linked
      expect(await getProjectId("emails", emailId)).toBe(projectId);
      expect(await getProjectId("documents", docId)).toBe(projectId);

      // Unlink
      await db.run(
        "DELETE FROM project_estimates WHERE project_id = $1 AND estimate_id = $2",
        [projectId, estimateId]
      );
      // Remove from cleanup list since we already deleted
      ids.projectEstimates = ids.projectEstimates.filter(
        (pe) => !(pe.projectId === projectId && pe.estimateId === estimateId)
      );

      // Both should be NULL (no remaining path)
      expect(await getProjectId("emails", emailId)).toBeNull();
      expect(await getProjectId("documents", docId)).toBeNull();
    });

    test("keeps project_id if conversation sibling path still exists", async () => {
      const projectId = await createProject("back2");
      const convId = `_tc_conv_${RUN}_back2`;

      // Email A: has project via conversation (set on a sibling)
      const emailA = await createEmail("back2a", convId);
      const emailB = await createEmail("back2b", convId);

      // Set project on email B directly → triggers conversation propagation to A
      await db.run("UPDATE emails SET project_id = $1 WHERE id = $2", [
        projectId,
        emailB,
      ]);
      expect(await getProjectId("emails", emailA)).toBe(projectId);

      // Also link email A via estimate path (redundant path)
      const estimateId = await createEstimate("BACK2");
      await linkEstimateEmail(estimateId, emailA);
      await linkProjectEstimate(projectId, estimateId);

      // Unlink the estimate path
      await db.run(
        "DELETE FROM project_estimates WHERE project_id = $1 AND estimate_id = $2",
        [projectId, estimateId]
      );
      ids.projectEstimates = ids.projectEstimates.filter(
        (pe) => !(pe.projectId === projectId && pe.estimateId === estimateId)
      );

      // Email A still has project (conversation sibling B still provides the path)
      expect(await getProjectId("emails", emailA)).toBe(projectId);
    });
  });

  describe("backward cascade: estimate_emails DELETE", () => {
    test("recomputes email project_id when estimate unlinked", async () => {
      const projectId = await createProject("eeback1");
      const estimateId = await createEstimate("EEBACK1");
      const emailId = await createEmail("eeback1");

      await linkProjectEstimate(projectId, estimateId);
      const eeId = await linkEstimateEmail(estimateId, emailId);

      expect(await getProjectId("emails", emailId)).toBe(projectId);

      // Unlink estimate from email
      await db.run("DELETE FROM estimate_emails WHERE id = $1", [eeId]);
      ids.estimateEmails = ids.estimateEmails.filter((id) => id !== eeId);

      // No remaining path → NULL
      expect(await getProjectId("emails", emailId)).toBeNull();
    });
  });
});
