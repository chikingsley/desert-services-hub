import {
  buildCanonicalProjectDiff,
  summarizeCurrentInspectionProjects,
  summarizeSourceProjects,
  type CurrentInspectionProjectSummary,
  type MissingCanonicalCandidate,
  type SourceProjectSummary,
} from "../../src/canonical-diff";
import { SharePointClient } from "@sharepoint/client";
import { SwpppMasterClient } from "@sharepoint/swppp/client";

const INVESTIGATION_ROOT = new URL("./", import.meta.url);
const OUTPUT_ROOT = new URL("./output/", INVESTIGATION_ROOT);
const INSPECTIONS_ROOTS = [
  "SWPPP/INSPECTIONS/PROJECTS/PROJECTS A-M",
  "SWPPP/INSPECTIONS/PROJECTS/PROJECTS N-Z",
] as const;

interface ProposedRename {
  canonicalPath: string;
  contractor: string;
  currentPath: string;
  jobName: string;
  score: number;
}

interface AmbiguousRenameGroup {
  currentPath: string;
  candidates: ProposedRename[];
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const swppp = new SwpppMasterClient();
  const sharePoint = new SharePointClient({
    azureTenantId: process.env.AZURE_TENANT_ID ?? "",
    azureClientId: process.env.AZURE_CLIENT_ID ?? "",
    azureClientSecret: process.env.AZURE_CLIENT_SECRET ?? "",
  });

  console.log("[canonical-diff] Loading canonical source projects from SWPPP workbook...");
  const allProjects = await swppp.getAllProjects();
  const sourceProjects = summarizeSourceProjects(allProjects);
  console.log(
    `[canonical-diff] Loaded ${allProjects.length} raw workbook rows -> ${sourceProjects.length} canonical projects`
  );

  console.log("[canonical-diff] Enumerating SharePoint inspection project folders...");
  const sharepointProjects = await listCurrentInspectionProjects(sharePoint);
  console.log(
    `[canonical-diff] Discovered ${sharepointProjects.length} SharePoint project folders`
  );

  const diff = buildCanonicalProjectDiff(sourceProjects, sharepointProjects);
  const { ambiguousRenameGroups, proposedRenames } = buildProposedRenames(
    diff.missingCanonical
  );
  const summary = buildSummary({
    ambiguousRenameGroups,
    startedAt,
    sourceProjects,
    sharepointProjects,
    diff,
    proposedRenames,
  });
  const summaryMarkdown = buildSummaryMarkdown(summary, proposedRenames, diff);

  await Bun.write(
    new URL("./source-projects.json", OUTPUT_ROOT),
    `${JSON.stringify(sourceProjects, null, 2)}\n`
  );
  await Bun.write(
    new URL("./sharepoint-projects.json", OUTPUT_ROOT),
    `${JSON.stringify(sharepointProjects, null, 2)}\n`
  );
  await Bun.write(
    new URL("./canonical-diff.json", OUTPUT_ROOT),
    `${JSON.stringify(diff, null, 2)}\n`
  );
  await Bun.write(
    new URL("./proposed-renames.json", OUTPUT_ROOT),
    `${JSON.stringify(proposedRenames, null, 2)}\n`
  );
  await Bun.write(
    new URL("./ambiguous-renames.json", OUTPUT_ROOT),
    `${JSON.stringify(ambiguousRenameGroups, null, 2)}\n`
  );
  await Bun.write(
    new URL("./summary.json", OUTPUT_ROOT),
    `${JSON.stringify(summary, null, 2)}\n`
  );
  await Bun.write(
    new URL("./summary.md", OUTPUT_ROOT),
    `${summaryMarkdown}\n`
  );

  console.log(
    `[canonical-diff] Wrote outputs under ${new URL("./output/", INVESTIGATION_ROOT).pathname}`
  );
}

async function listCurrentInspectionProjects(
  sharePoint: SharePointClient
): Promise<CurrentInspectionProjectSummary[]> {
  const projects: Array<{ path: string; yearFolders: string[] }> = [];

  for (const root of INSPECTIONS_ROOTS) {
    console.log(`[canonical-diff] Listing contractors under ${root}`);
    const contractors = await sharePoint.listFiles(root);
    const contractorFolders = contractors
      .filter((item) => item.folder)
      .map((item) => item.name)
      .sort();

    for (const contractor of contractorFolders) {
      const contractorPath = `${root}/${contractor}`;
      const projectItems = await sharePoint.listFiles(contractorPath);
      const projectFolders = projectItems
        .filter((item) => item.folder)
        .map((item) => item.name)
        .sort();

      for (const project of projectFolders) {
        projects.push({
          path: `${contractorPath}/${project}`,
          yearFolders: [],
        });
      }
    }
  }

  return summarizeCurrentInspectionProjects(projects);
}

function buildProposedRenames(
  missingCanonical: ReturnType<typeof buildCanonicalProjectDiff>["missingCanonical"]
) {
  const rawCandidates = missingCanonical
    .map((entry) => {
      const top = entry.topCandidates[0];
      if (!top || top.score < 0.9) {
        return null;
      }
      return {
        canonicalPath: entry.canonical.canonicalPath,
        contractor: entry.canonical.contractor,
        currentPath: top.path,
        jobName: entry.canonical.jobName,
        score: top.score,
      } satisfies ProposedRename;
    })
    .filter((entry): entry is ProposedRename => Boolean(entry));

  const byCurrentPath = new Map<string, ProposedRename[]>();
  for (const candidate of rawCandidates) {
    const existing = byCurrentPath.get(candidate.currentPath);
    if (existing) {
      existing.push(candidate);
    } else {
      byCurrentPath.set(candidate.currentPath, [candidate]);
    }
  }

  const ambiguousRenameGroups: AmbiguousRenameGroup[] = [];
  const proposedRenames: ProposedRename[] = [];

  for (const [currentPath, candidates] of byCurrentPath) {
    if (candidates.length > 1) {
      ambiguousRenameGroups.push({
        currentPath,
        candidates: candidates.sort((a, b) => b.score - a.score),
      });
      continue;
    }
    proposedRenames.push(candidates[0]!);
  }

  ambiguousRenameGroups.sort((a, b) => a.currentPath.localeCompare(b.currentPath));
  proposedRenames.sort((a, b) => a.currentPath.localeCompare(b.currentPath));
  return { ambiguousRenameGroups, proposedRenames };
}

function buildSummary(input: {
  ambiguousRenameGroups: AmbiguousRenameGroup[];
  diff: ReturnType<typeof buildCanonicalProjectDiff>;
  proposedRenames: ProposedRename[];
  sharepointProjects: CurrentInspectionProjectSummary[];
  sourceProjects: SourceProjectSummary[];
  startedAt: string;
}) {
  const highConfidenceMissing = input.diff.missingCanonical.filter(
    (entry) => (entry.topCandidates[0]?.score ?? 0) >= 0.9
  ).length;
  const unresolvedMissing = input.diff.missingCanonical.filter(
    (entry) => (entry.topCandidates[0]?.score ?? 0) < 0.9
  ).length;

  return {
    generatedAt: new Date().toISOString(),
    startedAt: input.startedAt,
    totals: {
      exactMatches: input.diff.exactMatches.length,
      ambiguousRenamePaths: input.ambiguousRenameGroups.length,
      extraSharePointFolders: input.diff.extraSharePoint.length,
      highConfidenceRenameCandidates: highConfidenceMissing,
      missingCanonicalFolders: input.diff.missingCanonical.length,
      proposedRenames: input.proposedRenames.length,
      sharepointProjects: input.sharepointProjects.length,
      sourceProjects: input.sourceProjects.length,
      unresolvedMissingCanonical: unresolvedMissing,
    },
  };
}

function buildSummaryMarkdown(
  summary: ReturnType<typeof buildSummary>,
  proposedRenames: ProposedRename[],
  diff: ReturnType<typeof buildCanonicalProjectDiff>
): string {
  const lines = [
    "# SWPPP Canonical Folder Diff Summary",
    "",
    `Generated: \`${summary.generatedAt}\``,
    "",
    "## Totals",
    "",
    `- Canonical source projects: \`${summary.totals.sourceProjects}\``,
    `- Current SharePoint project folders: \`${summary.totals.sharepointProjects}\``,
    `- Exact canonical matches: \`${summary.totals.exactMatches}\``,
    `- Missing canonical folders: \`${summary.totals.missingCanonicalFolders}\``,
    `- High-confidence rename candidates: \`${summary.totals.highConfidenceRenameCandidates}\``,
    `- Ambiguous high-confidence rename paths: \`${summary.totals.ambiguousRenamePaths}\``,
    `- Unresolved missing canonical folders: \`${summary.totals.unresolvedMissingCanonical}\``,
    `- Extra non-canonical SharePoint folders: \`${summary.totals.extraSharePointFolders}\``,
    "",
    "## Proposed Renames",
    "",
  ];

  if (proposedRenames.length === 0) {
    lines.push("No high-confidence rename candidates found.");
  } else {
    lines.push(
      "| Score | Current Path | Canonical Path |",
      "| --- | --- | --- |"
    );
    for (const rename of proposedRenames.slice(0, 100)) {
      lines.push(
        `| ${rename.score} | ${escapePipes(rename.currentPath)} | ${escapePipes(rename.canonicalPath)} |`
      );
    }
  }

  lines.push("", "## Unresolved Canonical Folders", "");
  lines.push(
    "| Job | Canonical Path | Top Candidate | Score |",
    "| --- | --- | --- | --- |"
  );

  for (const entry of diff.missingCanonical
    .filter((item) => (item.topCandidates[0]?.score ?? 0) < 0.9)
    .slice(0, 100)) {
    const top = entry.topCandidates[0];
    lines.push(
      `| ${escapePipes(entry.canonical.jobName)} | ${escapePipes(entry.canonical.canonicalPath)} | ${escapePipes(top?.path ?? "N/A")} | ${top?.score ?? "N/A"} |`
    );
  }

  return lines.join("\n");
}

function escapePipes(value: string): string {
  return value.replaceAll("|", "\\|");
}

main().catch((error) => {
  console.error("[canonical-diff] Failed:", error);
  process.exit(1);
});
