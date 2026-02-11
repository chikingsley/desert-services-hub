/**
 * Build source packets (NOI + SWPPP plan + estimate candidates) for narratives.
 *
 * This script:
 * 1) Reads canonical narrative rows from CANONICAL_DOCS.tsv
 * 2) Finds candidate source emails in Postgres using permit + project heuristics
 * 3) Optionally downloads selected attachments via Graph app auth
 *
 * Usage:
 *   bun apps/narrative/scripts/narrative_inventory/build-source-packets.ts --limit 20
 *   bun apps/narrative/scripts/narrative_inventory/build-source-packets.ts --limit 20 --download
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { getAppClient } from "@email/commands/config";
import { db } from "@lib/db/hub";

interface CanonicalRow {
  docId: string;
  emailId: number;
  fileName: string;
  projectName: string;
  permitNumber: string;
  operatorCompany: string;
}

interface EmailRow {
  id: number;
  message_id: string;
  mailbox_email: string;
  received_at: string;
  internet_message_id: string | null;
  from_email: string;
  subject: string;
  attachment_names: string;
}

interface Candidate {
  email: EmailRow;
  score: number;
  reason: string;
  selectedAttachment: string | null;
}

interface Pair {
  row: CanonicalRow;
  narrativeEmail: EmailRow;
  noi: Candidate | null;
  plan: Candidate | null;
  estimate: Candidate | null;
}

interface AttachmentPick {
  name: string;
  score: number;
}

const DEFAULT_CANONICAL_DOCS =
  "apps/narrative/workflows/eva-jayson-variable-inventory/artifacts/CANONICAL_DOCS.tsv";
const DEFAULT_OUTPUT_DIR =
  "apps/narrative/data/intake/eva-to-jayson/source-packets";
const BY_EMAIL_DIR = "apps/narrative/data/intake/eva-to-jayson/by-email";
const EVA = "eva@desertservices.net";
const CGP_PERMIT_PATTERN = /(?:^|[^a-z0-9])cgp\d{2}(?:[^a-z0-9]|$)/;
const NOI_WORD_PATTERN = /\bnoi\b/;
const WORD_FILE_PATTERN = /\.(docx?|docm)$/i;

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "at",
  "of",
  "llc",
  "inc",
  "company",
  "construction",
  "build",
  "design",
  "phase",
  "project",
  "site",
  "park",
]);

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDate(value: string): Date | null {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

function escapeODataStringLiteral(value: string): string {
  return value.replaceAll("'", "''");
}

function hashString(value: string): string {
  return createHash("sha1").update(value).digest("hex").slice(0, 8);
}

function packetFolderName(row: CanonicalRow): string {
  const key = row.docId || `${row.emailId}:${row.fileName}`;
  return `${row.emailId}-${hashString(key)}`;
}

function isNoiLikeAttachmentName(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n.includes("noi") ||
    n.includes("summary_cor") ||
    n.includes("newpermit") ||
    CGP_PERMIT_PATTERN.test(n)
  );
}

function isPlanLikeAttachmentName(name: string): boolean {
  const n = name.toLowerCase();
  return (
    n.includes("swppp") ||
    n.includes("swmp") ||
    n.includes("storm") ||
    n.includes("drainage") ||
    n.includes("erosion") ||
    n.includes("civil") ||
    n.includes("esc plan")
  );
}

function tokeniseProject(projectName: string): string[] {
  const tokens = normalize(projectName)
    .split(" ")
    .filter((t) => t.length >= 4 && !STOP_WORDS.has(t));
  return [...new Set(tokens)].slice(0, 4);
}

function parseAttachmentNames(raw: string): string[] {
  if (!raw || raw.trim() === "") {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((v) => String(v));
  } catch {
    return [];
  }
}

function pickAttachment(
  names: string[],
  type: "noi" | "plan" | "estimate",
  permitNumber: string,
  excludeNames: Set<string> = new Set()
): AttachmentPick | null {
  const pdfs = names.filter(
    (n) =>
      n.toLowerCase().endsWith(".pdf") && !excludeNames.has(n.toLowerCase())
  );
  if (pdfs.length === 0) {
    return null;
  }

  const permit = permitNumber.trim().toLowerCase();
  const byScore = (name: string): number => {
    const n = name.toLowerCase();
    let score = 0;
    if (permit && n.includes(permit)) {
      score += 60;
    }
    if (type === "noi") {
      if (n.includes("noi")) {
        score += 80;
      }
      if (n.includes("summary_cor")) {
        score += 40;
      }
      if (n.includes("cgp")) {
        score += 20;
      }
      if (isPlanLikeAttachmentName(n) && !isNoiLikeAttachmentName(n)) {
        score -= 120;
      }
    }
    if (type === "plan") {
      if (n.includes("swppp")) {
        score += 80;
      }
      if (n.includes("swmp")) {
        score += 65;
      }
      if (n.includes("storm")) {
        score += 45;
      }
      if (n.includes("drainage")) {
        score += 30;
      }
      if (n.includes("civil")) {
        score += 30;
      }
      if (n.includes("plan")) {
        score += 20;
      }
      if (n.includes("esc")) {
        score += 25;
      }
      if (n.includes("site map")) {
        score += 20;
      }
      if (n.includes("est_")) {
        score -= 40;
      }
      if (n.includes("inv_")) {
        score -= 40;
      }
      if (isNoiLikeAttachmentName(n) && !isPlanLikeAttachmentName(n)) {
        score -= 180;
      }
      if (n.includes("receipt")) {
        score -= 220;
      }
      if (n.includes("dust")) {
        score -= 150;
      }
      if (n.includes("certificate")) {
        score -= 170;
      }
      if (n.includes("masterpermit")) {
        score -= 220;
      }
      if (n.includes("summary_cor")) {
        score -= 200;
      }
      if (!(isPlanLikeAttachmentName(n) || n.includes("esc"))) {
        score -= 90;
      }
    }
    if (type === "estimate") {
      if (n.includes("est_")) {
        score += 80;
      }
      if (n.includes("estimate")) {
        score += 40;
      }
      if (n.includes("inv_")) {
        score -= 30;
      }
      if (isNoiLikeAttachmentName(n) || isPlanLikeAttachmentName(n)) {
        score -= 60;
      }
    }
    return score;
  };

  const ranked = [...pdfs]
    .map((name) => ({ name, score: byScore(name) }))
    .sort((a, b) => b.score - a.score);

  return ranked[0] ?? null;
}

function scoreCandidate(
  email: EmailRow,
  opts: {
    type: "noi" | "plan" | "estimate";
    permitNumber: string;
    projectTokens: string[];
    narrativeReceivedAt: Date;
  }
): { score: number; reason: string } {
  const text = normalize(
    `${email.subject ?? ""} ${email.attachment_names ?? ""} ${email.from_email ?? ""}`
  );
  let score = 0;
  const reasons: string[] = [];

  if (opts.permitNumber && text.includes(opts.permitNumber.toLowerCase())) {
    score += 90;
    reasons.push("permit");
  }

  let tokenHits = 0;
  for (const token of opts.projectTokens) {
    if (text.includes(token)) {
      tokenHits += 1;
    }
  }
  if (tokenHits > 0) {
    score += tokenHits * 12;
    reasons.push(`tokens:${tokenHits}`);
  }

  if (opts.type === "noi") {
    if (NOI_WORD_PATTERN.test(text)) {
      score += 70;
      reasons.push("noi");
    }
    if (text.includes("summary_cor")) {
      score += 25;
      reasons.push("summary");
    }
    if (text.includes("mydeq") || text.includes("azpdes")) {
      score += 20;
      reasons.push("deq");
    }
  }

  if (opts.type === "plan") {
    if (text.includes("swppp")) {
      score += 70;
      reasons.push("swppp");
    }
    if (text.includes("swmp")) {
      score += 55;
      reasons.push("swmp");
    }
    if (text.includes("storm")) {
      score += 35;
      reasons.push("storm");
    }
    if (text.includes("plan")) {
      score += 20;
      reasons.push("plan");
    }
  }

  if (opts.type === "estimate") {
    if (text.includes("est_")) {
      score += 70;
      reasons.push("est_");
    }
    if (text.includes("estimate")) {
      score += 35;
      reasons.push("estimate");
    }
  }

  const received = parseDate(email.received_at);
  if (received) {
    const dayDistance = Math.abs(
      Math.round(
        (received.getTime() - opts.narrativeReceivedAt.getTime()) / 86_400_000
      )
    );
    score -= Math.min(50, Math.floor(dayDistance / 15));
  }

  return {
    score,
    reason: reasons.length ? reasons.join("+") : "weak",
  };
}

function parseCanonicalRows(tsvPath: string): CanonicalRow[] {
  const text = readFileSync(tsvPath, "utf8");
  const lines = text.split("\n").filter((l) => l.trim() !== "");
  if (lines.length < 2) {
    return [];
  }
  const header = lines[0]?.split("\t");
  const idx = (name: string): number => {
    const i = header.indexOf(name);
    if (i < 0) {
      throw new Error(`Missing canonical column: ${name}`);
    }
    return i;
  };

  const iDocId = idx("doc_id");
  const iEmailId = idx("email_id");
  const iFileName = idx("file_name");
  const iProject = idx("project.name");
  const iPermit = idx("permit.number_best_effort");
  const iOperator = idx("operator.company");

  const rows: CanonicalRow[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.split("\t");
    const emailId = Number.parseInt(cols[iEmailId] ?? "", 10);
    if (!Number.isFinite(emailId)) {
      continue;
    }
    rows.push({
      docId: cols[iDocId] ?? "",
      emailId,
      fileName: cols[iFileName] ?? "",
      projectName: cols[iProject] ?? "",
      permitNumber: cols[iPermit] ?? "",
      operatorCompany: cols[iOperator] ?? "",
    });
  }
  return rows;
}

async function getNarrativeEmail(emailId: number): Promise<EmailRow | null> {
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
      where e.id = ?
      limit 1
      `
    )
    .get(emailId);
}

function buildTokenSql(terms: string[]): { sql: string; params: string[] } {
  const filtered = terms.filter((t) => t.trim() !== "");
  if (filtered.length === 0) {
    return { sql: "true", params: [] };
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
  return { sql: parts.join(" or "), params };
}

async function queryCandidates(params: {
  narrativeReceivedAt: Date;
  permitNumber: string;
  projectTokens: string[];
  type: "noi" | "plan" | "estimate";
}): Promise<EmailRow[]> {
  const since = new Date(params.narrativeReceivedAt);
  since.setMonth(since.getMonth() - 8);
  const until = new Date(params.narrativeReceivedAt);
  until.setMonth(until.getMonth() + 2);

  const permit = params.permitNumber.trim();
  const permitLike = `%${permit}%`;

  if (params.type === "noi" && permit) {
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
          and e.received_at between ? and ?
          and (
            e.subject ilike ? or
            e.attachment_names ilike ? or
            coalesce(e.body_preview, '') ilike ?
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
        since.toISOString(),
        until.toISOString(),
        permitLike,
        permitLike,
        permitLike
      );
  }

  const tokens = params.projectTokens.slice(0, 3);
  const tokenSql = buildTokenSql(tokens);
  const baseParams: unknown[] = [since.toISOString(), until.toISOString()];
  const keywordSql =
    params.type === "plan"
      ? "(e.subject ~* '(swppp|swmp|storm\\s*water|erosion|drainage|civil)' or e.attachment_names ~* '(swppp|swmp|storm|erosion|drainage|civil|plan)')"
      : "(e.attachment_names ilike '%Est_%' or e.subject ilike '%estimate%' or e.subject ilike '%proposal%')";

  let permitFilterSql = "false";
  const extraParams: unknown[] = [];
  if (permit) {
    permitFilterSql =
      "(e.subject ilike ? or e.attachment_names ilike ? or coalesce(e.body_preview, '') ilike ?)";
    extraParams.push(permitLike, permitLike, permitLike);
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

function chooseBestCandidate(params: {
  type: "noi" | "plan" | "estimate";
  candidates: EmailRow[];
  permitNumber: string;
  projectTokens: string[];
  narrativeReceivedAt: Date;
  excludeAttachmentNames?: Set<string>;
}): Candidate | null {
  const scored: Candidate[] = [];
  for (const email of params.candidates) {
    const names = parseAttachmentNames(email.attachment_names);
    const attachment = pickAttachment(
      names,
      params.type,
      params.permitNumber,
      params.excludeAttachmentNames
    );
    if (!attachment) {
      continue;
    }
    let minAttachmentScore = -999;
    if (params.type === "plan") {
      minAttachmentScore = 45;
    } else if (params.type === "noi") {
      minAttachmentScore = 20;
    }
    if (attachment.score < minAttachmentScore) {
      continue;
    }

    const result = scoreCandidate(email, {
      type: params.type,
      permitNumber: params.permitNumber,
      projectTokens: params.projectTokens,
      narrativeReceivedAt: params.narrativeReceivedAt,
    });
    scored.push({
      email,
      score: result.score + Math.floor(attachment.score / 3),
      reason: `${result.reason}+att:${attachment.score}`,
      selectedAttachment: attachment.name,
    });
  }

  if (scored.length === 0) {
    return null;
  }
  scored.sort((a, b) => b.score - a.score);
  return scored[0] ?? null;
}

async function buildPair(row: CanonicalRow): Promise<Pair | null> {
  const narrativeEmail = await getNarrativeEmail(row.emailId);
  if (!narrativeEmail) {
    return null;
  }

  const narrativeReceivedAt = parseDate(narrativeEmail.received_at);
  if (!narrativeReceivedAt) {
    return null;
  }

  const projectTokens = tokeniseProject(row.projectName);

  const noiCandidates = await queryCandidates({
    narrativeReceivedAt,
    permitNumber: row.permitNumber,
    projectTokens,
    type: "noi",
  });
  const noi = chooseBestCandidate({
    type: "noi",
    candidates: noiCandidates,
    permitNumber: row.permitNumber,
    projectTokens,
    narrativeReceivedAt,
  });

  const planCandidates = await queryCandidates({
    narrativeReceivedAt,
    permitNumber: row.permitNumber,
    projectTokens,
    type: "plan",
  });
  const plan = chooseBestCandidate({
    type: "plan",
    candidates: planCandidates,
    permitNumber: row.permitNumber,
    projectTokens,
    narrativeReceivedAt,
    excludeAttachmentNames: new Set(
      noi?.selectedAttachment ? [noi.selectedAttachment.toLowerCase()] : []
    ),
  });

  const estimateCandidates = await queryCandidates({
    narrativeReceivedAt,
    permitNumber: row.permitNumber,
    projectTokens,
    type: "estimate",
  });
  const estimate = chooseBestCandidate({
    type: "estimate",
    candidates: estimateCandidates,
    permitNumber: row.permitNumber,
    projectTokens,
    narrativeReceivedAt,
  });

  return {
    row,
    narrativeEmail,
    noi,
    plan,
    estimate,
  };
}

function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

function sanitizeFilename(name: string): string {
  return name.replaceAll("/", "_").replaceAll("\\", "_");
}

async function downloadSelectedAttachment(params: {
  email: EmailRow;
  attachmentName: string;
  outDir: string;
}): Promise<string | null> {
  const client = getAppClient();
  const attempts: Array<{ messageId: string; mailboxEmail: string }> = [
    {
      messageId: params.email.message_id,
      mailboxEmail: params.email.mailbox_email,
    },
  ];

  if (params.email.internet_message_id) {
    const alternates = await db
      .query<{ message_id: string; mailbox_email: string }>(
        `
        select e.message_id, m.email as mailbox_email
        from emails e
        join mailboxes m on m.id = e.mailbox_id
        where e.internet_message_id = ?
          and e.id <> ?
        order by
          case when lower(m.email) = lower(?) then 0 else 1 end,
          e.received_at desc
        limit 12
        `
      )
      .all(
        params.email.internet_message_id,
        params.email.id,
        params.email.mailbox_email
      );
    for (const alt of alternates) {
      attempts.push({
        messageId: alt.message_id,
        mailboxEmail: alt.mailbox_email,
      });
    }
  }

  if (params.email.internet_message_id) {
    for (const mailboxEmail of [params.email.mailbox_email, EVA]) {
      try {
        const matches = await client.filterEmails({
          userId: mailboxEmail,
          limit: 5,
          filter: `internetMessageId eq '${escapeODataStringLiteral(params.email.internet_message_id)}'`,
        });
        for (const match of matches) {
          if (!match.id) {
            continue;
          }
          attempts.push({ messageId: match.id, mailboxEmail });
        }
      } catch {
        // Best-effort lookup; continue with database-backed attempts.
      }
    }
  }

  try {
    const attachmentLike = `%${params.attachmentName}%`;
    const byName = await db
      .query<{ message_id: string; mailbox_email: string }>(
        `
        select e.message_id, m.email as mailbox_email
        from emails e
        join mailboxes m on m.id = e.mailbox_id
        where e.attachment_names ilike ?
          and e.id <> ?
        order by
          case when lower(m.email) = lower(?) then 0 else 1 end,
          e.received_at desc
        limit 20
        `
      )
      .all(attachmentLike, params.email.id, params.email.mailbox_email);
    for (const alt of byName) {
      attempts.push({
        messageId: alt.message_id,
        mailboxEmail: alt.mailbox_email,
      });
    }
  } catch {
    // Best-effort only.
  }

  const dedupedAttempts: Array<{ messageId: string; mailboxEmail: string }> =
    [];
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

function findNarrativeFile(
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

async function maybeDownloadPair(
  pair: Pair,
  outBaseDir: string
): Promise<void> {
  const packetId = packetFolderName(pair.row);
  const outDir = join(outBaseDir, packetId);
  ensureDir(outDir);

  const packet: Record<string, unknown> = {
    packet_id: packetId,
    doc_id: pair.row.docId,
    narrative_email_id: pair.row.emailId,
    canonical_file_name: pair.row.fileName,
    project_name: pair.row.projectName,
    permit_number: pair.row.permitNumber,
    narrative_doc_file: pair.row.fileName,
    narrative_doc_path: findNarrativeFile(pair.row.emailId, pair.row.fileName),
    selected: {},
  };

  if (pair.noi?.selectedAttachment) {
    const path = await downloadSelectedAttachment({
      email: pair.noi.email,
      attachmentName: pair.noi.selectedAttachment,
      outDir,
    });
    packet.selected = {
      ...(packet.selected as Record<string, unknown>),
      noi: {
        email_id: pair.noi.email.id,
        mailbox: pair.noi.email.mailbox_email,
        message_id: pair.noi.email.message_id,
        attachment_name: pair.noi.selectedAttachment,
        downloaded_path: path,
        score: pair.noi.score,
        reason: pair.noi.reason,
      },
    };
  }

  if (pair.plan?.selectedAttachment) {
    const path = await downloadSelectedAttachment({
      email: pair.plan.email,
      attachmentName: pair.plan.selectedAttachment,
      outDir,
    });
    packet.selected = {
      ...(packet.selected as Record<string, unknown>),
      plan: {
        email_id: pair.plan.email.id,
        mailbox: pair.plan.email.mailbox_email,
        message_id: pair.plan.email.message_id,
        attachment_name: pair.plan.selectedAttachment,
        downloaded_path: path,
        score: pair.plan.score,
        reason: pair.plan.reason,
      },
    };
  }

  if (pair.estimate?.selectedAttachment) {
    const path = await downloadSelectedAttachment({
      email: pair.estimate.email,
      attachmentName: pair.estimate.selectedAttachment,
      outDir,
    });
    packet.selected = {
      ...(packet.selected as Record<string, unknown>),
      estimate: {
        email_id: pair.estimate.email.id,
        mailbox: pair.estimate.email.mailbox_email,
        message_id: pair.estimate.email.message_id,
        attachment_name: pair.estimate.selectedAttachment,
        downloaded_path: path,
        score: pair.estimate.score,
        reason: pair.estimate.reason,
      },
    };
  }

  writeFileSync(
    join(outDir, "packet.json"),
    `${JSON.stringify(packet, null, 2)}\n`,
    "utf8"
  );
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      input: { type: "string", default: DEFAULT_CANONICAL_DOCS },
      out: { type: "string", default: DEFAULT_OUTPUT_DIR },
      limit: { type: "string", default: "20" },
      download: { type: "boolean", default: false },
      minNoiScore: { type: "string", default: "80" },
      minPlanScore: { type: "string", default: "60" },
      minEstimateScore: { type: "string", default: "40" },
    },
    allowPositionals: false,
  });

  const inputPath = String(values.input);
  const outDir = String(values.out);
  const limit = Math.max(1, Number.parseInt(String(values.limit), 10) || 20);
  const minNoiScore = Number.parseInt(String(values.minNoiScore), 10) || 80;
  const minPlanScore = Number.parseInt(String(values.minPlanScore), 10) || 60;
  const minEstimateScore =
    Number.parseInt(String(values.minEstimateScore), 10) || 40;
  const download = Boolean(values.download);

  ensureDir(outDir);
  const rows = parseCanonicalRows(inputPath);
  const pairs: Pair[] = [];

  for (const row of rows) {
    if (pairs.length >= limit) {
      break;
    }

    const pair = await buildPair(row);
    if (!pair) {
      continue;
    }
    if (!(pair.noi && pair.plan)) {
      continue;
    }
    if (pair.noi.score < minNoiScore || pair.plan.score < minPlanScore) {
      continue;
    }

    pairs.push(pair);
  }

  const lines: string[] = [];
  lines.push(
    [
      "doc_id",
      "narrative_email_id",
      "packet_id",
      "project_name",
      "permit_number",
      "narrative_file",
      "noi_email_id",
      "noi_attachment",
      "noi_score",
      "noi_reason",
      "plan_email_id",
      "plan_attachment",
      "plan_score",
      "plan_reason",
      "estimate_email_id",
      "estimate_attachment",
      "estimate_score",
      "estimate_reason",
    ].join(",")
  );

  for (const pair of pairs) {
    const estimateOk =
      pair.estimate && pair.estimate.score >= minEstimateScore
        ? pair.estimate
        : null;
    lines.push(
      [
        csvEscape(pair.row.docId),
        String(pair.row.emailId),
        csvEscape(packetFolderName(pair.row)),
        csvEscape(pair.row.projectName),
        csvEscape(pair.row.permitNumber),
        csvEscape(pair.row.fileName),
        String(pair.noi?.email.id ?? ""),
        csvEscape(pair.noi?.selectedAttachment ?? ""),
        String(pair.noi?.score ?? ""),
        csvEscape(pair.noi?.reason ?? ""),
        String(pair.plan?.email.id ?? ""),
        csvEscape(pair.plan?.selectedAttachment ?? ""),
        String(pair.plan?.score ?? ""),
        csvEscape(pair.plan?.reason ?? ""),
        String(estimateOk?.email.id ?? ""),
        csvEscape(estimateOk?.selectedAttachment ?? ""),
        String(estimateOk?.score ?? ""),
        csvEscape(estimateOk?.reason ?? ""),
      ].join(",")
    );
  }
  lines.push("");

  writeFileSync(join(outDir, "pairs.csv"), lines.join("\n"), "utf8");
  writeFileSync(
    join(outDir, "pairs.json"),
    `${JSON.stringify(
      pairs.map((pair) => ({
        doc_id: pair.row.docId,
        packet_id: packetFolderName(pair.row),
        canonical_file_name: pair.row.fileName,
        narrative_email_id: pair.row.emailId,
        project_name: pair.row.projectName,
        permit_number: pair.row.permitNumber,
        narrative: pair.narrativeEmail,
        noi: pair.noi,
        plan: pair.plan,
        estimate: pair.estimate,
      })),
      null,
      2
    )}\n`,
    "utf8"
  );

  if (download) {
    for (const pair of pairs) {
      await maybeDownloadPair(pair, outDir);
    }
  }

  console.log(
    `Built ${pairs.length} source pairs${download ? " and downloaded selected attachments" : ""}.`
  );
  console.log(`Output: ${outDir}`);
}

await main();
