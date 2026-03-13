import { db } from "@lib/db/client";
import { SharePointClient } from "@sharepoint/client";
import {
  buildInspectionSearchTerms,
  extractStoredInspectionSiteName,
  rankInspectionFolderCandidates,
  sharePointWebUrlToDrivePath,
  type InspectionSearchCandidate,
  type RankedInspectionFolderCandidate,
} from "../../src/regression-report";
import {
  formatFilename,
  parseComplianceGoEmail,
  parseSiteName,
  siteNameToSharePointPath,
} from "../../src/parser";

interface StoredEmailRow {
  body_full: string | null;
  body_preview: string | null;
  from_email: string | null;
  id: number;
  mailbox: string;
  received_at: string;
  subject: string | null;
}

interface InvestigatedEmailRow {
  bestCandidatePath: string | null;
  bestMatchKind:
    | "exact_path"
    | "likely_existing_folder"
    | "possible_existing_folder"
    | "nearby_result"
    | "no_candidate_found"
    | "parse_failed";
  exactPathExists: boolean;
  fileName: string;
  id: number;
  inspectionDateIso: string;
  inspectionDateSource: "email_received_at" | "report_url";
  mailbox: string;
  parsedContractor: string | null;
  parsedProject: string | null;
  receivedAt: string;
  reportUrl: string | null;
  score: number | null;
  searchTerms: string[];
  siteName: string | null;
  status:
    | "exact_path_exists"
    | "likely_existing_folder"
    | "possible_existing_folder"
    | "no_candidate_found"
    | "parse_failed";
  subject: string | null;
}

interface SiteResolutionRow {
  bestCandidatePath: string | null;
  bestCandidateScore: number | null;
  candidateCount: number;
  deterministicPath: string | null;
  deterministicPathExists: boolean;
  emailCount: number;
  fileNameExamples: string[];
  parsedContractor: string | null;
  parsedProject: string | null;
  resolutionStatus:
    | "exact_path_exists"
    | "likely_existing_folder"
    | "possible_existing_folder"
    | "no_candidate_found"
    | "parse_failed";
  searchTerms: string[];
  siteName: string | null;
  topCandidates: Array<{
    candidatePath: string | null;
    contractorSimilarity: number;
    matchKind: RankedInspectionFolderCandidate["matchKind"];
    projectSimilarity: number;
    score: number;
    webUrl: string;
  }>;
}

interface ScriptOptions {
  limit: number | null;
  mailbox: string;
  sender: string;
}

const INVESTIGATION_ROOT = new URL("./", import.meta.url);
const OUTPUT_ROOT = new URL("./output/", import.meta.url);
const DEFAULT_MAILBOX = "logan@desertservices.net";
const DEFAULT_SENDER = "support@compliancego.com";
const SEARCH_TIMEOUT_MS = 10_000;

const QUERY = `
  SELECT
    e.id,
    e.subject,
    e.received_at::text AS received_at,
    e.from_email,
    e.body_full,
    e.body_preview,
    m.email AS mailbox
  FROM emails e
  JOIN mailboxes m ON m.id = e.mailbox_id
  WHERE lower(m.email) = lower($1)
    AND lower(e.from_email) = lower($2)
    AND e.subject ILIKE '%Inspection Report%'
  ORDER BY e.received_at DESC
`;

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const startedAt = new Date().toISOString();
  const rows = await db.query<StoredEmailRow>(QUERY).all(
    options.mailbox,
    options.sender
  );
  const limitedRows =
    options.limit && options.limit > 0 ? rows.slice(0, options.limit) : rows;

  console.log(
    `[investigation] Loaded ${limitedRows.length} email rows for ${options.mailbox}`
  );

  const client = new SharePointClient({
    azureTenantId: process.env.AZURE_TENANT_ID ?? "",
    azureClientId: process.env.AZURE_CLIENT_ID ?? "",
    azureClientSecret: process.env.AZURE_CLIENT_SECRET ?? "",
  });

  const prepared = limitedRows.map(prepareEmailRecord);
  const siteGroups = groupBySite(prepared);
  const siteRows: SiteResolutionRow[] = [];
  const siteResolutionMap = new Map<string, SiteResolutionRow>();
  let processedSites = 0;

  for (const group of siteGroups) {
    processedSites += 1;
    console.log(
      `[investigation] Resolving site ${processedSites}/${siteGroups.length}: ${group.siteName ?? "PARSE_FAILED"}`
    );
    const row = await resolveSiteGroup(client, group);
    siteRows.push(row);
    siteResolutionMap.set(group.groupKey, row);
  }

  const emails: InvestigatedEmailRow[] = prepared.map((email) => {
    const siteRow = siteResolutionMap.get(email.groupKey);
    if (!siteRow || !email.siteName) {
      return {
        bestCandidatePath: null,
        bestMatchKind: "parse_failed",
        exactPathExists: false,
        fileName: email.fileName,
        id: email.id,
        inspectionDateIso: email.inspectionDate.toISOString(),
        inspectionDateSource: email.inspectionDateSource,
        mailbox: email.mailbox,
        parsedContractor: email.parsed?.contractor ?? null,
        parsedProject: email.parsed?.project ?? null,
        receivedAt: email.receivedAt,
        reportUrl: email.reportUrl,
        score: null,
        searchTerms: [],
        siteName: email.siteName,
        status: "parse_failed",
        subject: email.subject,
      };
    }

    const topCandidate = siteRow.topCandidates[0] ?? null;
    return {
      bestCandidatePath: siteRow.bestCandidatePath,
      bestMatchKind: topCandidate?.matchKind ?? "no_candidate_found",
      exactPathExists: siteRow.deterministicPathExists,
      fileName: email.fileName,
      id: email.id,
      inspectionDateIso: email.inspectionDate.toISOString(),
      inspectionDateSource: email.inspectionDateSource,
      mailbox: email.mailbox,
      parsedContractor: email.parsed?.contractor ?? null,
      parsedProject: email.parsed?.project ?? null,
      receivedAt: email.receivedAt,
      reportUrl: email.reportUrl,
      score: siteRow.bestCandidateScore,
      searchTerms: siteRow.searchTerms,
      siteName: email.siteName,
      status: siteRow.resolutionStatus,
      subject: email.subject,
    };
  });

  const summary = buildSummary({
    mailbox: options.mailbox,
    sender: options.sender,
    startedAt,
    totalEmails: emails.length,
    totalSites: siteRows.length,
    siteRows,
  });

  const summaryMarkdown = buildSummaryMarkdown(summary, siteRows);

  await Bun.write(
    new URL("./summary.md", OUTPUT_ROOT),
    `${summaryMarkdown}\n`
  );
  await Bun.write(
    new URL("./emails.json", OUTPUT_ROOT),
    `${JSON.stringify(emails, null, 2)}\n`
  );
  await Bun.write(
    new URL("./sites.json", OUTPUT_ROOT),
    `${JSON.stringify(siteRows, null, 2)}\n`
  );
  await Bun.write(
    new URL("./summary.json", OUTPUT_ROOT),
    `${JSON.stringify(summary, null, 2)}\n`
  );

  console.log(
    `[investigation] Wrote outputs under ${new URL("./output/", INVESTIGATION_ROOT).pathname}`
  );
}

function parseArgs(argv: string[]): ScriptOptions {
  const options: ScriptOptions = {
    limit: null,
    mailbox: DEFAULT_MAILBOX,
    sender: DEFAULT_SENDER,
  };

  for (const arg of argv) {
    if (arg.startsWith("--mailbox=")) {
      options.mailbox = arg.slice("--mailbox=".length);
      continue;
    }
    if (arg.startsWith("--sender=")) {
      options.sender = arg.slice("--sender=".length);
      continue;
    }
    if (arg.startsWith("--limit=")) {
      const parsed = Number.parseInt(arg.slice("--limit=".length), 10);
      options.limit = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    }
  }

  return options;
}

function prepareEmailRecord(row: StoredEmailRow) {
  const bodyText = row.body_full || row.body_preview || "";
  const parsedEmail = row.body_full
    ? parseComplianceGoEmail("", row.body_full)
    : null;
  const siteName =
    parsedEmail?.siteName ??
    extractStoredInspectionSiteName({
      bodyText,
      subject: row.subject,
    });
  const receivedAt = new Date(row.received_at);
  const inspectionDate = parsedEmail?.inspectionDate ?? receivedAt;
  const parsed = siteName ? parseSiteName(siteName) : null;
  const groupKey = siteName?.trim().toUpperCase() || `PARSE_FAILED:${row.id}`;

  return {
    fileName: formatFilename(inspectionDate),
    groupKey,
    id: row.id,
    inspectionDate,
    inspectionDateSource: parsedEmail?.inspectionDate
      ? ("report_url" as const)
      : ("email_received_at" as const),
    mailbox: row.mailbox,
    parsed,
    receivedAt: row.received_at,
    reportUrl: parsedEmail?.reportUrl ?? null,
    siteName,
    subject: row.subject,
  };
}

function groupBySite(
  prepared: ReturnType<typeof prepareEmailRecord>[]
): Array<{
  emails: ReturnType<typeof prepareEmailRecord>[];
  groupKey: string;
  parsed: { contractor: string; project: string } | null;
  siteName: string | null;
}> {
  const groups = new Map<
    string,
    {
      emails: ReturnType<typeof prepareEmailRecord>[];
      groupKey: string;
      parsed: { contractor: string; project: string } | null;
      siteName: string | null;
    }
  >();

  for (const email of prepared) {
    const existing = groups.get(email.groupKey);
    if (existing) {
      existing.emails.push(email);
      continue;
    }
    groups.set(email.groupKey, {
      emails: [email],
      groupKey: email.groupKey,
      parsed: email.parsed,
      siteName: email.siteName,
    });
  }

  return Array.from(groups.values()).sort((a, b) =>
    (a.siteName ?? "").localeCompare(b.siteName ?? "")
  );
}

async function resolveSiteGroup(
  client: SharePointClient,
  group: ReturnType<typeof groupBySite>[number]
): Promise<SiteResolutionRow> {
  const latestInspection = group.emails.reduce((latest, current) =>
    current.inspectionDate > latest.inspectionDate ? current : latest
  );
  const deterministicPath = group.siteName
    ? siteNameToSharePointPath(
        group.siteName,
        latestInspection.inspectionDate.getFullYear()
      )
    : null;
  const deterministicPathExists = deterministicPath
    ? await client.exists(deterministicPath)
    : false;

  let ranked: RankedInspectionFolderCandidate[] = [];
  const searchTerms =
    group.siteName && !deterministicPathExists
      ? selectSearchTerms(group.siteName, group.parsed)
      : [];

  if (group.siteName && !deterministicPathExists) {
    const candidates = await searchCandidates(client, searchTerms);
    ranked = rankInspectionFolderCandidates({
      candidates,
      expectedFolderPath: deterministicPath,
      parsed: group.parsed,
      siteName: group.siteName,
    });
  }

  const topCandidate = ranked[0] ?? null;
  const resolutionStatus = resolveSiteStatus({
    deterministicPathExists,
    siteName: group.siteName,
    topCandidate,
  });

  return {
    bestCandidatePath: deterministicPathExists
      ? deterministicPath
      : topCandidate?.candidatePath ?? null,
    bestCandidateScore: deterministicPathExists
      ? 1
      : topCandidate
        ? round(topCandidate.score)
        : null,
    candidateCount: ranked.length,
    deterministicPath,
    deterministicPathExists,
    emailCount: group.emails.length,
    fileNameExamples: Array.from(
      new Set(group.emails.slice(0, 5).map((email) => email.fileName))
    ),
    parsedContractor: group.parsed?.contractor ?? null,
    parsedProject: group.parsed?.project ?? null,
    resolutionStatus,
    searchTerms,
    siteName: group.siteName,
    topCandidates: ranked.slice(0, 10).map((candidate) => ({
      candidatePath: candidate.candidatePath,
      contractorSimilarity: round(candidate.contractorSimilarity),
      matchKind: candidate.matchKind,
      projectSimilarity: round(candidate.projectSimilarity),
      score: round(candidate.score),
      webUrl: candidate.searchCandidate.webUrl,
    })),
  };
}

async function searchCandidates(
  client: SharePointClient,
  searchTerms: string[]
): Promise<InspectionSearchCandidate[]> {
  const unique = new Map<string, InspectionSearchCandidate>();

  for (const term of searchTerms) {
    let results;
    try {
      results = await withTimeout(client.search(term), SEARCH_TIMEOUT_MS);
    } catch (error) {
      console.warn(
        `[investigation] SharePoint search failed for term "${term}": ${error instanceof Error ? error.message : String(error)}`
      );
      continue;
    }
    for (const item of results) {
      const path = sharePointWebUrlToDrivePath(item.webUrl, Boolean(item.folder));
      if (!path) {
        continue;
      }
      const key = path;
      if (unique.has(key)) {
        continue;
      }
      unique.set(key, {
        isFolder: Boolean(item.folder),
        name: item.name,
        webUrl: item.webUrl,
      });
    }

    if (unique.size >= 60) {
      break;
    }
  }

  return Array.from(unique.values());
}

function selectSearchTerms(
  siteName: string,
  parsed: { contractor: string; project: string } | null
): string[] {
  return buildInspectionSearchTerms(siteName, parsed).filter((term, index) => {
    if (index > 1) {
      return false;
    }
    return term.trim().length >= 8;
  });
}

function resolveSiteStatus(input: {
  deterministicPathExists: boolean;
  siteName: string | null;
  topCandidate: RankedInspectionFolderCandidate | null;
}): SiteResolutionRow["resolutionStatus"] {
  if (!input.siteName) {
    return "parse_failed";
  }
  if (input.deterministicPathExists) {
    return "exact_path_exists";
  }
  if (!input.topCandidate) {
    return "no_candidate_found";
  }
  if (input.topCandidate.matchKind === "likely_existing_folder") {
    return "likely_existing_folder";
  }
  if (input.topCandidate.matchKind === "possible_existing_folder") {
    return "possible_existing_folder";
  }
  return "no_candidate_found";
}

function buildSummary(input: {
  mailbox: string;
  sender: string;
  siteRows: SiteResolutionRow[];
  startedAt: string;
  totalEmails: number;
  totalSites: number;
}) {
  const counts = {
    exactPathExists: 0,
    likelyExistingFolder: 0,
    noCandidateFound: 0,
    parseFailed: 0,
    possibleExistingFolder: 0,
  };

  for (const row of input.siteRows) {
    if (row.resolutionStatus === "exact_path_exists") {
      counts.exactPathExists += 1;
    } else if (row.resolutionStatus === "likely_existing_folder") {
      counts.likelyExistingFolder += 1;
    } else if (row.resolutionStatus === "possible_existing_folder") {
      counts.possibleExistingFolder += 1;
    } else if (row.resolutionStatus === "parse_failed") {
      counts.parseFailed += 1;
    } else {
      counts.noCandidateFound += 1;
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    mailbox: input.mailbox,
    sender: input.sender,
    startedAt: input.startedAt,
    totals: {
      ...counts,
      totalEmails: input.totalEmails,
      totalSites: input.totalSites,
    },
  };
}

function buildSummaryMarkdown(
  summary: ReturnType<typeof buildSummary>,
  siteRows: SiteResolutionRow[]
): string {
  const mismatchRows = siteRows
    .filter((row) => row.resolutionStatus !== "exact_path_exists")
    .sort((a, b) => b.emailCount - a.emailCount || a.siteName!.localeCompare(b.siteName!));

  const lines = [
    "# Logan SharePoint Folder Regression Summary",
    "",
    `Generated: \`${summary.generatedAt}\``,
    `Mailbox: \`${summary.mailbox}\``,
    `Sender: \`${summary.sender}\``,
    "",
    "## Totals",
    "",
    `- Total emails: \`${summary.totals.totalEmails}\``,
    `- Unique sites: \`${summary.totals.totalSites}\``,
    `- Exact deterministic path exists: \`${summary.totals.exactPathExists}\``,
    `- Likely existing folder mismatch: \`${summary.totals.likelyExistingFolder}\``,
    `- Possible existing folder mismatch: \`${summary.totals.possibleExistingFolder}\``,
    `- No candidate found: \`${summary.totals.noCandidateFound}\``,
    `- Parse failed: \`${summary.totals.parseFailed}\``,
    "",
    "## Mismatch Sites",
    "",
  ];

  if (mismatchRows.length === 0) {
    lines.push("No mismatches found.");
    return lines.join("\n");
  }

  lines.push(
    "| Emails | Status | Site | Deterministic Path | Top Candidate | Score |",
    "| --- | --- | --- | --- | --- | --- |"
  );

  for (const row of mismatchRows) {
    lines.push(
      `| ${row.emailCount} | ${row.resolutionStatus} | ${escapePipes(row.siteName ?? "N/A")} | ${escapePipes(row.deterministicPath ?? "N/A")} | ${escapePipes(row.bestCandidatePath ?? "N/A")} | ${row.bestCandidateScore ?? "N/A"} |`
    );
  }

  return lines.join("\n");
}

function escapePipes(value: string): string {
  return value.replaceAll("|", "\\|");
}

function round(value: number): number {
  return Number(value.toFixed(3));
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      const timer = setTimeout(() => {
        clearTimeout(timer);
        reject(new Error(`Timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    }),
  ]);
}

main().catch((error) => {
  console.error("[investigation] Failed:", error);
  process.exit(1);
});
