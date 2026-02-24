#!/usr/bin/env bun

import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

interface CliArgs {
  container: string;
  limit: number;
  minDocCount: number;
  outputPath: string;
  requireAddress: boolean;
  requireProject: boolean;
  statuses: string[];
}

interface PermitDatasetRow {
  accountId: number | null;
  address: string | null;
  city: string | null;
  docCount: number;
  parcel: string | null;
  permitId: string;
  projectId: number | null;
  projectName: string | null;
  status: string | null;
  updatedAtEpoch: number | null;
}

function nowStamp(): string {
  const iso = new Date().toISOString().replace(/[:.]/g, "-");
  return iso.replace("T", "_").replace("Z", "");
}

function parseBooleanFlag(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function parseArgs(argv: string[]): CliArgs {
  const args = [...argv];

  let limit = 25;
  let outputPath = `experiments/custom-map-rehydrate/out/dataset-${nowStamp()}.json`;
  let container = "supabase_db_desert-services-hub";
  let requireProject = true;
  let requireAddress = false;
  let minDocCount = 0;
  let statuses: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) {
      continue;
    }

    if (arg === "--limit") {
      limit = Number(args[i + 1] ?? "25");
      i += 1;
      continue;
    }

    if (arg === "--out") {
      outputPath = args[i + 1] ?? outputPath;
      i += 1;
      continue;
    }

    if (arg === "--container") {
      container = args[i + 1] ?? container;
      i += 1;
      continue;
    }

    if (arg === "--require-project") {
      requireProject = parseBooleanFlag(args[i + 1] ?? "true");
      i += 1;
      continue;
    }

    if (arg === "--require-address") {
      requireAddress = parseBooleanFlag(args[i + 1] ?? "true");
      i += 1;
      continue;
    }

    if (arg === "--min-docs") {
      minDocCount = Number(args[i + 1] ?? "0");
      i += 1;
      continue;
    }

    if (arg === "--statuses") {
      statuses = (args[i + 1] ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      i += 1;
    }
  }

  if (!Number.isFinite(limit) || limit <= 0) {
    throw new Error(`Invalid --limit: ${limit}`);
  }

  if (!Number.isFinite(minDocCount) || minDocCount < 0) {
    throw new Error(`Invalid --min-docs: ${minDocCount}`);
  }

  return {
    limit: Math.floor(limit),
    outputPath,
    container,
    requireProject,
    requireAddress,
    minDocCount: Math.floor(minDocCount),
    statuses,
  };
}

function quoteSqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function buildSql(args: CliArgs): string {
  const whereClauses: string[] = [
    "p.parcel IS NOT NULL",
    "btrim(p.parcel) <> ''",
    `COALESCE(dc.doc_count, 0) >= ${args.minDocCount}`,
  ];

  if (args.requireProject) {
    whereClauses.push("p.project_id IS NOT NULL");
  }

  if (args.requireAddress) {
    whereClauses.push("p.address IS NOT NULL");
    whereClauses.push("btrim(p.address) <> ''");
  }

  if (args.statuses.length > 0) {
    const statusLiterals = args.statuses.map(quoteSqlLiteral).join(", ");
    whereClauses.push(`p.status IN (${statusLiterals})`);
  }

  return `
WITH doc_counts AS (
  SELECT project_id, COUNT(*)::int AS doc_count
  FROM documents
  WHERE project_id IS NOT NULL
  GROUP BY project_id
)
SELECT COALESCE(json_agg(t), '[]'::json) AS rows
FROM (
  SELECT
    p.id AS "permitId",
    p.project_name AS "projectName",
    p.address AS "address",
    p.city AS "city",
    p.parcel AS "parcel",
    p.status AS "status",
    p.project_id AS "projectId",
    p.account_id AS "accountId",
    p.updated_at AS "updatedAtEpoch",
    COALESCE(dc.doc_count, 0) AS "docCount"
  FROM dust_permits_filed_by_desert_services p
  LEFT JOIN doc_counts dc ON dc.project_id = p.project_id
  WHERE ${whereClauses.join(" AND ")}
  ORDER BY COALESCE(dc.doc_count, 0) DESC, p.updated_at DESC
  LIMIT ${args.limit}
) t;
`.trim();
}

async function runPsqlJsonQuery(
  container: string,
  sql: string
): Promise<PermitDatasetRow[]> {
  const proc = Bun.spawn(
    [
      "docker",
      "exec",
      "-i",
      container,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-t",
      "-A",
      "-c",
      sql,
    ],
    {
      stdout: "pipe",
      stderr: "pipe",
    }
  );

  const [exitCode, stdoutText, stderrText] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  if (exitCode !== 0) {
    const stderr = stderrText.trim();
    throw new Error(
      `psql query failed (exit=${exitCode})${stderr ? `: ${stderr}` : ""}`
    );
  }

  const output = stdoutText.trim();
  if (!output || output === "null") {
    return [];
  }

  return JSON.parse(output) as PermitDatasetRow[];
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const sql = buildSql(args);
  const rows = await runPsqlJsonQuery(args.container, sql);

  const output = {
    generatedAt: new Date().toISOString(),
    source: {
      container: args.container,
      limit: args.limit,
      requireProject: args.requireProject,
      requireAddress: args.requireAddress,
      minDocCount: args.minDocCount,
      statuses: args.statuses,
    },
    permits: rows,
  };

  await mkdir(dirname(args.outputPath), { recursive: true });
  await Bun.write(args.outputPath, JSON.stringify(output, null, 2));

  console.log("=== Dataset Builder ===");
  console.log(`permits: ${rows.length}`);
  console.log(`out: ${args.outputPath}`);
}

main().catch((error) => {
  console.error("Failed:", error);
  process.exit(1);
});
