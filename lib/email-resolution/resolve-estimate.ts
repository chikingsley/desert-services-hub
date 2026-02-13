import { db } from "@lib/db/hub";
import {
  findEstimateCandidatesForEmail,
  linkEmailToEstimate,
} from "@lib/db/repositories/estimate-email";
import type { EstimateResolutionResult } from "@lib/email-resolution/types";

interface EmailEstimateRow {
  id: number;
  project_id: number | null;
  subject: string | null;
  project_name: string | null;
  contractor_name: string | null;
}

interface ProjectHintRow {
  name: string | null;
  outlook_folder: string | null;
  contractor: string | null;
  address: string | null;
}

export interface ResolveEmailToEstimateOptions {
  limit?: number;
}

const getEmailEstimateRow = db.query<EmailEstimateRow, [number]>(
  `SELECT
     id,
     project_id,
     subject,
     project_name,
     contractor_name
   FROM emails
   WHERE id = ?`
);

const hasEstimateLinkForEmail = db.query<{ has_link: boolean }, [number]>(
  `SELECT EXISTS (
     SELECT 1
     FROM estimate_emails
     WHERE email_id = ?
   ) AS has_link`
);

const getProjectEstimateIds = db.query<{ estimate_id: number }, [number]>(
  `SELECT estimate_id
   FROM project_estimates
   WHERE project_id = ?`
);

const getCanonicalProjectEstimateIds = db.query<{ estimate_id: number }, [number]>(
  `SELECT estimate_id
   FROM project_estimates
   WHERE project_id = ?
     AND is_canonical = TRUE`
);

const getProjectHintsRow = db.query<ProjectHintRow, [number]>(
  `SELECT name, outlook_folder, contractor, address
   FROM projects
   WHERE id = ?`
);

const getProjectAliases = db.query<{ alias: string }, [number]>(
  `SELECT alias
   FROM project_aliases
   WHERE project_id = ?
   ORDER BY created_at DESC, id DESC
   LIMIT 20`
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

export async function resolveEmailToEstimate(
  emailId: number,
  options: ResolveEmailToEstimateOptions = {}
): Promise<EstimateResolutionResult> {
  const limit = Math.max(2, Math.min(12, options.limit ?? 6));

  const email = await getEmailEstimateRow.get(emailId);
  if (!email) {
    return {
      status: "email_not_found",
      emailId,
      estimateId: null,
      detail: "email_missing",
    };
  }

  const existing = await hasEstimateLinkForEmail.get(emailId);
  if (existing?.has_link) {
    return {
      status: "already_linked",
      emailId,
      estimateId: null,
      detail: "estimate_already_linked",
    };
  }

  let restrictEstimateIds: number[] = [];
  let projectHints: string[] = uniqueNonEmpty([
    email.project_name,
    email.subject,
  ]);
  let contractorHints: string[] = uniqueNonEmpty([email.contractor_name]);
  let addressHints: string[] = [];

  if (email.project_id !== null) {
    const projectEstimateRows = await getProjectEstimateIds.all(
      email.project_id
    );
    restrictEstimateIds = [
      ...new Set(projectEstimateRows.map((row) => row.estimate_id)),
    ];

    const project = await getProjectHintsRow.get(email.project_id);
    const aliases = await getProjectAliases.all(email.project_id);
    projectHints = uniqueNonEmpty([
      ...projectHints,
      project?.name,
      project?.outlook_folder,
      ...aliases.map((row) => row.alias),
    ]);
    contractorHints = uniqueNonEmpty([...contractorHints, project?.contractor]);
    addressHints = uniqueNonEmpty([project?.address]);

    if (restrictEstimateIds.length === 1) {
      const onlyEstimateId = restrictEstimateIds[0];
      const linked = await linkEmailToEstimate(
        onlyEstimateId,
        emailId,
        "script",
        `email_resolver project_single project_id=${email.project_id}`
      );
      if (linked) {
        return {
          status: "linked_project_single",
          emailId,
          estimateId: onlyEstimateId,
          detail: "project_single",
        };
      }
    }

    if (restrictEstimateIds.length > 1) {
      const canonicalRows = await getCanonicalProjectEstimateIds.all(
        email.project_id
      );
      const canonicalEstimateIds = [
        ...new Set(canonicalRows.map((row) => row.estimate_id)),
      ];

      if (canonicalEstimateIds.length === 1) {
        const canonicalEstimateId = canonicalEstimateIds[0];
        const linked = await linkEmailToEstimate(
          canonicalEstimateId,
          emailId,
          "script",
          `email_resolver project_canonical project_id=${email.project_id} canonical_estimate_id=${canonicalEstimateId}`
        );
        if (linked) {
          return {
            status: "linked_project_canonical",
            emailId,
            estimateId: canonicalEstimateId,
            detail: "project_canonical",
          };
        }
      }
    }
  }

  const match = await findEstimateCandidatesForEmail(emailId, {
    projectHints,
    contractorHints,
    addressHints,
    restrictEstimateIds:
      restrictEstimateIds.length > 1 ? restrictEstimateIds : [],
    limit,
  });

  if (!match || match.candidates.length === 0) {
    return {
      status: "no_signal",
      emailId,
      estimateId: null,
      detail: "no_estimate_candidates",
    };
  }

  const best = match.decision.best;
  if (best && match.decision.autoLink) {
    const linked = await linkEmailToEstimate(
      best.estimateId,
      emailId,
      "script",
      `email_resolver deterministic score=${best.score} confidence=${best.confidence}`
    );
    if (linked) {
      return {
        status: "linked_deterministic",
        emailId,
        estimateId: best.estimateId,
        detail: `deterministic score=${best.score} confidence=${best.confidence}`,
      };
    }
  }

  return {
    status: "ambiguous",
    emailId,
    estimateId: null,
    detail: `manual_review_required gap=${match.decision.gap}`,
    ambiguous: {
      candidates: match.candidates,
      decision: match.decision,
      matchResult: match,
    },
  };
}
