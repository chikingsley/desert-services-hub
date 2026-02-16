#!/usr/bin/env bun

import { db } from "@lib/db/hub";
import { EMAIL_RESOLVER_SPARK_MODEL } from "@background-jobs/jobs/config";
import type {
  ApplyProjectContactResolutionResult,
  ResolveProjectContactsOptions,
} from "@background-jobs/lib/project-contact-resolver";
import {
  applyProjectContactResolution,
  resolveProjectContacts,
} from "@background-jobs/lib/project-contact-resolver";

type Scope = "project" | "active" | "seed" | "all";

interface CliOptions {
  scope: Scope;
  projectId: number | null;
  limitProjects: number;
  limitEmails: number;
  limitDocuments: number;
  limitAttachments: number;
  model: string;
  timeoutMs: number;
  apply: boolean;
  outputPath: string | null;
  createThreshold: number;
}

interface ProjectRunResult {
  projectId: number;
  resolution: Awaited<ReturnType<typeof resolveProjectContacts>>;
  applySummary: ApplyProjectContactResolutionResult | null;
}

function usage(): void {
  console.log(
    [
      "Usage:",
      "  bun apps/webhooks/cli/project-contact-resolver.ts [options]",
      "",
      "Options:",
      "  --project-id <id>         Single project run (scope=project)",
      "  --scope <project|active|seed|all>  Backfill scope (default: project)",
      "  --limit-projects <n>      Max projects to process for non-project scope (default: 25)",
      "  --limit-emails <n>        Emails to scan per project (default: 250)",
      "  --limit-documents <n>     Documents to scan per project (default: 140)",
      "  --limit-attachments <n>   Attachments to scan per project (default: 180)",
      `  --model <name>            Spark model for opencode (default: ${EMAIL_RESOLVER_SPARK_MODEL})`,
      "  --timeout-ms <n>          opencode timeout in ms (default: 180000)",
      "  --create-threshold <0..1> Confidence threshold for create_contact (default: 0.72)",
      "  --apply                   Write links/contacts to DB",
      "  --output <path>           Write JSON report",
      "  --help                    Show this help",
      "",
      "Examples:",
      "  bun apps/webhooks/cli/project-contact-resolver.ts --project-id 23",
      "  bun apps/webhooks/cli/project-contact-resolver.ts --project-id 23 --apply",
      "  bun apps/webhooks/cli/project-contact-resolver.ts --scope active --limit-projects 50 --apply",
    ].join("\n")
  );
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
}

function parseProbability(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseFloat(raw ?? "");
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  if (parsed < 0) {
    return 0;
  }
  if (parsed > 1) {
    return 1;
  }
  return parsed;
}

function parseScope(raw: string | undefined, fallback: Scope): Scope {
  if (!raw) {
    return fallback;
  }
  const normalized = raw.trim().toLowerCase();
  if (
    normalized === "project" ||
    normalized === "active" ||
    normalized === "seed" ||
    normalized === "all"
  ) {
    return normalized;
  }
  return fallback;
}

function parseArgs(argv: string[]): CliOptions {
  let scope: Scope = "project";
  let projectId: number | null = null;
  let limitProjects = 25;
  let limitEmails = 250;
  let limitDocuments = 140;
  let limitAttachments = 180;
  let model = EMAIL_RESOLVER_SPARK_MODEL;
  let timeoutMs = 180_000;
  let apply = false;
  let outputPath: string | null = null;
  let createThreshold = 0.72;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    switch (arg) {
      case "--scope": {
        scope = parseScope(argv[i + 1], scope);
        i++;
        break;
      }
      case "--project-id": {
        const value = Number.parseInt(argv[i + 1] ?? "", 10);
        projectId = Number.isInteger(value) && value > 0 ? value : null;
        i++;
        break;
      }
      case "--limit-projects": {
        limitProjects = parsePositiveInt(argv[i + 1], limitProjects);
        i++;
        break;
      }
      case "--limit-emails": {
        limitEmails = parsePositiveInt(argv[i + 1], limitEmails);
        i++;
        break;
      }
      case "--limit-documents": {
        limitDocuments = parsePositiveInt(argv[i + 1], limitDocuments);
        i++;
        break;
      }
      case "--limit-attachments": {
        limitAttachments = parsePositiveInt(argv[i + 1], limitAttachments);
        i++;
        break;
      }
      case "--model": {
        model = (argv[i + 1] ?? "").trim() || model;
        i++;
        break;
      }
      case "--timeout-ms": {
        timeoutMs = parsePositiveInt(argv[i + 1], timeoutMs);
        i++;
        break;
      }
      case "--create-threshold": {
        createThreshold = parseProbability(argv[i + 1], createThreshold);
        i++;
        break;
      }
      case "--apply": {
        apply = true;
        break;
      }
      case "--output": {
        outputPath = (argv[i + 1] ?? "").trim() || null;
        i++;
        break;
      }
      case "--help":
      case "-h": {
        usage();
        process.exit(0);
      }
      default: {
        throw new Error(`Unknown argument: ${arg}`);
      }
    }
  }

  if (scope === "project" && !projectId) {
    throw new Error("--project-id is required when --scope=project");
  }

  if (projectId) {
    scope = "project";
  }

  return {
    apply,
    createThreshold,
    limitAttachments,
    limitDocuments,
    limitEmails,
    limitProjects,
    model,
    outputPath,
    projectId,
    scope,
    timeoutMs,
  };
}

async function loadProjectIds(options: CliOptions): Promise<number[]> {
  if (options.scope === "project") {
    return options.projectId ? [options.projectId] : [];
  }

  let where = "";
  if (options.scope === "active") {
    where = "WHERE lifecycle_state = 'active'";
  } else if (options.scope === "seed") {
    where = "WHERE lifecycle_state = 'seed'";
  }

  const rows = (await db
    .query<{ id: number }, [number]>(
      `SELECT id
       FROM projects
       ${where}
       ORDER BY updated_at DESC, id DESC
       LIMIT ?`
    )
    .all(options.limitProjects)) as { id: number }[];

  return rows.map((row) => row.id);
}

function countActions(
  resolution: Awaited<ReturnType<typeof resolveProjectContacts>>
): Record<string, number> {
  const out: Record<string, number> = {
    already_linked: 0,
    create_contact: 0,
    link_existing_contact: 0,
    skip_low_confidence: 0,
  };

  for (const proposal of resolution.proposals) {
    out[proposal.action] = (out[proposal.action] ?? 0) + 1;
  }

  return out;
}

function toResolverOptions(options: CliOptions): ResolveProjectContactsOptions {
  return {
    createThreshold: options.createThreshold,
    limitAttachments: options.limitAttachments,
    limitDocuments: options.limitDocuments,
    limitEmails: options.limitEmails,
    model: options.model,
    requireLlm: true,
    timeoutMs: options.timeoutMs,
  };
}

function printProjectSummary(
  run: ProjectRunResult,
  index: number,
  total: number
): void {
  const counts = countActions(run.resolution);
  const coverage = run.resolution.existingCoverage;

  console.log(
    `[project-contact-resolver] ${index}/${total} project #${run.resolution.project.id} ${run.resolution.project.name}`
  );
  console.log(
    `  candidates=${run.resolution.candidates.length} proposals=${run.resolution.proposals.length} (already=${counts.already_linked}, link=${counts.link_existing_contact}, create=${counts.create_contact}, skip=${counts.skip_low_confidence})`
  );
  console.log(
    `  coverage_before estimate_contacts=${coverage.estimateContacts} email_contacts=${coverage.emailContacts}`
  );

  if (run.resolution.llm.attempted) {
    const llmState = run.resolution.llm.succeeded
      ? `ok contacts=${run.resolution.llm.contactsReturned}`
      : `error=${run.resolution.llm.error ?? "unknown"}`;
    console.log(`  spark ${llmState}`);
  }

  if (run.applySummary) {
    console.log(
      `  apply created=${run.applySummary.contactsCreated} estimate_links=${run.applySummary.estimateLinksInserted} email_links=${run.applySummary.emailLinksInserted} contact_accounts=${run.applySummary.contactsAccountAttached} estimate_accounts=${run.applySummary.estimatesAccountAttached}`
    );
  }
}

function printFinalSummary(runs: ProjectRunResult[]): void {
  let totalCandidates = 0;
  let totalProposals = 0;
  let totalCreate = 0;
  let totalLink = 0;
  let totalSkip = 0;
  let totalAlready = 0;

  let contactsCreated = 0;
  let estimateLinksInserted = 0;
  let emailLinksInserted = 0;
  let contactsAccountAttached = 0;
  let estimatesAccountAttached = 0;

  for (const run of runs) {
    totalCandidates += run.resolution.candidates.length;
    totalProposals += run.resolution.proposals.length;
    for (const proposal of run.resolution.proposals) {
      if (proposal.action === "create_contact") {
        totalCreate++;
      } else if (proposal.action === "link_existing_contact") {
        totalLink++;
      } else if (proposal.action === "skip_low_confidence") {
        totalSkip++;
      } else if (proposal.action === "already_linked") {
        totalAlready++;
      }
    }

    if (run.applySummary) {
      contactsCreated += run.applySummary.contactsCreated;
      estimateLinksInserted += run.applySummary.estimateLinksInserted;
      emailLinksInserted += run.applySummary.emailLinksInserted;
      contactsAccountAttached += run.applySummary.contactsAccountAttached;
      estimatesAccountAttached += run.applySummary.estimatesAccountAttached;
    }
  }

  console.log("\n[project-contact-resolver] summary");
  console.log(
    `  projects=${runs.length} candidates=${totalCandidates} proposals=${totalProposals}`
  );
  console.log(
    `  proposed already=${totalAlready} link_existing=${totalLink} create=${totalCreate} skip=${totalSkip}`
  );

  if (runs.some((run) => run.applySummary !== null)) {
    console.log(
      `  applied contacts_created=${contactsCreated} estimate_links_inserted=${estimateLinksInserted} email_links_inserted=${emailLinksInserted} contacts_account_attached=${contactsAccountAttached} estimates_account_attached=${estimatesAccountAttached}`
    );
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const projectIds = await loadProjectIds(options);

  if (projectIds.length === 0) {
    console.log("[project-contact-resolver] no projects matched scope");
    return;
  }

  console.log(
    `[project-contact-resolver] start scope=${options.scope} projects=${projectIds.length} apply=${options.apply} llmRequired=true model=${options.model}`
  );

  const runs: ProjectRunResult[] = [];
  const resolverOptions = toResolverOptions(options);

  for (let i = 0; i < projectIds.length; i++) {
    const projectId = projectIds[i];
    if (typeof projectId !== "number") {
      continue;
    }

    const resolution = await resolveProjectContacts(projectId, resolverOptions);
    const applySummary = options.apply
      ? await applyProjectContactResolution(resolution)
      : null;

    const run: ProjectRunResult = { applySummary, projectId, resolution };
    runs.push(run);

    printProjectSummary(run, i + 1, projectIds.length);
  }

  printFinalSummary(runs);

  if (options.outputPath) {
    const payload = {
      generatedAt: new Date().toISOString(),
      options,
      projects: runs.map((run) => ({
        applySummary: run.applySummary,
        projectId: run.projectId,
        resolution: run.resolution,
      })),
    };

    await Bun.write(
      options.outputPath,
      `${JSON.stringify(payload, null, 2)}\n`
    );
    console.log(`[project-contact-resolver] wrote ${options.outputPath}`);
  }
}

main().catch((error) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(`[project-contact-resolver] fatal: ${message}`);
  process.exit(1);
});
