export interface InspectionSearchCandidate {
  isFolder: boolean;
  name: string;
  webUrl: string;
}

export interface RankedInspectionFolderCandidate {
  candidatePath: string | null;
  contractorSimilarity: number;
  inInspectionsTree: boolean;
  matchKind:
    | "exact_path"
    | "likely_existing_folder"
    | "possible_existing_folder"
    | "nearby_result";
  projectSimilarity: number;
  score: number;
  searchCandidate: InspectionSearchCandidate;
}

const SHAREPOINT_DOCS_MARKER = "/Shared Documents/";
const PROJECTS_ROOT = "SWPPP/INSPECTIONS/PROJECTS/";
const STOP_WORDS = new Set([
  "AND",
  "COMPANY",
  "CONSTRUCTION",
  "CONSTRUCTON",
  "CORP",
  "CORPORATION",
  "INC",
  "INCORPORATED",
  "LC",
  "LLC",
  "LP",
  "LTD",
]);

export function sharePointWebUrlToDrivePath(
  webUrl: string,
  isFolder: boolean
): string | null {
  const withoutQuery = webUrl.split("?")[0]?.split("#")[0] ?? "";
  const decoded = decodeURIComponent(withoutQuery);
  const markerIndex = decoded.indexOf(SHAREPOINT_DOCS_MARKER);
  if (markerIndex === -1) {
    return null;
  }

  let path = decoded.slice(markerIndex + SHAREPOINT_DOCS_MARKER.length);
  path = path.replace(/^\/+|\/+$/g, "");
  if (!path) {
    return null;
  }

  if (!isFolder) {
    const segments = path.split("/").filter(Boolean);
    segments.pop();
    path = segments.join("/");
  }

  return path || null;
}

export function buildInspectionSearchTerms(
  siteName: string,
  parsed: { contractor: string; project: string } | null
): string[] {
  const terms = [
    siteName.trim(),
    parsed?.project?.trim() ?? "",
    parsed?.contractor?.trim() ?? "",
    ...(parsed?.project
      ?.split(" - ")
      .map((part) => part.trim())
      .filter(Boolean) ?? []),
  ];

  const seen = new Set<string>();
  return terms.filter((term) => {
    if (!term) {
      return false;
    }
    const key = term.toUpperCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function extractStoredInspectionSiteName(input: {
  bodyText: string | null | undefined;
  subject: string | null | undefined;
}): string | null {
  const bodyText = input.bodyText ?? "";
  const bodyMatch = bodyText.match(
    /Site\/Location Name:\s*(.+?)(?=Site\/Location Address:|View\/Download Report|You are receiving this email|If you've received this email by mistake|Make sure you never miss a notification|Email support@compliancego\.com|Phone \(|Url www\.compliancego\.com|© 2007|\r|\n|$)/i
  );
  const fromBody = bodyMatch?.[1]?.trim();
  if (fromBody) {
    return fromBody;
  }

  const subject = input.subject?.trim() ?? "";
  const fromSubject = subject.replace(/\s*-\s*Inspection Report$/i, "").trim();
  return fromSubject || null;
}

export function rankInspectionFolderCandidates(input: {
  candidates: InspectionSearchCandidate[];
  expectedFolderPath: string | null;
  parsed: { contractor: string; project: string } | null;
  siteName: string;
}): RankedInspectionFolderCandidate[] {
  const ranked = input.candidates.map((candidate) => {
    const candidatePath = sharePointWebUrlToDrivePath(
      candidate.webUrl,
      candidate.isFolder
    );
    const expectedPath = input.expectedFolderPath?.trim() ?? null;
    const exactPath = Boolean(candidatePath && expectedPath === candidatePath);
    const inInspectionsTree = candidatePath?.startsWith(PROJECTS_ROOT) ?? false;
    const expectedProject = input.parsed?.project ?? input.siteName;
    const expectedContractor = input.parsed?.contractor ?? "";
    const candidateProject = getCandidateProjectName(candidatePath);
    const candidateContractor = getCandidateContractorName(candidatePath);
    const projectSimilarity = compareNames(expectedProject, candidateProject);
    const contractorSimilarity = compareNames(
      expectedContractor,
      candidateContractor
    );
    const siteSimilarity = compareNames(
      input.siteName,
      [candidateContractor, candidateProject].filter(Boolean).join(" - ")
    );

    let score = 0;
    if (exactPath) {
      score = 1;
    } else {
      score =
        (inInspectionsTree ? 0.2 : 0) +
        projectSimilarity * 0.55 +
        contractorSimilarity * 0.25 +
        siteSimilarity * 0.2;
      score = Math.min(score, 0.99);
    }

    return {
      candidatePath,
      contractorSimilarity,
      inInspectionsTree,
      matchKind: resolveMatchKind({
        exactPath,
        inInspectionsTree,
        contractorSimilarity,
        projectSimilarity,
      }),
      projectSimilarity,
      score,
      searchCandidate: candidate,
    } satisfies RankedInspectionFolderCandidate;
  });

  return ranked.sort((a, b) => b.score - a.score);
}

function resolveMatchKind(input: {
  contractorSimilarity: number;
  exactPath: boolean;
  inInspectionsTree: boolean;
  projectSimilarity: number;
}): RankedInspectionFolderCandidate["matchKind"] {
  if (input.exactPath) {
    return "exact_path";
  }
  if (
    input.inInspectionsTree &&
    input.projectSimilarity >= 0.85 &&
    input.contractorSimilarity >= 0.45
  ) {
    return "likely_existing_folder";
  }
  if (
    input.inInspectionsTree &&
    (input.projectSimilarity >= 0.65 || input.contractorSimilarity >= 0.65)
  ) {
    return "possible_existing_folder";
  }
  return "nearby_result";
}

function getCandidateProjectName(candidatePath: string | null): string {
  if (!candidatePath) {
    return "";
  }
  const segments = candidatePath.split("/").filter(Boolean);
  if (segments.length === 0) {
    return "";
  }
  const last = segments.at(-1) ?? "";
  if (/^\d{4}$/.test(last)) {
    return segments.at(-2) ?? "";
  }
  return last;
}

function getCandidateContractorName(candidatePath: string | null): string {
  if (!candidatePath) {
    return "";
  }
  const segments = candidatePath.split("/").filter(Boolean);
  const projectsIndex = segments.findIndex((segment) =>
    /^PROJECTS [A-Z]-[A-Z]$/i.test(segment)
  );
  if (projectsIndex >= 0) {
    return segments[projectsIndex + 1] ?? "";
  }
  const customerProjectsIndex = segments.findIndex(
    (segment) => segment === "Customer Projects"
  );
  if (customerProjectsIndex >= 0) {
    return segments[customerProjectsIndex + 3] ?? "";
  }
  return "";
}

function compareNames(expected: string, actual: string): number {
  const normalizedExpected = normalizeForComparison(expected);
  const normalizedActual = normalizeForComparison(actual);
  if (!(normalizedExpected && normalizedActual)) {
    return 0;
  }
  if (normalizedExpected === normalizedActual) {
    return 1;
  }

  const dice = diceCoefficient(
    normalizedExpected.replaceAll(" ", ""),
    normalizedActual.replaceAll(" ", "")
  );
  const overlap = tokenOverlap(normalizedExpected, normalizedActual);
  return Math.max(dice, overlap);
}

function normalizeForComparison(value: string): string {
  return value
    .toUpperCase()
    .replaceAll(/[^A-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token && !STOP_WORDS.has(token))
    .join(" ");
}

function tokenOverlap(a: string, b: string): number {
  const aTokens = new Set(a.split(/\s+/).filter(Boolean));
  const bTokens = new Set(b.split(/\s+/).filter(Boolean));
  if (aTokens.size === 0 || bTokens.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) {
      intersection += 1;
    }
  }

  return (2 * intersection) / (aTokens.size + bTokens.size);
}

function diceCoefficient(a: string, b: string): number {
  if (!(a && b)) {
    return 0;
  }
  if (a === b) {
    return 1;
  }
  if (a.length === 1 || b.length === 1) {
    return 0;
  }

  const aBigrams = toBigramCounts(a);
  const bBigrams = toBigramCounts(b);
  let overlap = 0;

  for (const [bigram, count] of aBigrams) {
    overlap += Math.min(count, bBigrams.get(bigram) ?? 0);
  }

  return (2 * overlap) / (a.length - 1 + (b.length - 1));
}

function toBigramCounts(value: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (let index = 0; index < value.length - 1; index += 1) {
    const bigram = value.slice(index, index + 2);
    counts.set(bigram, (counts.get(bigram) ?? 0) + 1);
  }
  return counts;
}
