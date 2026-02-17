/**
 * Project Contact Resolver — Orchestrator & Apply
 *
 * Main entry points for resolving and applying project contacts.
 * Delegates to split modules for types, data fetching, and matching.
 */
import { createHash } from "node:crypto";
import { GEMINI_FAST_MODEL } from "@background-jobs/jobs/config";
import { db } from "@lib/db/hub";
import {
  fetchAttachments,
  fetchCoverage,
  fetchDocuments,
  fetchEmails,
  fetchLinkedEstimateContactIds,
  fetchProject,
  fetchProjectEstimates,
  runLlmExtraction,
} from "./project-contact-data";
import {
  buildContactMatchMaps,
  classifyCandidate,
  collectDeterministicCandidates,
  fetchContactsByEmails,
  fetchContactsByNames,
  mergeLlmRecords,
  sortCandidates,
} from "./project-contact-matching";
import type {
  ApplyProjectContactResolutionResult,
  ProjectContactCandidate,
  ProjectContactResolutionResult,
  ProjectEstimateRow,
  ResolveProjectContactsOptions,
} from "./project-contact-types";
import {
  clampConfidence,
  DEFAULT_CREATE_THRESHOLD,
  finalizeCandidate,
  normalizeEmailAddress,
  normalizeName,
  normalizePhone,
  titleCaseFromLocalPart,
} from "./project-contact-types";

// ============================================================================
// Helpers
// ============================================================================

function deriveNameFromEmail(email: string | null, fallback: string): string {
  if (!email) {
    return fallback;
  }
  const atIndex = email.indexOf("@");
  if (atIndex <= 0) {
    return fallback;
  }
  const localPart = email.slice(0, atIndex);
  const title = titleCaseFromLocalPart(localPart);
  return title || fallback;
}

function buildLocalMondayItemId(
  projectId: number,
  candidate: ProjectContactCandidate
): string {
  const seed = `${projectId}|${candidate.email ?? ""}|${candidate.name ?? ""}|${candidate.phone ?? ""}`;
  const digest = createHash("sha1").update(seed).digest("hex").slice(0, 16);
  return `local:${projectId}:${digest}`;
}

function selectTargetEstimateId(rows: ProjectEstimateRow[]): number | null {
  const canonical = rows.find((row) => row.is_canonical);
  if (canonical) {
    return canonical.estimate_id;
  }
  const first = rows[0];
  return first ? first.estimate_id : null;
}

// ============================================================================
// Resolve
// ============================================================================

export async function resolveProjectContacts(
  projectId: number,
  options: ResolveProjectContactsOptions = {}
): Promise<ProjectContactResolutionResult> {
  const project = await fetchProject(projectId);
  if (!project) {
    throw new Error(`Project ${projectId} not found`);
  }

  const limitEmails = Math.max(1, options.limitEmails ?? 250);
  const limitDocuments = Math.max(1, options.limitDocuments ?? 140);
  const limitAttachments = Math.max(1, options.limitAttachments ?? 180);
  const createThreshold = clampConfidence(
    options.createThreshold ?? DEFAULT_CREATE_THRESHOLD
  );
  const requireLlm = options.requireLlm ?? true;

  if (requireLlm && options.skipLlm) {
    throw new Error(
      "project-contact-resolver requires LLM extraction; skipLlm is disabled"
    );
  }

  const [
    projectEstimates,
    coverage,
    linkedEstimateContactIds,
    emails,
    documents,
    attachments,
  ] = await Promise.all([
    fetchProjectEstimates(projectId),
    fetchCoverage(projectId),
    fetchLinkedEstimateContactIds(projectId),
    fetchEmails(projectId, limitEmails),
    fetchDocuments(projectId, limitDocuments),
    fetchAttachments(projectId, limitAttachments),
  ]);

  const candidateMap = collectDeterministicCandidates(
    emails,
    documents,
    attachments
  );
  const deterministicCandidates = sortCandidates(
    [...candidateMap.values()].map(finalizeCandidate)
  );

  const llm = await runLlmExtraction(
    project,
    deterministicCandidates,
    emails,
    documents,
    attachments,
    options
  );

  if (requireLlm && llm.error) {
    throw new Error(
      `project-contact-resolver LLM extraction failed: ${llm.error}`
    );
  }

  mergeLlmRecords(candidateMap, llm.records);

  const candidates = sortCandidates(
    [...candidateMap.values()].map(finalizeCandidate)
  );

  const candidateEmails = [
    ...new Set(
      candidates
        .map((row) => normalizeEmailAddress(row.email))
        .filter((value): value is string => Boolean(value))
    ),
  ];
  const candidateNames = [
    ...new Set(
      candidates
        .map((row) => normalizeName(row.name)?.toLowerCase())
        .filter((value): value is string => Boolean(value))
    ),
  ];

  const [contactsByEmail, contactsByName] = await Promise.all([
    fetchContactsByEmails(candidateEmails),
    fetchContactsByNames(candidateNames, project.account_id),
  ]);

  const contactMaps = buildContactMatchMaps(
    [...contactsByEmail, ...contactsByName],
    project.account_id
  );

  const targetEstimateId = selectTargetEstimateId(projectEstimates);
  const proposals = candidates.map((candidate) =>
    classifyCandidate(candidate, {
      contactMaps,
      createThreshold,
      linkedEstimateContactIds,
      requireLlm,
      targetEstimateId,
    })
  );

  return {
    candidates,
    existingCoverage: {
      estimateContacts: coverage.estimate_contact_count,
      emailContacts: coverage.email_contact_count,
    },
    llm: {
      attempted: !options.skipLlm,
      succeeded: !options.skipLlm && llm.error === null,
      error: llm.error,
      contactsReturned: llm.records.length,
      model: options.model ?? GEMINI_FAST_MODEL,
    },
    project: {
      id: project.id,
      name: project.name,
      lifecycleState: project.lifecycle_state,
      accountId: project.account_id,
    },
    proposals,
    targetEstimateId,
  };
}

// ============================================================================
// Apply — DB mutations for resolved proposals
// ============================================================================

async function upsertLocalContact(
  project: ProjectContactResolutionResult["project"],
  candidate: ProjectContactCandidate
): Promise<{ id: number; created: boolean }> {
  const mondayItemId = buildLocalMondayItemId(project.id, candidate);
  const existing = (await db
    .query<{ id: number }, [string]>(
      `SELECT id
       FROM contacts
       WHERE monday_item_id = ?`
    )
    .get(mondayItemId)) as { id: number } | null;

  const fallbackName = "Project Contact";
  const name =
    normalizeName(candidate.name) ??
    deriveNameFromEmail(candidate.email, fallbackName) ??
    fallbackName;

  const rows = (await db
    .query<
      { id: number },
      [
        string,
        string,
        string | null,
        string | null,
        string | null,
        number | null,
        string | null,
      ]
    >(
      `INSERT INTO contacts (
         monday_item_id,
         name,
         email,
         phone,
         title,
         account_id,
         imported_account_name,
         synced_at,
         updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, now(), now())
       ON CONFLICT (monday_item_id) DO UPDATE SET
         name = EXCLUDED.name,
         email = COALESCE(EXCLUDED.email, contacts.email),
         phone = COALESCE(EXCLUDED.phone, contacts.phone),
         title = COALESCE(EXCLUDED.title, contacts.title),
         account_id = COALESCE(contacts.account_id, EXCLUDED.account_id),
         imported_account_name = COALESCE(EXCLUDED.imported_account_name, contacts.imported_account_name),
         synced_at = now(),
         updated_at = now()
       RETURNING id`
    )
    .all(
      mondayItemId,
      name,
      normalizeEmailAddress(candidate.email),
      normalizePhone(candidate.phone),
      normalizeName(candidate.title),
      project.accountId,
      normalizeName(candidate.company)
    )) as { id: number }[];

  const id = rows[0]?.id;
  if (!id) {
    throw new Error("Failed to upsert local contact");
  }

  return { created: !existing, id };
}

async function attachAccountIfMissing(
  contactId: number,
  accountId: number | null
): Promise<boolean> {
  if (typeof accountId !== "number") {
    return false;
  }

  const rows = (await db
    .query<{ id: number }, [number, number]>(
      `UPDATE contacts
       SET account_id = ?,
           updated_at = now()
       WHERE id = ?
         AND account_id IS NULL
       RETURNING id`
    )
    .all(accountId, contactId)) as { id: number }[];

  return rows.length > 0;
}

async function insertEstimateContactLink(
  estimateId: number | null,
  contactId: number
): Promise<boolean> {
  if (typeof estimateId !== "number") {
    return false;
  }

  const rows = (await db
    .query<{ estimate_id: number }, [number, number, string]>(
      `INSERT INTO estimate_contacts (estimate_id, contact_id, source)
       VALUES (?, ?, ?)
       ON CONFLICT (estimate_id, contact_id) DO NOTHING
       RETURNING estimate_id`
    )
    .all(estimateId, contactId, "project_contact_resolver")) as {
    estimate_id: number;
  }[];

  return rows.length > 0;
}

async function insertContactEmailLink(
  contactId: number,
  emailId: number
): Promise<boolean> {
  const rows = (await db
    .query<{ id: number }, [number, number, string]>(
      `INSERT INTO contact_emails (contact_id, email_id, relationship)
       VALUES (?, ?, ?)
       ON CONFLICT (contact_id, email_id, relationship) DO NOTHING
       RETURNING id`
    )
    .all(contactId, emailId, "project_contact_resolver")) as { id: number }[];

  return rows.length > 0;
}

async function attachProjectAccountToEstimates(
  projectId: number,
  accountId: number | null
): Promise<number> {
  if (typeof accountId !== "number") {
    return 0;
  }

  const rows = (await db
    .query<{ id: number }, [number, number]>(
      `UPDATE estimates e
       SET account_id = ?
       FROM project_estimates pe
       WHERE pe.project_id = ?
         AND pe.estimate_id = e.id
         AND e.account_id IS NULL
       RETURNING e.id`
    )
    .all(accountId, projectId)) as { id: number }[];

  return rows.length;
}

async function applyOneProposal(
  proposal: ProjectContactResolutionResult["proposals"][number],
  result: ProjectContactResolutionResult,
  summary: ApplyProjectContactResolutionResult
): Promise<void> {
  if (proposal.action === "skip_low_confidence") {
    return;
  }

  const hasLinkTarget =
    typeof result.targetEstimateId === "number" ||
    proposal.candidate.evidenceEmailIds.length > 0;
  if (!hasLinkTarget) {
    return;
  }

  let { contactId } = proposal;

  if (proposal.action === "create_contact") {
    const upsert = await upsertLocalContact(result.project, proposal.candidate);
    contactId = upsert.id;
    if (upsert.created) {
      summary.contactsCreated += 1;
    }
  }

  if (typeof contactId !== "number") {
    return;
  }

  const linked = await insertEstimateContactLink(
    result.targetEstimateId,
    contactId
  );
  if (linked) {
    summary.estimateLinksInserted += 1;
  }

  const accountAttached = await attachAccountIfMissing(
    contactId,
    result.project.accountId
  );
  if (accountAttached) {
    summary.contactsAccountAttached += 1;
  }

  for (const emailId of proposal.candidate.evidenceEmailIds) {
    const inserted = await insertContactEmailLink(contactId, emailId);
    if (inserted) {
      summary.emailLinksInserted += 1;
    }
  }
}

export async function applyProjectContactResolution(
  result: ProjectContactResolutionResult
): Promise<ApplyProjectContactResolutionResult> {
  const summary: ApplyProjectContactResolutionResult = {
    contactsAccountAttached: 0,
    contactsCreated: 0,
    emailLinksInserted: 0,
    estimateLinksInserted: 0,
    estimatesAccountAttached: 0,
  };

  for (const proposal of result.proposals) {
    await applyOneProposal(proposal, result, summary);
  }

  summary.estimatesAccountAttached = await attachProjectAccountToEstimates(
    result.project.id,
    result.project.accountId
  );

  return summary;
}
