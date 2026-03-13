import { getProjectsFolder, sanitizeName } from "@sharepoint/paths";
import type { SwpppProject } from "@sharepoint/swppp/client";

export interface SourceProjectSummary {
  canonicalPath: string;
  contractor: string;
  jobName: string;
  rowNumbers: number[];
  sourceCount: number;
  worksheets: string[];
}

export interface CurrentInspectionProjectSummary {
  contractor: string;
  path: string;
  project: string;
  yearFolders: string[];
}

export interface MissingCanonicalCandidate {
  contractorSimilarity: number;
  path: string;
  projectSimilarity: number;
  score: number;
}

export interface CanonicalProjectDiff {
  exactMatches: Array<{
    canonical: SourceProjectSummary;
    current: CurrentInspectionProjectSummary;
  }>;
  extraSharePoint: CurrentInspectionProjectSummary[];
  missingCanonical: Array<{
    canonical: SourceProjectSummary;
    topCandidates: MissingCanonicalCandidate[];
  }>;
}

export function buildCanonicalProjectPath(input: {
  contractor: string;
  jobName: string;
}): string {
  const contractor = sanitizeName(input.contractor);
  const project = sanitizeName(input.jobName);
  const bucket = getProjectsFolder(contractor);
  return `SWPPP/INSPECTIONS/PROJECTS/${bucket}/${contractor}/${project}`;
}

export function summarizeSourceProjects(
  projects: SwpppProject[]
): SourceProjectSummary[] {
  const grouped = new Map<string, SourceProjectSummary>();

  for (const project of projects) {
    const contractor = sanitizeName(project.contractor);
    const jobName = sanitizeName(project.jobName);
    if (!(contractor && jobName)) {
      continue;
    }

    const canonicalPath = buildCanonicalProjectPath({ contractor, jobName });
    const existing = grouped.get(canonicalPath);
    if (existing) {
      existing.sourceCount += 1;
      existing.rowNumbers.push(project.rowNumber);
      if (!existing.worksheets.includes(project.worksheet)) {
        existing.worksheets.push(project.worksheet);
        existing.worksheets.sort();
      }
      continue;
    }

    grouped.set(canonicalPath, {
      canonicalPath,
      contractor,
      jobName,
      rowNumbers: [project.rowNumber],
      sourceCount: 1,
      worksheets: [project.worksheet],
    });
  }

  return Array.from(grouped.values()).sort((a, b) =>
    a.canonicalPath.localeCompare(b.canonicalPath)
  );
}

export function summarizeCurrentInspectionProjects(
  rawProjects: Array<{ path: string; yearFolders: string[] }>
): CurrentInspectionProjectSummary[] {
  return rawProjects
    .map((item) => {
      const segments = item.path.split("/").filter(Boolean);
      const contractor = segments.at(-2) ?? "";
      const project = segments.at(-1) ?? "";
      return {
        contractor,
        path: item.path,
        project,
        yearFolders: [...item.yearFolders].sort(),
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

export function buildCanonicalProjectDiff(
  sourceProjects: SourceProjectSummary[],
  currentProjects: CurrentInspectionProjectSummary[]
): CanonicalProjectDiff {
  const currentByPath = new Map(currentProjects.map((project) => [project.path, project]));
  const exactMatchPaths = new Set<string>();
  const exactMatches: CanonicalProjectDiff["exactMatches"] = [];
  const missingCanonical: CanonicalProjectDiff["missingCanonical"] = [];

  for (const canonical of sourceProjects) {
    const exact = currentByPath.get(canonical.canonicalPath);
    if (exact) {
      exactMatches.push({ canonical, current: exact });
      exactMatchPaths.add(exact.path);
      continue;
    }

    const ranked = currentProjects
      .map((current) => ({
        contractorSimilarity: compareNames(
          canonical.contractor,
          current.contractor
        ),
        path: current.path,
        projectSimilarity: compareNames(canonical.jobName, current.project),
        score:
          compareNames(canonical.jobName, current.project) * 0.7 +
          compareNames(canonical.contractor, current.contractor) * 0.3,
      }))
      .filter((candidate) => candidate.score > 0.5)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    missingCanonical.push({
      canonical,
      topCandidates: ranked.map((candidate) => ({
        ...candidate,
        contractorSimilarity: round(candidate.contractorSimilarity),
        projectSimilarity: round(candidate.projectSimilarity),
        score: round(candidate.score),
      })),
    });
  }

  return {
    exactMatches,
    extraSharePoint: currentProjects.filter(
      (project) => !exactMatchPaths.has(project.path)
    ),
    missingCanonical,
  };
}

function compareNames(a: string, b: string): number {
  const left = normalizeForComparison(a);
  const right = normalizeForComparison(b);
  if (!(left && right)) {
    return 0;
  }
  if (left === right) {
    return 1;
  }
  return Math.max(tokenOverlap(left, right), diceCoefficient(left, right));
}

function normalizeForComparison(value: string): string {
  return value
    .toUpperCase()
    .replaceAll(/&AMP;/g, "AND")
    .replaceAll(/&/g, " AND ")
    .replaceAll(/[^A-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

function tokenOverlap(a: string, b: string): number {
  const aTokens = new Set(a.split(/\s+/).filter(Boolean));
  const bTokens = new Set(b.split(/\s+/).filter(Boolean));
  if (aTokens.size === 0 || bTokens.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) {
      overlap += 1;
    }
  }

  return (2 * overlap) / (aTokens.size + bTokens.size);
}

function diceCoefficient(a: string, b: string): number {
  const left = a.replaceAll(" ", "");
  const right = b.replaceAll(" ", "");
  if (!(left && right)) {
    return 0;
  }
  if (left === right) {
    return 1;
  }
  if (left.length < 2 || right.length < 2) {
    return 0;
  }

  const leftCounts = toBigramCounts(left);
  const rightCounts = toBigramCounts(right);
  let overlap = 0;

  for (const [bigram, count] of leftCounts) {
    overlap += Math.min(count, rightCounts.get(bigram) ?? 0);
  }

  return (2 * overlap) / (left.length - 1 + (right.length - 1));
}

function toBigramCounts(value: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (let index = 0; index < value.length - 1; index += 1) {
    const bigram = value.slice(index, index + 2);
    counts.set(bigram, (counts.get(bigram) ?? 0) + 1);
  }
  return counts;
}

function round(value: number): number {
  return Number(value.toFixed(3));
}
