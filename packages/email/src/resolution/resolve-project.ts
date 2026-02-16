import { db } from "@lib/db/hub";
import {
  findProjectCandidates,
  linkEmailToProject,
} from "@lib/db/repositories/project";
import {
  type ProjectMatchReviewSource,
  upsertProjectMatchReview,
} from "@lib/db/repositories/project-match-review";
import type { ProjectResolutionResult } from "@email/resolution/types";
import { isSubjectCompatibleWithProject } from "@lib/project-subject-guard";

interface EmailProjectRow {
  id: number;
  project_id: number | null;
  conversation_id: string | null;
  subject: string | null;
  project_name: string | null;
  contractor_name: string | null;
}

export interface ResolveEmailToProjectOptions {
  persistReview?: boolean;
  reviewSource?: ProjectMatchReviewSource;
}

const getEmailProjectRow = db.query<EmailProjectRow, [number]>(
  `SELECT
     id,
     project_id,
     conversation_id,
     subject,
     project_name,
     contractor_name
   FROM emails
   WHERE id = ?`
);

const findConversationProjectAnchor = db.query<
  { project_id: number },
  [string, number]
>(
  `SELECT project_id
   FROM emails
   WHERE conversation_id = ?
     AND project_id IS NOT NULL
     AND id != ?
   ORDER BY received_at DESC NULLS LAST, id DESC
   LIMIT 1`
);

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  const out = new Set<string>();
  for (const value of values) {
    const trimmed = (value ?? "").trim();
    if (trimmed) {
      out.add(trimmed);
    }
  }
  return [...out];
}

function stripSubjectPrefixes(subject: string): string {
  return subject.replace(/^(?:fw|fwd|re|forwarded):\s*/gi, "").trim();
}

async function persistAmbiguousProjectReview(
  opts: ResolveEmailToProjectOptions,
  emailId: number,
  result: Awaited<ReturnType<typeof findProjectCandidates>>
): Promise<void> {
  if (!(opts.persistReview && result && result.candidates.length > 0)) {
    return;
  }

  try {
    await upsertProjectMatchReview({
      source: opts.reviewSource ?? "email_resolver",
      sourceKey: `email:${emailId}`,
      result,
      note: `email_resolver ambiguous project match for email_id=${emailId}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[email-resolver] failed to persist project review for email #${emailId}: ${message}`
    );
  }
}

export async function resolveEmailToProject(
  emailId: number,
  options: ResolveEmailToProjectOptions = {}
): Promise<ProjectResolutionResult> {
  const opts: ResolveEmailToProjectOptions = {
    persistReview: options.persistReview ?? true,
    reviewSource: options.reviewSource ?? "email_resolver",
  };

  const row = await getEmailProjectRow.get(emailId);
  if (!row) {
    return {
      status: "email_not_found",
      emailId,
      projectId: null,
      detail: "email_missing",
    };
  }

  if (row.project_id !== null) {
    return {
      status: "already_linked",
      emailId,
      projectId: row.project_id,
      detail: "project_already_linked",
    };
  }

  if (row.conversation_id) {
    const anchor = await findConversationProjectAnchor.get(
      row.conversation_id,
      emailId
    );
    if (anchor?.project_id) {
      await linkEmailToProject(emailId, anchor.project_id);
      return {
        status: "linked_conversation_anchor",
        emailId,
        projectId: anchor.project_id,
        detail: "conversation_anchor",
      };
    }
  }

  const subject = (row.subject ?? "").trim();
  const strippedSubject = stripSubjectPrefixes(subject);
  const primaryText = uniqueNonEmpty([
    row.project_name,
    strippedSubject,
    subject,
  ])[0];
  if (!primaryText) {
    return {
      status: "no_signal",
      emailId,
      projectId: null,
      detail: "missing_project_text_signal",
    };
  }

  const aliasHints = uniqueNonEmpty([
    row.project_name,
    strippedSubject,
    subject,
  ]);
  const match = await findProjectCandidates({
    primaryText,
    aliasHints,
    contractorHint: row.contractor_name,
    limit: 8,
  });

  if (!match || match.candidates.length === 0) {
    return {
      status: "no_signal",
      emailId,
      projectId: null,
      detail: "no_project_candidates",
      matchResult: match,
    };
  }

  const best = match.decision.best;
  if (best && match.decision.autoLink) {
    const subjectCompatible = await isSubjectCompatibleWithProject({
      projectId: best.projectId,
      subject: subject || primaryText,
      additionalHints: aliasHints,
    });

    if (!subjectCompatible) {
      await persistAmbiguousProjectReview(opts, emailId, match);
      return {
        status: "subject_guard_rejected",
        emailId,
        projectId: null,
        detail: "subject_guard_rejected_auto_link_candidate",
        matchResult: match,
      };
    }

    await linkEmailToProject(emailId, best.projectId);
    return {
      status: "linked_deterministic",
      emailId,
      projectId: best.projectId,
      detail: `matched_project score=${best.score} confidence=${best.confidence}`,
      matchResult: match,
    };
  }

  await persistAmbiguousProjectReview(opts, emailId, match);
  return {
    status: "ambiguous",
    emailId,
    projectId: null,
    detail: `manual_review_required gap=${match.decision.gap}`,
    matchResult: match,
  };
}
