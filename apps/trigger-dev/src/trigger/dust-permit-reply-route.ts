import { db } from "@lib/db/client";
import { parseBoolInt, parseJsonArray } from "@lib/db/parsers";
import { normalizeProjectNameKey } from "@projects/db/project-matching-utils";
import { getEmailById } from "@email/db/email";
import { logger, schemaTask, tasks } from "@trigger.dev/sdk";
import { z } from "zod";

import {
  buildPermitReplySearchTerms,
  selectPermitReplyRoute,
  type PermitReplyRouteCandidate,
} from "./dust-permit-reply-route-values";

const ROUTABLE_NOTIFICATION_TYPES = [
  "issued",
  "renewed",
  "submitted",
  "revised",
] as const;
const FROM_MAILBOX = "chi@desertservices.net";
const MAX_CANDIDATES = 100;
const MARICOPA_APPLICATION_RE =
  /dust control permit application\s*(D\d{7})/i;
const FACILITY_NAME_RE = /Facility Name:\s*([^\r\n]+)/i;

function parseEmailArray(value: unknown): string[] {
  return parseJsonArray(value)
    .map((entry) => String(entry).trim())
    .filter((entry) => entry.length > 0);
}

function coerceString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getEmailText(email: {
  bodyFull?: string | null;
  bodyPreview?: string | null;
  subject?: string | null;
}): string {
  return [email.subject, email.bodyFull, email.bodyPreview]
    .filter((value): value is string => Boolean(value))
    .join("\n");
}

function extractApplicationNumber(text: string): string | null {
  return text.match(MARICOPA_APPLICATION_RE)?.[1] ?? null;
}

function extractFacilityName(text: string): string | null {
  return text.match(FACILITY_NAME_RE)?.[1]?.trim() ?? null;
}

async function resolvePermit(input: {
  permitId?: string;
  projectQuery?: string;
  sourceEmailId?: number;
}): Promise<{
  companyName: string | null;
  id: string;
  projectId: number | null;
  projectName: string | null;
} | null> {
  if (input.sourceEmailId) {
    const sourceEmail = await getEmailById(input.sourceEmailId);
    if (!sourceEmail) {
      throw new Error(`Source email ${input.sourceEmailId} not found`);
    }

    const sourceText = getEmailText(sourceEmail);
    const extractedPermitId = input.permitId ?? extractApplicationNumber(sourceText);
    const extractedProjectName =
      input.projectQuery ?? extractFacilityName(sourceText);

    let permit: {
      company_name: string | null;
      id: string;
      project_id: number | null;
      project_name: string | null;
    } | null = null;

    if (extractedPermitId) {
      permit = await db
        .query<{
          company_name: string | null;
          id: string;
          project_id: number | null;
          project_name: string | null;
        }, [string]>(
          `SELECT id, project_id, project_name, company_name
           FROM dust_permits_filed_by_desert_services
           WHERE id = $1
           LIMIT 1`
        )
        .get(extractedPermitId);
    }

    if (!(permit || extractedPermitId || extractedProjectName)) {
      return null;
    }

    const projectName =
      permit?.project_name ?? coerceString(extractedProjectName) ?? null;
    const projectId =
      permit?.project_id ??
      (projectName ? await resolveProjectIdFromProjectName(projectName) : null);

    return {
      companyName: permit?.company_name ?? null,
      id: permit?.id ?? extractedPermitId ?? `source-email-${input.sourceEmailId}`,
      projectId,
      projectName,
    };
  }

  if (input.permitId) {
    const permit = await db
      .query<{
        company_name: string | null;
        id: string;
        project_id: number | null;
        project_name: string | null;
      }, [string]>(
        `SELECT id, project_id, project_name, company_name
         FROM dust_permits_filed_by_desert_services
         WHERE id = $1
         LIMIT 1`
      )
      .get(input.permitId);

    const resolvedProjectId =
      permit?.project_id ??
      (permit?.project_name
        ? await resolveProjectIdFromProjectName(permit.project_name)
        : null);

    return permit
      ? {
          companyName: permit.company_name,
          id: permit.id,
          projectId: resolvedProjectId,
          projectName: permit.project_name,
        }
      : null;
  }

  if (!input.projectQuery) {
    return null;
  }

  const permit = await db
    .query<{
      company_name: string | null;
      id: string;
      project_id: number | null;
      project_name: string | null;
    }, [string]>(
      `SELECT id, project_id, project_name, company_name
       FROM dust_permits_filed_by_desert_services
       WHERE COALESCE(project_name, '') ILIKE $1
       ORDER BY COALESCE(effective_date, submitted_date, expiration_date) DESC NULLS LAST,
                id DESC
       LIMIT 1`
    )
    .get(`%${input.projectQuery.trim()}%`);

  const resolvedProjectId =
    permit?.project_id ??
    (permit?.project_name
      ? await resolveProjectIdFromProjectName(permit.project_name)
      : null);

  return permit
    ? {
        companyName: permit.company_name,
        id: permit.id,
        projectId: resolvedProjectId,
        projectName: permit.project_name,
      }
    : null;
}

async function resolveProjectIdFromProjectName(
  projectName: string
): Promise<number | null> {
  const normalizedName = normalizeProjectNameKey(projectName);

  const exactMatch = await db
    .query<{ id: number }, [string]>(
      `SELECT id
       FROM projects
       WHERE normalized_name = $1
       ORDER BY updated_at DESC NULLS LAST, id DESC
       LIMIT 1`
    )
    .get(normalizedName);

  if (exactMatch?.id) {
    return exactMatch.id;
  }

  const fuzzyMatch = await db
    .query<{ id: number }, [string]>(
      `SELECT id
       FROM projects
       WHERE COALESCE(name, '') ILIKE $1
       ORDER BY updated_at DESC NULLS LAST, id DESC
       LIMIT 1`
    )
    .get(`%${projectName.trim()}%`);

  return fuzzyMatch?.id ?? null;
}

async function queryReplyRouteCandidates(params: {
  limit: number;
  projectId?: number | null;
  searchTerms?: string[];
}): Promise<
  Array<{
    body_text: string | null;
    cc_emails: string | null;
    chi_email_id: number | null;
    email_id: number;
    from_email: string | null;
    has_chi_copy: boolean | number;
    is_forwarded: boolean | number;
    is_internal: boolean | number;
    mailbox_email: string;
    received_at: string;
    subject: string | null;
    to_emails: string | null;
  }>
> {
  const clauses: string[] = [
    "COALESCE(e.is_excluded, 0) = 0",
    "e.received_at >= now() - interval '365 days'",
  ];
  const paramsList: unknown[] = [];

  if (typeof params.projectId === "number") {
    paramsList.push(params.projectId);
    clauses.push(`e.project_id = $${paramsList.length}`);
  } else if (params.searchTerms?.length) {
    const searchClauses = params.searchTerms.map((term) => {
      paramsList.push(`%${term}%`);
      const idx = paramsList.length;
      return `(
        COALESCE(e.subject, '') ILIKE $${idx}
        OR COALESCE(e.body_preview, '') ILIKE $${idx}
        OR COALESCE(e.body_full, '') ILIKE $${idx}
      )`;
    });
    clauses.push(`(${searchClauses.join(" OR ")})`);
  } else {
    return [];
  }

  paramsList.push(FROM_MAILBOX);
  const chiIdx = paramsList.length;
  paramsList.push(params.limit);
  const limitIdx = paramsList.length;

  return await db
    .query<{
      body_text: string | null;
      cc_emails: string | null;
      chi_email_id: number | null;
      email_id: number;
      from_email: string | null;
      has_chi_copy: boolean | number;
      is_forwarded: boolean | number;
      is_internal: boolean | number;
      mailbox_email: string;
      received_at: string;
      subject: string | null;
      to_emails: string | null;
    }>(
      `WITH matched AS (
         SELECT
           e.id,
           e.subject,
           e.from_email,
           e.to_emails,
           e.cc_emails,
           e.is_internal,
           e.is_forwarded,
           e.received_at,
           m.email AS mailbox_email,
           COALESCE(NULLIF(e.internet_message_id, ''), NULLIF(e.message_id, ''), 'id:' || e.id::text) AS message_key,
           COALESCE(NULLIF(e.body_full, ''), NULLIF(e.body_preview, ''), '') AS body_text
         FROM emails e
         JOIN mailboxes m ON m.id = e.mailbox_id
         WHERE ${clauses.join(" AND ")}
       ),
       ranked AS (
         SELECT
           matched.*,
           MAX(
             CASE WHEN lower(matched.mailbox_email) = lower($${chiIdx}) THEN matched.id END
           ) OVER (PARTITION BY matched.message_key) AS chi_email_id,
           CASE
             WHEN MAX(
               CASE WHEN lower(matched.mailbox_email) = lower($${chiIdx}) THEN matched.id END
             ) OVER (PARTITION BY matched.message_key) IS NOT NULL THEN true
             ELSE false
           END AS has_chi_copy,
           ROW_NUMBER() OVER (
             PARTITION BY matched.message_key
             ORDER BY
               CASE WHEN lower(matched.mailbox_email) = lower($${chiIdx}) THEN 0 ELSE 1 END,
               matched.received_at DESC,
               matched.id DESC
           ) AS rn
         FROM matched
       )
       SELECT
         id AS email_id,
         chi_email_id,
         mailbox_email,
         subject,
         from_email,
         to_emails,
         cc_emails,
         is_internal,
         is_forwarded,
         received_at::text,
         body_text,
         has_chi_copy
       FROM ranked
       WHERE rn = 1
       ORDER BY received_at DESC, email_id DESC
       LIMIT $${limitIdx}`
    )
    .all(...paramsList);
}

async function findReplyRouteCandidates(
  params: {
    projectId?: number | null;
    searchTerms: string[];
  }
): Promise<PermitReplyRouteCandidate[]> {
  if (params.searchTerms.length === 0 && typeof params.projectId !== "number") {
    return [];
  }

  const rows =
    (typeof params.projectId === "number"
      ? await queryReplyRouteCandidates({
          limit: MAX_CANDIDATES,
          projectId: params.projectId,
        })
      : []) ??
    [];

  const fallbackRows =
    rows.length > 0
      ? rows
      : await queryReplyRouteCandidates({
          limit: MAX_CANDIDATES,
          searchTerms: params.searchTerms,
        });

  return fallbackRows.map((row) => ({
    bodyText: row.body_text,
    ccEmails: parseEmailArray(row.cc_emails),
    chiEmailId: row.chi_email_id,
    emailId: row.email_id,
    fromEmail: row.from_email,
    hasChiCopy: parseBoolInt(row.has_chi_copy),
    isForwarded: parseBoolInt(row.is_forwarded),
    isInternal: parseBoolInt(row.is_internal),
    mailboxEmail: row.mailbox_email,
    receivedAt: row.received_at,
    subject: row.subject,
    toEmails: parseEmailArray(row.to_emails),
  }));
}

const INPUT_SCHEMA = z
  .object({
    cc: z.array(z.email()).optional(),
    draft: z.boolean().default(true),
    dryRun: z.boolean().default(true),
    permitId: z
      .string()
      .regex(/^D\d{7}$/, "Must be D0XXXXXX format")
      .optional(),
    projectQuery: z.string().trim().min(1).optional(),
    recipients: z.array(z.email()).optional(),
    sourceEmailId: z.number().int().positive().optional(),
    type: z.enum(ROUTABLE_NOTIFICATION_TYPES),
  })
  .refine(
    (value) => Boolean(value.permitId || value.projectQuery || value.sourceEmailId),
    {
      message: "Provide permitId, projectQuery, or sourceEmailId",
    }
  );

function isPermitId(value: string | null | undefined): value is string {
  return /^D\d{7}$/.test(value ?? "");
}

const OUTPUT_ROUTE_REASON_FALLBACK = "no candidates found";

export const dustPermitReplyRoute = schemaTask({
  id: "dust-permit-reply-route",
  schema: INPUT_SCHEMA,
  maxDuration: 120,
  retry: { maxAttempts: 2 },
  run: runDustPermitReplyRoute,
});

export async function runDustPermitReplyRoute(
  input: z.infer<typeof INPUT_SCHEMA>
): Promise<{
  dryRun: boolean;
  permit: {
    companyName: string | null;
    id: string;
    projectId: number | null;
    projectName: string | null;
  };
  route: {
    matchedRecipients: string[];
    mode: "compose-new" | "reply-all";
    reason: string;
    replyToEmailId: number | null;
    selectedCandidateEmailId: number | null;
  };
  searchTerms: string[];
  topCandidates: Array<{
    chiEmailId: number | null;
    emailId: number;
    fromEmail: string | null;
    hasChiCopy: boolean;
    mailboxEmail: string;
    reasons: string[];
    receivedAt: string;
    score: number;
    subject: string | null;
  }>;
  triggered: Array<{
    draft?: boolean;
    runId?: string;
    task: string;
  }>;
}> {
  const permit = await resolvePermit({
    permitId: input.permitId,
    projectQuery: input.projectQuery,
    sourceEmailId: input.sourceEmailId,
  });

  if (!permit) {
    throw new Error("Could not resolve permit for reply routing");
  }

  const searchTerms = buildPermitReplySearchTerms({
    companyName: permit.companyName,
    permitId: isPermitId(permit.id) ? permit.id : null,
    projectName: permit.projectName,
  });
  const candidates = await findReplyRouteCandidates({
    projectId: permit.projectId,
    searchTerms,
  });
  const route = selectPermitReplyRoute(candidates, {
    permitId: permit.id,
    projectName: permit.projectName,
  });

  const downstreamRecipients =
    route.mode === "compose-new"
      ? (input.recipients?.length ? input.recipients : route.matchedRecipients)
      : input.recipients;

  const canTrigger =
    !input.dryRun &&
    (isPermitId(permit.id) || Boolean(input.sourceEmailId)) &&
    (route.mode === "reply-all" ||
      Boolean(downstreamRecipients && downstreamRecipients.length > 0));

  const triggered: Array<{
    draft?: boolean;
    runId?: string;
    task: string;
  }> = [];

  if (canTrigger) {
    const payload: Record<string, unknown> = {
      cc: input.cc,
      draft: input.draft,
      type: input.type,
    };

    if (isPermitId(permit.id)) {
      payload.permitId = permit.id;
    }

    if (input.sourceEmailId) {
      payload.sourceEmailId = input.sourceEmailId;
    }

    if (route.mode === "reply-all" && route.replyToEmailId) {
      payload.replyToEmailId = route.replyToEmailId;
    } else if (downstreamRecipients?.length) {
      payload.recipients = downstreamRecipients;
    }

    const handle = await tasks.trigger("dust-permit-notification", payload);
    triggered.push({
      draft: input.draft,
      runId: handle.id,
      task: "dust-permit-notification",
    });
  }

  logger.info("dust permit reply routed", {
    candidateCount: candidates.length,
    dryRun: input.dryRun,
    mode: route.mode,
    permitId: permit.id,
    replyToEmailId: route.replyToEmailId,
    triggered: triggered.length,
  });

  return {
    dryRun: input.dryRun,
    permit: {
      companyName: permit.companyName,
      id: permit.id,
      projectId: permit.projectId,
      projectName: permit.projectName,
    },
    route: {
      matchedRecipients: route.matchedRecipients,
      mode: route.mode,
      reason: route.reason || OUTPUT_ROUTE_REASON_FALLBACK,
      replyToEmailId: route.replyToEmailId,
      selectedCandidateEmailId: route.selectedCandidateEmailId,
    },
    searchTerms,
    topCandidates: route.rankedCandidates.slice(0, 5).map((candidate) => ({
      chiEmailId: candidate.chiEmailId,
      emailId: candidate.emailId,
      fromEmail: candidate.fromEmail,
      hasChiCopy: candidate.hasChiCopy,
      mailboxEmail: candidate.mailboxEmail,
      reasons: candidate.reasons,
      receivedAt: candidate.receivedAt,
      score: candidate.score,
      subject: candidate.subject,
    })),
    triggered,
  };
}
