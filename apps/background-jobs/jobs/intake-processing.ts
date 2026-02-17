/**
 * Intake processing — document auto-linking to projects/emails,
 * contract packet backfill, and SharePoint upload.
 */

import type {
  ContractsEmailIntakePayload,
  processFilesIntake,
} from "@background-jobs/lib/intake/files-intake";
import { isSubjectCompatibleWithProject } from "@email/project-subject-guard";
import { db } from "@lib/db/hub";
import {
  createSharePointClientFromEnv,
  uploadLocalFileToProjectSubfolder,
} from "@sharepoint/intake-upload";
import { CONTRACT_PACKET_AUTOLINK_BATCH_SIZE } from "./config";

// -- Lazy SharePoint client --

let _sharePointClient:
  | ReturnType<typeof createSharePointClientFromEnv>
  | undefined;
function getSharePointClient(): ReturnType<
  typeof createSharePointClientFromEnv
> {
  if (_sharePointClient === undefined) {
    _sharePointClient = createSharePointClientFromEnv();
  }
  return _sharePointClient;
}

// -- Prepared statements --

const findEmailBySubjectAndSender = db.query<{
  id: number;
  project_id: number | null;
  conversation_id: string | null;
}>(
  `SELECT id, project_id, conversation_id FROM emails
   WHERE normalized_subject ILIKE '%' || $1 || '%'
     AND from_email = $2
   ORDER BY received_at DESC LIMIT 1`
);

const findEmailBySubject = db.query<{
  id: number;
  project_id: number | null;
  conversation_id: string | null;
}>(
  `SELECT id, project_id, conversation_id FROM emails
   WHERE normalized_subject ILIKE '%' || $1 || '%'
   ORDER BY received_at DESC LIMIT 1`
);

const findProjectByConversation = db.query<{ project_id: number }>(
  `SELECT project_id FROM emails
   WHERE conversation_id = $1 AND project_id IS NOT NULL
   LIMIT 1`
);

const updateDocumentLink = db.prepare(
  `UPDATE documents SET
     email_id = COALESCE($2, email_id),
     project_id = COALESCE($3, project_id),
     original_from = $4,
     original_subject = $5,
     forwarder_email = $6
   WHERE id = $1`
);

const getDocumentUploadMeta = db.query<{
  project_id: number | null;
  file_path: string | null;
  file_name: string | null;
  document_type: string | null;
}>(
  "SELECT project_id, file_path, file_name, document_type FROM documents WHERE id = ?"
);

const linkContractPacketDocuments = db.query<{ inserted: number }, [number]>(
  `WITH candidate_docs AS (
     SELECT
       cp.id AS packet_id,
       d.id AS document_id,
       CASE
         WHEN lower(coalesce(d.document_type, '')) IN ('contract', 'subcontract', 'agreement') THEN 'primary_contract'
         WHEN lower(coalesce(d.document_type, '')) IN ('po', 'purchase_order', 'work_order') THEN 'po'
         WHEN lower(coalesce(d.document_type, '')) = 'insurance' THEN 'insurance'
         WHEN lower(coalesce(d.document_type, '')) IN ('schedule of values', 'sov') THEN 'sov'
         WHEN lower(coalesce(d.document_type, '')) IN ('plan_set', 'plans', 'drainage_plan') THEN 'plan_set'
         ELSE 'supporting'
       END AS document_role,
       CASE
         WHEN lower(coalesce(d.document_type, '')) IN ('contract', 'subcontract', 'agreement', 'po', 'purchase_order', 'work_order') THEN TRUE
         ELSE FALSE
       END AS is_required
     FROM contract_packets cp
     JOIN documents d
       ON d.project_id = cp.project_id
     LEFT JOIN emails de
       ON de.id = d.email_id
     LEFT JOIN attachments a
       ON a.id = d.attachment_id
     LEFT JOIN emails ae
       ON ae.id = a.email_id
     WHERE cp.is_active = TRUE
       AND cp.status <> 'archived'
       AND (
         coalesce(de.classification, '') = 'CONTRACT'
         OR coalesce(ae.classification, '') = 'CONTRACT'
         OR lower(coalesce(d.document_type, '')) IN (
           'contract', 'subcontract', 'agreement', 'work_order', 'po',
           'purchase_order', 'insurance', 'schedule of values', 'sov',
           'plan_set', 'plans', 'drainage_plan', 'loi'
         )
       )
       AND NOT EXISTS (
         SELECT 1
         FROM contract_packet_documents cpd
         WHERE cpd.packet_id = cp.id
           AND cpd.document_id = d.id
       )
     ORDER BY d.created_at DESC
     LIMIT $1
   ),
   inserted_rows AS (
     INSERT INTO contract_packet_documents (packet_id, document_id, document_role, is_required)
     SELECT packet_id, document_id, document_role, is_required
     FROM candidate_docs
     ON CONFLICT (packet_id, document_id) DO NOTHING
     RETURNING 1
   )
   SELECT count(*)::int AS inserted
   FROM inserted_rows`
);

const updateContractPacketTypes = db.prepare(
  `UPDATE contract_packets cp
   SET packet_type = CASE
       WHEN stats.doc_count <= 1 THEN 'single_pdf'
       WHEN stats.primary_contract_count >= 1 THEN 'mixed'
       ELSE 'multi_doc_packet'
     END,
     updated_at = now()
   FROM (
     SELECT
       cp.id AS packet_id,
       count(*)::int AS doc_count,
       count(*) FILTER (WHERE cpd.document_role = 'primary_contract')::int AS primary_contract_count
     FROM contract_packets cp
     JOIN contract_packet_documents cpd
       ON cpd.packet_id = cp.id
     WHERE cp.is_active = TRUE
       AND cp.status <> 'archived'
     GROUP BY cp.id
   ) stats
   WHERE cp.id = stats.packet_id
     AND cp.packet_type = 'unknown'`
);

const promoteRequestedPacketsToReceived = db.prepare(
  `UPDATE contract_packets cp
   SET status = 'received',
     received_at = COALESCE(cp.received_at, evidence.first_received_at, now()),
     source_email_id = COALESCE(cp.source_email_id, evidence.latest_email_id),
     next_action = CASE
       WHEN cp.next_action IS NULL OR btrim(cp.next_action) = '' OR cp.next_action = 'Request contract packet from counterparty'
         THEN 'Review packet and classify required docs'
       ELSE cp.next_action
     END,
     updated_at = now()
   FROM (
     SELECT
       cp.id AS packet_id,
       min(e.received_at) FILTER (WHERE e.received_at IS NOT NULL) AS first_received_at,
       (array_agg(e.id ORDER BY e.received_at DESC NULLS LAST, e.id DESC))[1] AS latest_email_id
     FROM contract_packets cp
     JOIN contract_packet_documents cpd
       ON cpd.packet_id = cp.id
     JOIN documents d
       ON d.id = cpd.document_id
     LEFT JOIN emails e
       ON e.id = COALESCE(d.email_id, (
         SELECT a.email_id FROM attachments a WHERE a.id = d.attachment_id
       ))
     WHERE cp.is_active = TRUE
       AND cp.status = 'requested'
     GROUP BY cp.id
   ) evidence
   WHERE cp.id = evidence.packet_id
     AND cp.status = 'requested'`
);

// -- Functions --

function docTypeToSharePointSubfolder(documentType: string | null): string {
  const t = (documentType ?? "").toLowerCase();
  if (t.includes("noi")) {
    return "NOI";
  }
  if (t.includes("plan")) {
    return "Plans";
  }
  if (t.includes("estimate")) {
    return "Estimates";
  }
  return "Contracts";
}

interface EmailMatch {
  id: number;
  project_id: number | null;
  conversation_id: string | null;
}

async function resolveProjectFromConversation(
  match: EmailMatch
): Promise<number | null> {
  if (match.project_id) {
    return match.project_id;
  }
  if (!match.conversation_id) {
    return null;
  }
  const convMatch = await findProjectByConversation.get(match.conversation_id);
  return convMatch?.project_id ?? null;
}

async function findMatchingEmail(
  normalized: string,
  originalFrom: string
): Promise<{ emailId: number; projectId: number | null } | null> {
  // Strategy 1: subject + sender match
  if (originalFrom) {
    const match = await findEmailBySubjectAndSender.get(
      normalized,
      originalFrom
    );
    if (match) {
      const projectId = await resolveProjectFromConversation(match);
      return { emailId: match.id, projectId };
    }
  }

  // Strategy 2: subject match only
  const match = await findEmailBySubject.get(normalized);
  if (match) {
    const projectId = await resolveProjectFromConversation(match);
    return { emailId: match.id, projectId };
  }

  return null;
}

export async function autoLinkDocument(
  documentId: number,
  originalSubject: string,
  originalFrom: string,
  forwarderEmail: string
): Promise<void> {
  const normalized = originalSubject
    .replace(/^(?:fw|fwd|re|forwarded):\s*/gi, "")
    .trim();

  if (!normalized) {
    await updateDocumentLink.run(
      documentId,
      null,
      null,
      originalFrom || null,
      originalSubject || null,
      forwarderEmail || null
    );
    return;
  }

  const found = await findMatchingEmail(normalized, originalFrom);
  const emailId = found?.emailId ?? null;
  let projectId = found?.projectId ?? null;

  if (projectId) {
    const subjectCompatible = await isSubjectCompatibleWithProject({
      projectId,
      subject: normalized,
      additionalHints: [originalSubject],
    });
    if (!subjectCompatible) {
      console.warn(
        `[doc-link] Subject guard skipped project #${projectId} for document #${documentId}`
      );
      projectId = null;
    }
  }

  await updateDocumentLink.run(
    documentId,
    emailId,
    projectId,
    originalFrom || null,
    originalSubject || null,
    forwarderEmail || null
  );

  if (projectId) {
    console.log(
      `[doc-link] Document #${documentId} → project #${projectId} (via email #${emailId})`
    );
  } else if (emailId) {
    console.log(
      `[doc-link] Document #${documentId} → email #${emailId} (no project yet)`
    );
  } else {
    console.log(
      `[doc-link] Document #${documentId}: no matching email found for "${normalized}"`
    );
  }
}

export async function backfillContractPacketDocuments(): Promise<{
  linked: number;
}> {
  const linked =
    (await linkContractPacketDocuments.get(CONTRACT_PACKET_AUTOLINK_BATCH_SIZE))
      ?.inserted ?? 0;
  await updateContractPacketTypes.run();
  await promoteRequestedPacketsToReceived.run();
  return { linked };
}

type FilesIntakeResult = Awaited<ReturnType<typeof processFilesIntake>>[number];

async function trySharePointUpload(documentId: number): Promise<void> {
  const sp = getSharePointClient();
  if (!sp) {
    return;
  }

  const row = await getDocumentUploadMeta.get(documentId);
  if (!(row?.project_id && row.file_path && row.file_name)) {
    return;
  }

  const subfolder = docTypeToSharePointSubfolder(row.document_type ?? null);

  const uploaded = await uploadLocalFileToProjectSubfolder(sp, {
    projectId: row.project_id,
    subfolder,
    localPath: row.file_path,
    originalFileName: row.file_name,
    stableSuffix: String(documentId),
  });

  if (uploaded) {
    console.log(
      `[doc-sharepoint] Document #${documentId} uploaded to ${uploaded.folderUrl}`
    );
  }
}

async function postProcessResult(
  r: FilesIntakeResult,
  filesPayload: ContractsEmailIntakePayload
): Promise<boolean> {
  if (!(r.documentId && filesPayload.originalSubject)) {
    return false;
  }

  try {
    await autoLinkDocument(
      r.documentId,
      filesPayload.originalSubject,
      filesPayload.originalFrom,
      filesPayload.forwarderEmail
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[doc-link] Failed for document #${r.documentId}: ${msg}`);
    return false;
  }

  try {
    await trySharePointUpload(r.documentId);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(
      `[doc-sharepoint] Upload failed for document #${r.documentId}: ${msg}`
    );
  }

  return true;
}

export function startIntakePostProcessing(
  results: FilesIntakeResult[],
  filesPayload: ContractsEmailIntakePayload
): void {
  (async () => {
    let linkedCount = 0;
    for (const r of results) {
      const linked = await postProcessResult(r, filesPayload);
      if (linked) {
        linkedCount++;
      }
    }

    if (linkedCount > 0) {
      console.log(
        `[doc-link] Intake post-processing linked ${linkedCount} document(s)`
      );
    }
  })().catch((error) => {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[worker] Intake post-processing crashed: ${msg}`);
  });
}
