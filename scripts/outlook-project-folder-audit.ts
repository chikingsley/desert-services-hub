import { db } from "../lib/db/client";
import { graphGet } from "../lib/graph/http";
import { findProjectCandidates } from "@projects/db/project-matching";

interface Args {
  json: boolean;
  mailbox: string;
}

interface GraphFolder {
  childFolderCount?: number;
  displayName: string;
  id: string;
  totalItemCount?: number;
}

interface GraphMessageListResponse {
  "@odata.nextLink"?: string;
  value: Array<{ id: string }>;
}

interface ProjectFolderRow {
  folderId: string;
  folderName: string;
  status: string;
}

interface FolderStatusSummary {
  emails: number;
  folders: number;
  status: string;
}

interface DbStateSummary {
  chiLinked: number;
  chiStored: number;
  chiUnlinked: number;
  emailNullProject: number;
  folderWatcherReviews: number;
  folderWatcherReviewsPending: number;
  projectsWithOutlookFolder: number;
  trackedFolders: number;
  trackedFoldersLinked: number;
}

interface LinkageSummary {
  folderMessages: number;
  folders: number;
  linkedInDb: number;
  status: string;
  storedInDb: number;
  unlinkedInDb: number;
}

interface MatchCounters {
  auto: number;
  hardDuplicate: number;
  noCandidates: number;
  review: number;
  strongButBelow: number;
  total: number;
  weak: number;
}

interface MatchSample {
  best: string | null;
  gap?: number;
  name: string;
  runner: string | null;
  score?: number;
  status: string;
}

interface MatchAudit {
  counters: MatchCounters;
  samples: {
    hardDuplicate: MatchSample[];
    noCandidates: MatchSample[];
    strongButBelow: MatchSample[];
    weak: MatchSample[];
  };
}

interface AuditReport {
  dbState: DbStateSummary;
  linkageByStatus: LinkageSummary[];
  mailbox: string;
  matchAudit: {
    rawName: MatchAudit;
    splitName: MatchAudit;
  };
  outlookStatusSummary: FolderStatusSummary[];
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    mailbox: "chi@desertservices.net",
    json: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") {
      args.json = true;
      continue;
    }
    if (arg === "--mailbox") {
      const value = argv[i + 1];
      if (!value) {
        throw new Error("--mailbox requires a value");
      }
      args.mailbox = value.trim().toLowerCase();
      i++;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function encodeMailboxPath(mailbox: string): string {
  return encodeURIComponent(mailbox);
}

async function getTopFolders(mailbox: string): Promise<GraphFolder[]> {
  const response = await graphGet<{ value: GraphFolder[] }>(
    `users/${encodeMailboxPath(mailbox)}/mailFolders?$top=200&$select=id,displayName,childFolderCount,totalItemCount`
  );
  return response.value ?? [];
}

async function getChildFolders(
  mailbox: string,
  folderId: string
): Promise<GraphFolder[]> {
  const response = await graphGet<{ value: GraphFolder[] }>(
    `users/${encodeMailboxPath(mailbox)}/mailFolders/${encodeURIComponent(folderId)}/childFolders?$top=300&$select=id,displayName,childFolderCount,totalItemCount`
  );
  return response.value ?? [];
}

async function getProjectsTree(mailbox: string): Promise<{
  folders: ProjectFolderRow[];
  statuses: FolderStatusSummary[];
}> {
  const topFolders = await getTopFolders(mailbox);
  const projectsFolder = topFolders.find(
    (folder) => folder.displayName === "Projects"
  );
  if (!projectsFolder) {
    throw new Error(`Projects folder not found in ${mailbox}`);
  }

  const statusFolders = await getChildFolders(mailbox, projectsFolder.id);
  const folders: ProjectFolderRow[] = [];
  const statuses: FolderStatusSummary[] = [];

  for (const statusFolder of statusFolders) {
    const projectFolders = await getChildFolders(mailbox, statusFolder.id);
    statuses.push({
      status: statusFolder.displayName,
      folders: projectFolders.length,
      emails: projectFolders.reduce(
        (sum, folder) => sum + (folder.totalItemCount ?? 0),
        0
      ),
    });

    for (const projectFolder of projectFolders) {
      folders.push({
        status: statusFolder.displayName,
        folderId: projectFolder.id,
        folderName: projectFolder.displayName,
      });
    }
  }

  return { folders, statuses };
}

async function listFolderMessageIds(
  mailbox: string,
  folderId: string
): Promise<string[]> {
  const messageIds: string[] = [];
  const seen = new Set<string>();
  let url = `users/${encodeMailboxPath(mailbox)}/mailFolders/${encodeURIComponent(folderId)}/messages?$select=id&$top=500`;

  while (url && !seen.has(url)) {
    seen.add(url);
    const response = await graphGet<GraphMessageListResponse>(url);
    messageIds.push(...(response.value ?? []).map((row) => row.id));
    url = response["@odata.nextLink"] ?? "";
  }

  return messageIds;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function getDbState(mailbox: string): Promise<DbStateSummary> {
  const row = await db
    .query<DbStateSummary>(
      `WITH chi_stats AS (
         SELECT
           COUNT(*)::int AS "chiStored",
           COUNT(*) FILTER (WHERE e.project_id IS NOT NULL)::int AS "chiLinked",
           COUNT(*) FILTER (WHERE e.project_id IS NULL)::int AS "chiUnlinked"
         FROM emails e
         JOIN mailboxes m ON m.id = e.mailbox_id
         WHERE lower(m.email) = $1
       )
       SELECT
         (SELECT COUNT(*)::int FROM projects WHERE outlook_folder IS NOT NULL AND trim(outlook_folder) <> '') AS "projectsWithOutlookFolder",
         (SELECT COUNT(*)::int FROM tracked_folders) AS "trackedFolders",
         (SELECT COUNT(*)::int FROM tracked_folders WHERE project_id IS NOT NULL) AS "trackedFoldersLinked",
         (SELECT COUNT(*)::int FROM project_match_reviews WHERE source = 'folder_watcher') AS "folderWatcherReviews",
         (SELECT COUNT(*)::int FROM project_match_reviews WHERE source = 'folder_watcher' AND status = 'pending') AS "folderWatcherReviewsPending",
         (SELECT COUNT(*)::int FROM emails WHERE project_id IS NULL) AS "emailNullProject",
         chi_stats."chiStored",
         chi_stats."chiLinked",
         chi_stats."chiUnlinked"
       FROM chi_stats`
    )
    .get(mailbox);

  if (!row) {
    throw new Error("Failed to query DB state");
  }

  return row;
}

async function getLinkageByStatus(
  mailbox: string,
  folders: ProjectFolderRow[]
): Promise<LinkageSummary[]> {
  const grouped = new Map<string, ProjectFolderRow[]>();
  for (const folder of folders) {
    const rows = grouped.get(folder.status) ?? [];
    rows.push(folder);
    grouped.set(folder.status, rows);
  }

  const summaries: LinkageSummary[] = [];
  for (const [status, rows] of grouped.entries()) {
    const messageIds = new Set<string>();
    for (const row of rows) {
      const ids = await listFolderMessageIds(mailbox, row.folderId);
      for (const id of ids) {
        messageIds.add(id);
      }
    }

    let storedInDb = 0;
    let linkedInDb = 0;
    for (const batch of chunk([...messageIds], 500)) {
      const placeholders = batch.map((_, index) => `$${index + 1}`).join(", ");
      const counts = await db
        .query<{ linked: number; stored: number }>(
          `SELECT
             COUNT(*)::int AS stored,
             COUNT(*) FILTER (WHERE project_id IS NOT NULL)::int AS linked
           FROM emails
           WHERE message_id IN (${placeholders})`
        )
        .get(...batch);

      storedInDb += counts?.stored ?? 0;
      linkedInDb += counts?.linked ?? 0;
    }

    summaries.push({
      status,
      folders: rows.length,
      folderMessages: messageIds.size,
      storedInDb,
      linkedInDb,
      unlinkedInDb: storedInDb - linkedInDb,
    });
  }

  return summaries.sort((left, right) => left.status.localeCompare(right.status));
}

function splitFolderName(folderName: string): {
  contractor: string | null;
  project: string;
} {
  const parts = folderName
    .split(" - ")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length <= 1) {
    return { project: folderName.trim(), contractor: null };
  }

  return {
    project: parts.slice(0, -1).join(" - "),
    contractor: parts.at(-1) ?? null,
  };
}

function createEmptyMatchAudit(): MatchAudit {
  return {
    counters: {
      total: 0,
      auto: 0,
      review: 0,
      noCandidates: 0,
      hardDuplicate: 0,
      strongButBelow: 0,
      weak: 0,
    },
    samples: {
      hardDuplicate: [],
      noCandidates: [],
      strongButBelow: [],
      weak: [],
    },
  };
}

function pushSample(
  samples: MatchSample[],
  sample: MatchSample,
  limit = 12
): void {
  if (samples.length < limit) {
    samples.push(sample);
  }
}

async function runMatchAudit(
  folders: ProjectFolderRow[],
  mode: "raw" | "split"
): Promise<MatchAudit> {
  const audit = createEmptyMatchAudit();

  for (const folder of folders) {
    audit.counters.total++;

    const split = splitFolderName(folder.folderName);
    const result = await findProjectCandidates({
      primaryText: mode === "raw" ? folder.folderName : split.project,
      aliasHints:
        mode === "raw"
          ? [folder.folderName]
          : [folder.folderName, split.project].filter(Boolean),
      contractorHint: mode === "split" ? split.contractor ?? undefined : undefined,
      limit: 5,
    });

    if (!(result && result.candidates.length > 0)) {
      audit.counters.noCandidates++;
      pushSample(audit.samples.noCandidates, {
        status: folder.status,
        name: folder.folderName,
        best: null,
        runner: null,
      });
      continue;
    }

    if (result.decision.autoLink && result.decision.best) {
      audit.counters.auto++;
      continue;
    }

    audit.counters.review++;

    const best = result.decision.best;
    const runner = result.decision.runnerUp;
    const sample: MatchSample = {
      status: folder.status,
      name: folder.folderName,
      best: best?.name ?? null,
      runner: runner?.name ?? null,
      score: best?.score,
      gap: result.decision.gap,
    };

    if (best && runner && best.score >= 180 && runner.score === best.score) {
      audit.counters.hardDuplicate++;
      pushSample(audit.samples.hardDuplicate, sample);
      continue;
    }

    if (best && best.score >= 130) {
      audit.counters.strongButBelow++;
      pushSample(audit.samples.strongButBelow, sample);
      continue;
    }

    audit.counters.weak++;
    pushSample(audit.samples.weak, sample);
  }

  return audit;
}

function formatTable<T extends object>(rows: T[]): string {
  if (rows.length === 0) {
    return "(none)";
  }

  const columns = Object.keys(rows[0]) as Array<keyof T & string>;
  const widths = new Map<string, number>();
  for (const column of columns) {
    widths.set(
      column,
      Math.max(
        column.length,
        ...rows.map((row) => String(row[column as keyof T] ?? "").length)
      )
    );
  }

  const lines = [
    columns
      .map((column) => column.padEnd(widths.get(column) ?? column.length))
      .join("  "),
    columns
      .map((column) => "-".repeat(widths.get(column) ?? column.length))
      .join("  "),
  ];

  for (const row of rows) {
    lines.push(
      columns
        .map((column) =>
          String(row[column as keyof T] ?? "").padEnd(
            widths.get(column) ?? column.length
          )
        )
        .join("  ")
    );
  }

  return lines.join("\n");
}

function printAudit(report: AuditReport): void {
  console.log(`Mailbox: ${report.mailbox}`);
  console.log("");
  console.log("DB state");
  console.log(
    formatTable([
      {
        projectsWithOutlookFolder: report.dbState.projectsWithOutlookFolder,
        trackedFolders: report.dbState.trackedFolders,
        trackedFoldersLinked: report.dbState.trackedFoldersLinked,
        folderWatcherReviews: report.dbState.folderWatcherReviews,
        folderWatcherReviewsPending: report.dbState.folderWatcherReviewsPending,
        chiStored: report.dbState.chiStored,
        chiLinked: report.dbState.chiLinked,
        chiUnlinked: report.dbState.chiUnlinked,
        emailNullProject: report.dbState.emailNullProject,
      },
    ])
  );
  console.log("");
  console.log("Outlook status folders");
  console.log(formatTable(report.outlookStatusSummary));
  console.log("");
  console.log("Linkage by status");
  console.log(formatTable(report.linkageByStatus));
  console.log("");
  console.log("Matcher audit");
  console.log(
    formatTable([
      { mode: "rawName", ...report.matchAudit.rawName.counters },
      { mode: "splitName", ...report.matchAudit.splitName.counters },
    ])
  );
  console.log("");
  console.log("Split-name duplicate samples");
  console.log(formatTable(report.matchAudit.splitName.samples.hardDuplicate));
  console.log("");
  console.log("Split-name weak samples");
  console.log(formatTable(report.matchAudit.splitName.samples.weak));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const { folders, statuses } = await getProjectsTree(args.mailbox);
  const report: AuditReport = {
    mailbox: args.mailbox,
    dbState: await getDbState(args.mailbox),
    outlookStatusSummary: statuses.sort((left, right) =>
      left.status.localeCompare(right.status)
    ),
    linkageByStatus: await getLinkageByStatus(args.mailbox, folders),
    matchAudit: {
      rawName: await runMatchAudit(folders, "raw"),
      splitName: await runMatchAudit(folders, "split"),
    },
  };

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  printAudit(report);
}

await main();
