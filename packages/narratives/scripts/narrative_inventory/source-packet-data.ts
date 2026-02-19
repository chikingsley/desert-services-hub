/**
 * Database queries and download logic for source-packet building.
 *
 * Split from build-source-packets.ts for maintainability.
 */

import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { getAppClient } from "@email-cli/commands/config";
import { db } from "@lib/db/client";
import { escapeODataStringLiteral, sanitizeFilename } from "./shared";
import type { CandidateType, EmailRow } from "./source-packet-scoring";

const EVA = "eva@desertservices.net";
const WORD_FILE_PATTERN = /\.(docx?|docm)$/i;

// ============================================================================
// Database queries
// ============================================================================

export async function getNarrativeEmail(
  emailId: number
): Promise<EmailRow | null> {
  return await db
    .query<EmailRow>(
      `
      select
        e.id,
        e.message_id,
        m.email as mailbox_email,
        e.received_at::text,
        e.internet_message_id,
        coalesce(e.from_email, '') as from_email,
        coalesce(e.subject, '') as subject,
        coalesce(e.attachment_names, '[]') as attachment_names
      from emails e
      join mailboxes m on m.id = e.mailbox_id
      where e.id = $1
      limit 1
      `
    )
    .get(emailId);
}

function buildTokenSql(terms: string[]): { sql: string; params: string[] } {
  const filtered = terms.filter((t) => t.trim() !== "");
  if (filtered.length === 0) {
    return { params: [], sql: "true" };
  }

  const parts: string[] = [];
  const params: string[] = [];
  for (const term of filtered) {
    const like = `%${term}%`;
    parts.push(
      "(e.subject ilike ? or e.attachment_names ilike ? or coalesce(e.body_preview,'') ilike ?)"
    );
    params.push(like, like, like);
  }
  return { params, sql: parts.join(" or ") };
}

async function queryNoiCandidatesWithPermit(params: {
  since: Date;
  until: Date;
  permitLike: string;
}): Promise<EmailRow[]> {
  return await db
    .query<EmailRow>(
      `
      select
        e.id,
        e.message_id,
        m.email as mailbox_email,
        e.received_at::text,
        e.internet_message_id,
        coalesce(e.from_email, '') as from_email,
        coalesce(e.subject, '') as subject,
        coalesce(e.attachment_names, '[]') as attachment_names
      from emails e
      join mailboxes m on m.id = e.mailbox_id
      where e.has_attachments = 1
        and e.attachment_names ilike '%.pdf%'
        and e.received_at between $1 and $2
        and (
          e.subject ilike $3 or
          e.attachment_names ilike $4 or
          coalesce(e.body_preview, '') ilike $5
        )
        and (
          e.subject ~* '(noi|azpdes|mydeq|cgp)' or
          e.attachment_names ~* '(noi|summary_cor|cgp)'
        )
      order by e.received_at desc
      limit 200
      `
    )
    .all(
      params.since.toISOString(),
      params.until.toISOString(),
      params.permitLike,
      params.permitLike,
      params.permitLike
    );
}

async function queryGeneralCandidates(params: {
  since: Date;
  until: Date;
  type: CandidateType;
  permit: string;
  permitLike: string;
  projectTokens: string[];
}): Promise<EmailRow[]> {
  const tokens = params.projectTokens.slice(0, 3);
  const tokenSql = buildTokenSql(tokens);
  const baseParams: unknown[] = [
    params.since.toISOString(),
    params.until.toISOString(),
  ];
  const keywordSql =
    params.type === "plan"
      ? "(e.subject ~* '(swppp|swmp|storm\\s*water|erosion|drainage|civil)' or e.attachment_names ~* '(swppp|swmp|storm|erosion|drainage|civil|plan)')"
      : "(e.attachment_names ilike '%Est_%' or e.subject ilike '%estimate%' or e.subject ilike '%proposal%')";

  let permitFilterSql = "false";
  const extraParams: unknown[] = [];
  if (params.permit) {
    permitFilterSql =
      "(e.subject ilike ? or e.attachment_names ilike ? or coalesce(e.body_preview, '') ilike ?)";
    extraParams.push(params.permitLike, params.permitLike, params.permitLike);
  }

  const query = `
    select
      e.id,
      e.message_id,
      m.email as mailbox_email,
      e.received_at::text,
      e.internet_message_id,
      coalesce(e.from_email, '') as from_email,
      coalesce(e.subject, '') as subject,
      coalesce(e.attachment_names, '[]') as attachment_names
    from emails e
    join mailboxes m on m.id = e.mailbox_id
    where e.has_attachments = 1
      and e.attachment_names ilike '%.pdf%'
      and e.received_at between ? and ?
      and ${keywordSql}
      and (${permitFilterSql} or (${tokenSql.sql}))
    order by e.received_at desc
    limit 250
  `;

  return await db
    .query<EmailRow>(query)
    .all(...baseParams, ...extraParams, ...tokenSql.params);
}

export async function queryCandidates(params: {
  narrativeReceivedAt: Date;
  permitNumber: string;
  projectTokens: string[];
  type: CandidateType;
}): Promise<EmailRow[]> {
  const since = new Date(params.narrativeReceivedAt);
  since.setMonth(since.getMonth() - 8);
  const until = new Date(params.narrativeReceivedAt);
  until.setMonth(until.getMonth() + 2);

  const permit = params.permitNumber.trim();
  const permitLike = `%${permit}%`;

  if (params.type === "noi" && permit) {
    return await queryNoiCandidatesWithPermit({ permitLike, since, until });
  }

  return await queryGeneralCandidates({
    permit,
    permitLike,
    projectTokens: params.projectTokens,
    since,
    type: params.type,
    until,
  });
}

// ============================================================================
// Attachment download
// ============================================================================

async function findAlternateMessageIds(
  email: EmailRow
): Promise<{ messageId: string; mailboxEmail: string }[]> {
  const alternates: { messageId: string; mailboxEmail: string }[] = [];

  if (email.internet_message_id) {
    const dbAlts = await db
      .query<{ message_id: string; mailbox_email: string }>(
        `
        select e.message_id, m.email as mailbox_email
        from emails e
        join mailboxes m on m.id = e.mailbox_id
        where e.internet_message_id = $1
          and e.id <> $2
        order by
          case when lower(m.email) = lower($3) then 0 else 1 end,
          e.received_at desc
        limit 12
        `
      )
      .all(email.internet_message_id, email.id, email.mailbox_email);
    for (const alt of dbAlts) {
      alternates.push({
        mailboxEmail: alt.mailbox_email,
        messageId: alt.message_id,
      });
    }

    for (const mailboxEmail of [email.mailbox_email, EVA]) {
      try {
        const client = getAppClient();
        const matches = await client.filterEmails({
          filter: `internetMessageId eq '${escapeODataStringLiteral(email.internet_message_id)}'`,
          limit: 5,
          userId: mailboxEmail,
        });
        for (const match of matches) {
          if (match.id) {
            alternates.push({ mailboxEmail, messageId: match.id });
          }
        }
      } catch {
        // Best-effort lookup.
      }
    }
  }

  try {
    const attachmentLike = `%${email.attachment_names}%`;
    const byName = await db
      .query<{ message_id: string; mailbox_email: string }>(
        `
        select e.message_id, m.email as mailbox_email
        from emails e
        join mailboxes m on m.id = e.mailbox_id
        where e.attachment_names ilike $1
          and e.id <> $2
        order by
          case when lower(m.email) = lower($3) then 0 else 1 end,
          e.received_at desc
        limit 20
        `
      )
      .all(attachmentLike, email.id, email.mailbox_email);
    for (const alt of byName) {
      alternates.push({
        mailboxEmail: alt.mailbox_email,
        messageId: alt.message_id,
      });
    }
  } catch {
    // Best-effort only.
  }

  return alternates;
}

export async function downloadSelectedAttachment(params: {
  email: EmailRow;
  attachmentName: string;
  outDir: string;
}): Promise<string | null> {
  const client = getAppClient();
  const attempts: { messageId: string; mailboxEmail: string }[] = [
    {
      mailboxEmail: params.email.mailbox_email,
      messageId: params.email.message_id,
    },
    ...(await findAlternateMessageIds(params.email)),
  ];

  const dedupedAttempts: { messageId: string; mailboxEmail: string }[] = [];
  const seen = new Set<string>();
  for (const attempt of attempts) {
    const key = `${attempt.mailboxEmail.toLowerCase()}|${attempt.messageId}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    dedupedAttempts.push(attempt);
  }

  for (const attempt of dedupedAttempts) {
    try {
      const attachments = await client.getAttachments(
        attempt.messageId,
        attempt.mailboxEmail
      );
      const wanted = attachments.find(
        (a) => a.name.toLowerCase() === params.attachmentName.toLowerCase()
      );
      if (!wanted) {
        continue;
      }

      const bytes = await client.downloadAttachment(
        attempt.messageId,
        wanted.id,
        attempt.mailboxEmail
      );

      const outName = sanitizeFilename(wanted.name);
      const outPath = join(params.outDir, outName);
      await Bun.write(outPath, bytes);
      return outPath;
    } catch {
      // Continue trying remaining attempts.
    }
  }

  return null;
}

// ============================================================================
// Narrative file discovery
// ============================================================================

const BY_EMAIL_DIR = "packages/narratives/data/intake/eva-to-jayson/by-email";

export function findNarrativeFile(
  emailId: number,
  canonicalFileName: string
): string | null {
  const dir = join(BY_EMAIL_DIR, String(emailId));
  if (!existsSync(dir)) {
    return null;
  }
  const names = readdirSync(dir).filter((n) => WORD_FILE_PATTERN.test(n));
  if (names.length === 0) {
    return null;
  }
  const exact = names.find(
    (n) => n.toLowerCase() === canonicalFileName.toLowerCase()
  );
  if (exact) {
    return join(dir, exact);
  }
  const first = names[0];
  if (!first) {
    return null;
  }
  return join(dir, first);
}

// ============================================================================
// Packet JSON writer
// ============================================================================

export async function maybeDownloadPair(params: {
  pair: {
    row: {
      emailId: number;
      fileName: string;
      docId: string;
      permitNumber: string;
      projectName: string;
    };
    narrativeEmail: EmailRow;
    noi: {
      email: EmailRow;
      selectedAttachment: string | null;
      score: number;
      reason: string;
    } | null;
    plan: {
      email: EmailRow;
      selectedAttachment: string | null;
      score: number;
      reason: string;
    } | null;
    estimate: {
      email: EmailRow;
      selectedAttachment: string | null;
      score: number;
      reason: string;
    } | null;
  };
  packetId: string;
  outDir: string;
}): Promise<void> {
  const outDir = join(params.outDir, params.packetId);
  if (!existsSync(outDir)) {
    const { mkdirSync } = await import("node:fs");
    mkdirSync(outDir, { recursive: true });
  }

  const { pair } = params;
  const packet: Record<string, unknown> = {
    canonical_file_name: pair.row.fileName,
    doc_id: pair.row.docId,
    narrative_doc_file: pair.row.fileName,
    narrative_doc_path: findNarrativeFile(pair.row.emailId, pair.row.fileName),
    narrative_email_id: pair.row.emailId,
    packet_id: params.packetId,
    permit_number: pair.row.permitNumber,
    project_name: pair.row.projectName,
    selected: {},
  };

  for (const [key, candidate] of [
    ["noi", pair.noi],
    ["plan", pair.plan],
    ["estimate", pair.estimate],
  ] as const) {
    if (!candidate?.selectedAttachment) {
      continue;
    }
    const path = await downloadSelectedAttachment({
      attachmentName: candidate.selectedAttachment,
      email: candidate.email,
      outDir,
    });
    packet.selected = {
      ...(packet.selected as Record<string, unknown>),
      [key]: {
        attachment_name: candidate.selectedAttachment,
        downloaded_path: path,
        email_id: candidate.email.id,
        mailbox: candidate.email.mailbox_email,
        message_id: candidate.email.message_id,
        reason: candidate.reason,
        score: candidate.score,
      },
    };
  }

  writeFileSync(
    join(outDir, "packet.json"),
    `${JSON.stringify(packet, null, 2)}\n`,
    "utf8"
  );
}
