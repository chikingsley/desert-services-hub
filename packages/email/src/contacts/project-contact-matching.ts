/**
 * Project Contact Resolver — Matching, Collection & Classification
 *
 * Contact lookup by email/name, match map building, deterministic candidate
 * collection from emails/documents/attachments, candidate sorting,
 * LLM record merging, and candidate classification into proposals.
 */
import { db } from "@lib/db/hub";
import type {
  AttachmentRow,
  CandidateAccumulator,
  ContactMatch,
  ContactRow,
  DocumentRow,
  EmailRow,
  LlmContactRecord,
  ProjectContactCandidate,
  ProjectContactProposal,
} from "./types";
import {
  addCandidateEvidence,
  candidateKeyOf,
  extractEmailAddresses,
  extractPhoneNumbers,
  isInternalEmail,
  normalizeEmailAddress,
  normalizeName,
  parseEmailAddressList,
} from "./types";

// ============================================================================
// Contact Lookup
// ============================================================================

export async function fetchContactsByEmails(
  emails: string[]
): Promise<ContactRow[]> {
  if (emails.length === 0) {
    return [];
  }

  const out: ContactRow[] = [];
  const batchSize = 200;

  for (let i = 0; i < emails.length; i += batchSize) {
    const batch = emails.slice(i, i + batchSize);
    const placeholders = batch.map(() => "?").join(", ");
    const rows = (await db
      .query<ContactRow>(
        `SELECT id, monday_item_id, name, email, phone, title, account_id
         FROM contacts
         WHERE lower(email) IN (${placeholders})`
      )
      .all(...batch)) as ContactRow[];
    out.push(...rows);
  }

  return out;
}

export async function fetchContactsByNames(
  names: string[],
  accountId: number | null
): Promise<ContactRow[]> {
  if (names.length === 0) {
    return [];
  }

  const out: ContactRow[] = [];
  const batchSize = 200;

  for (let i = 0; i < names.length; i += batchSize) {
    const batch = names.slice(i, i + batchSize);
    const placeholders = batch.map(() => "?").join(", ");

    if (typeof accountId === "number") {
      const rows = (await db
        .query<ContactRow>(
          `SELECT id, monday_item_id, name, email, phone, title, account_id
           FROM contacts
           WHERE account_id = ?
             AND lower(name) IN (${placeholders})`
        )
        .all(accountId, ...batch)) as ContactRow[];
      out.push(...rows);
      continue;
    }

    const rows = (await db
      .query<ContactRow>(
        `SELECT id, monday_item_id, name, email, phone, title, account_id
         FROM contacts
         WHERE lower(name) IN (${placeholders})`
      )
      .all(...batch)) as ContactRow[];
    out.push(...rows);
  }

  return out;
}

// ============================================================================
// Match Map Building
// ============================================================================

export function buildContactMatchMaps(
  rows: ContactRow[],
  accountId: number | null
): {
  byEmail: Map<string, ContactMatch>;
  byName: Map<string, ContactMatch>;
} {
  const byEmail = new Map<string, ContactMatch>();
  const byName = new Map<string, ContactMatch>();

  for (const row of rows) {
    const match: ContactMatch = {
      contactAccountId: row.account_id,
      contactEmail: normalizeEmailAddress(row.email),
      contactId: row.id,
      contactName: row.name,
    };

    if (match.contactEmail && !byEmail.has(match.contactEmail)) {
      byEmail.set(match.contactEmail, match);
    }

    const normalizedName = normalizeName(row.name)?.toLowerCase();
    if (!normalizedName) {
      continue;
    }

    const existing = byName.get(normalizedName);
    if (!existing) {
      byName.set(normalizedName, match);
      continue;
    }

    const currentAccountMatch =
      typeof accountId === "number" && existing.contactAccountId === accountId;
    const incomingAccountMatch =
      typeof accountId === "number" && row.account_id === accountId;

    if (!currentAccountMatch && incomingAccountMatch) {
      byName.set(normalizedName, match);
    }
  }

  return { byEmail, byName };
}

// ============================================================================
// Candidate Sorting
// ============================================================================

export function sortCandidates(
  candidates: ProjectContactCandidate[]
): ProjectContactCandidate[] {
  return [...candidates].toSorted((lhs, rhs) => {
    if (rhs.confidence !== lhs.confidence) {
      return rhs.confidence - lhs.confidence;
    }

    const lhsEvidence =
      lhs.evidenceEmailIds.length +
      lhs.evidenceDocumentIds.length +
      lhs.evidenceAttachmentIds.length;
    const rhsEvidence =
      rhs.evidenceEmailIds.length +
      rhs.evidenceDocumentIds.length +
      rhs.evidenceAttachmentIds.length;
    if (rhsEvidence !== lhsEvidence) {
      return rhsEvidence - lhsEvidence;
    }

    return (lhs.email ?? lhs.name ?? lhs.key).localeCompare(
      rhs.email ?? rhs.name ?? rhs.key
    );
  });
}

// ============================================================================
// LLM Record Merging
// ============================================================================

export function mergeLlmRecords(
  candidateMap: Map<string, CandidateAccumulator>,
  records: LlmContactRecord[]
): void {
  for (const record of records) {
    addCandidateEvidence(candidateMap, {
      company: record.company,
      confidence: Math.max(0.55, record.confidence),
      email: record.email,
      name: record.name,
      note: record.reason,
      phone: record.phone,
      source: "llm",
      title: record.title,
    });

    const key = candidateKeyOf(record.email, record.name, record.phone);
    if (!key) {
      continue;
    }

    const candidate = candidateMap.get(key);
    if (!candidate) {
      continue;
    }

    for (const emailId of record.evidenceEmailIds) {
      candidate.evidenceEmailIds.add(emailId);
    }
    for (const documentId of record.evidenceDocumentIds) {
      candidate.evidenceDocumentIds.add(documentId);
    }
    for (const attachmentId of record.evidenceAttachmentIds) {
      candidate.evidenceAttachmentIds.add(attachmentId);
    }
  }
}

// ============================================================================
// Candidate Classification
// ============================================================================

export function classifyCandidate(
  candidate: ProjectContactCandidate,
  ctx: {
    requireLlm: boolean;
    targetEstimateId: number | null;
    contactMaps: {
      byEmail: Map<string, ContactMatch>;
      byName: Map<string, ContactMatch>;
    };
    linkedEstimateContactIds: Set<number>;
    createThreshold: number;
  }
): ProjectContactProposal {
  const skipProposal = (reason: string): ProjectContactProposal => ({
    action: "skip_low_confidence",
    candidate,
    confidence: candidate.confidence,
    contactEmail: null,
    contactId: null,
    contactName: null,
    reason,
  });

  if (ctx.requireLlm && !candidate.sources.includes("llm")) {
    return skipProposal("no_llm_evidence");
  }

  const hasLinkTarget =
    typeof ctx.targetEstimateId === "number" ||
    candidate.evidenceEmailIds.length > 0;
  if (!hasLinkTarget) {
    return skipProposal("no_link_target");
  }

  const candidateEmail = normalizeEmailAddress(candidate.email);
  const candidateName = normalizeName(candidate.name)?.toLowerCase() ?? null;

  const emailMatch = candidateEmail
    ? ctx.contactMaps.byEmail.get(candidateEmail)
    : undefined;
  const nameMatch =
    !emailMatch && candidateName
      ? ctx.contactMaps.byName.get(candidateName)
      : undefined;
  const match = emailMatch ?? nameMatch;

  if (match) {
    if (ctx.linkedEstimateContactIds.has(match.contactId)) {
      return {
        action: "already_linked",
        candidate,
        confidence: candidate.confidence,
        contactEmail: match.contactEmail,
        contactId: match.contactId,
        contactName: match.contactName,
        reason: "already_linked_to_project_estimate",
      };
    }

    return {
      action: "link_existing_contact",
      candidate,
      confidence: candidate.confidence,
      contactEmail: match.contactEmail,
      contactId: match.contactId,
      contactName: match.contactName,
      reason: emailMatch ? "matched_by_email" : "matched_by_name",
    };
  }

  if (
    candidate.confidence >= ctx.createThreshold &&
    (candidate.email || candidate.name)
  ) {
    return {
      action: "create_contact",
      candidate,
      confidence: candidate.confidence,
      contactEmail: null,
      contactId: null,
      contactName: null,
      reason: "no_existing_contact_match",
    };
  }

  return skipProposal("insufficient_confidence_or_identity");
}

// ============================================================================
// Deterministic Candidate Collection
// ============================================================================

function pickExternalEmailCandidates(emailList: string[]): string[] {
  return emailList.filter((email) => !isInternalEmail(email));
}

export function collectFromEmails(
  map: Map<string, CandidateAccumulator>,
  emails: EmailRow[]
): void {
  for (const row of emails) {
    const fromEmail = normalizeEmailAddress(row.from_email);
    const fromName = normalizeName(row.from_name);

    if (fromEmail && !isInternalEmail(fromEmail)) {
      addCandidateEvidence(map, {
        confidence: 0.95,
        email: fromEmail,
        emailId: row.id,
        name: fromName,
        note: row.subject,
        source: "email_from",
      });

      const bodyText = (row.body_full ?? row.body_preview ?? "").slice(0, 3500);
      const signaturePhones = extractPhoneNumbers(bodyText);
      if (signaturePhones[0]) {
        addCandidateEvidence(map, {
          confidence: 0.82,
          email: fromEmail,
          emailId: row.id,
          name: fromName,
          note: "phone_from_signature",
          phone: signaturePhones[0],
          source: "email_signature",
        });
      }
    }

    const toEmails = pickExternalEmailCandidates(
      parseEmailAddressList(row.to_emails)
    );
    for (const email of toEmails) {
      addCandidateEvidence(map, {
        confidence: 0.74,
        email,
        emailId: row.id,
        source: "email_to",
      });
    }

    const ccEmails = pickExternalEmailCandidates(
      parseEmailAddressList(row.cc_emails)
    );
    for (const email of ccEmails) {
      addCandidateEvidence(map, {
        confidence: 0.7,
        email,
        emailId: row.id,
        source: "email_cc",
      });
    }

    const bodyText = (row.body_full ?? row.body_preview ?? "").slice(0, 3500);
    const textEmails = pickExternalEmailCandidates(
      extractEmailAddresses(bodyText)
    );
    for (const email of textEmails) {
      addCandidateEvidence(map, {
        confidence: 0.68,
        email,
        emailId: row.id,
        source: "email_body",
      });
    }
  }
}

export function collectFromDocuments(
  map: Map<string, CandidateAccumulator>,
  documents: DocumentRow[]
): void {
  for (const row of documents) {
    const sourceText = `${row.file_name ?? ""}\n${row.summary ?? ""}`;
    const foundEmails = pickExternalEmailCandidates(
      extractEmailAddresses(sourceText)
    );
    const foundPhones = extractPhoneNumbers(sourceText);

    if (foundEmails.length === 1 && foundPhones[0]) {
      addCandidateEvidence(map, {
        confidence: 0.72,
        documentId: row.id,
        email: foundEmails[0],
        phone: foundPhones[0],
        source: "document_text",
      });
      continue;
    }

    for (const email of foundEmails) {
      addCandidateEvidence(map, {
        confidence: 0.62,
        documentId: row.id,
        email,
        source: "document_text",
      });
    }
  }
}

export function collectFromAttachments(
  map: Map<string, CandidateAccumulator>,
  attachments: AttachmentRow[]
): void {
  for (const row of attachments) {
    const sourceText = `${row.name}\n${row.extracted_text ?? ""}`.slice(
      0,
      5000
    );
    const foundEmails = pickExternalEmailCandidates(
      extractEmailAddresses(sourceText)
    );
    const foundPhones = extractPhoneNumbers(sourceText);

    if (foundEmails.length === 1 && foundPhones[0]) {
      addCandidateEvidence(map, {
        attachmentId: row.id,
        confidence: 0.7,
        email: foundEmails[0],
        emailId: row.email_id,
        phone: foundPhones[0],
        source: "attachment_text",
      });
      continue;
    }

    for (const email of foundEmails) {
      addCandidateEvidence(map, {
        attachmentId: row.id,
        confidence: 0.6,
        email,
        emailId: row.email_id,
        source: "attachment_text",
      });
    }
  }
}

export function collectDeterministicCandidates(
  emails: EmailRow[],
  documents: DocumentRow[],
  attachments: AttachmentRow[]
): Map<string, CandidateAccumulator> {
  const map = new Map<string, CandidateAccumulator>();
  collectFromEmails(map, emails);
  collectFromDocuments(map, documents);
  collectFromAttachments(map, attachments);
  return map;
}
