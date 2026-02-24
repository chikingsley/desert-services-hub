import type {
  CornerPosition,
  ExtractedIntersection,
  ExtractedPlanHints,
  ExtractedRoad,
  LatLng,
} from "./types";

export interface PermitDocumentContext {
  address: string | null;
  city: string | null;
  parcel: string | null;
  permitId: string;
  projectId: number | null;
  projectName: string | null;
}

export interface DocumentClueOptions {
  container?: string;
  county?: string;
  maxCharsPerDoc?: number;
  maxDocs?: number;
  state?: string;
}

export interface DocumentClueResult {
  debug: string[];
  docsUsed: number;
  extracted: {
    roads: number;
    intersections: number;
    hasCoordinates: boolean;
    hasEstimatedSize: boolean;
  };
  hints: ExtractedPlanHints;
}

export interface ProjectDocumentRow {
  documentType?: string | null;
  fileName?: string | null;
  id?: number;
  rawExtraction?: unknown;
  summary?: string | null;
}

interface RankedDoc {
  reason: string[];
  row: ProjectDocumentRow;
  score: number;
}

const DEFAULT_CONTAINER = "supabase_db_desert-services-hub";
const DEFAULT_STATE = "AZ";
const DEFAULT_COUNTY = "Maricopa";
const DEFAULT_MAX_DOCS = 8;
const DEFAULT_MAX_CHARS_PER_DOC = 180_000;

const ROAD_SUFFIXES = [
  "ST",
  "STREET",
  "AVE",
  "AVENUE",
  "RD",
  "ROAD",
  "DR",
  "DRIVE",
  "BLVD",
  "BOULEVARD",
  "LN",
  "LANE",
  "WAY",
  "CT",
  "COURT",
  "CIR",
  "CIRCLE",
  "PKWY",
  "PARKWAY",
  "HWY",
  "HIGHWAY",
  "PL",
  "PLACE",
  "TRL",
  "TRAIL",
] as const;

const ROAD_SUFFIX_PATTERN = `(?:${ROAD_SUFFIXES.join("|")})`;
const ROAD_NAME_PATTERN = `(?:\\b(?:N|S|E|W|NE|NW|SE|SW)\\b\\s+)?[A-Z0-9][A-Z0-9 .'-]{1,40}\\s${ROAD_SUFFIX_PATTERN}\\b`;
const ROAD_NAME_REGEX = new RegExp(ROAD_NAME_PATTERN, "g");
const INTERSECTION_REGEX = new RegExp(
  `(${ROAD_NAME_PATTERN})\\s*(?:AND|&)\\s*(${ROAD_NAME_PATTERN})`,
  "g"
);
const INTERSECTION_SLASH_REGEX = new RegExp(
  `(${ROAD_NAME_PATTERN})\\s*\\/\\s*(${ROAD_NAME_PATTERN})`,
  "g"
);
const ADDRESS_REGEX = new RegExp(
  `\\b\\d{1,6}\\s+(?:N|S|E|W)?\\s*[A-Z0-9 .'-]{2,40}\\s${ROAD_SUFFIX_PATTERN}\\b`,
  "g"
);
const COORD_REGEX = /(-?\d{1,2}\.\d{4,})\s*[,/ ]\s*(-?\d{2,3}\.\d{4,})/g;
const APN_COORD_REGEX =
  /([0-9]{3}[-\s]?[0-9]{2}[-\s]?[0-9A-Z]{3,4})\s+(-?\d{1,2}\.\d{4,})\s*[,/ ]\s*(-?\d{2,3}\.\d{4,})/g;
const HAS_DIGIT_RE = /\d/;
const CORNER_NW_RE = /NORTH\s*WEST|\bNW\b/;
const CORNER_NE_RE = /NORTH\s*EAST|\bNE\b/;
const CORNER_SW_RE = /SOUTH\s*WEST|\bSW\b/;
const CORNER_SE_RE = /SOUTH\s*EAST|\bSE\b/;
const WHITESPACE_SPLIT_RE = /\s+/;
const ADDRESS_TOKEN_SKIP_RE = /^(ROAD|STREET|AVENUE|DRIVE|LANE)$/;
const PLAN_KEYWORDS_RE =
  /SWPPP|GRADING|DRAINAGE|SITE PLAN|DISTURBED|PARCEL|APN/;

const DEBUG_TEXT_KEYS = /text|content|summary|ocr|body|notes|extraction/i;

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) {
    return value;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeRoadName(value: string): string {
  return normalizeWhitespace(value)
    .replace(/\s+,/g, ",")
    .replace(/[;,.]+$/g, "")
    .toUpperCase();
}

function normalizeAddress(value: string): string {
  return normalizeWhitespace(value)
    .replace(/[;,.]+$/g, "")
    .toUpperCase();
}

function cleanAlphaNum(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  return value.replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

function extractPermitApnCandidates(
  parcelRaw: string | null | undefined
): string[] {
  if (!parcelRaw) {
    return [];
  }

  const rawTokens = parcelRaw.toUpperCase().match(/[0-9A-Z-]+/g) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];

  for (const token of rawTokens) {
    if (!HAS_DIGIT_RE.test(token)) {
      continue;
    }

    const clean = cleanAlphaNum(token);
    if (clean.length < 6 || seen.has(clean)) {
      continue;
    }

    seen.add(clean);
    out.push(clean);
  }

  return out;
}

function sharedPrefixLength(a: string, b: string): number {
  const limit = Math.min(a.length, b.length);
  let i = 0;
  while (i < limit && a[i] === b[i]) {
    i += 1;
  }
  return i;
}

function parseAzCoordinatePair(
  firstRaw: string,
  secondRaw: string
): LatLng | null {
  const first = Number(firstRaw);
  const second = Number(secondRaw);
  if (!(Number.isFinite(first) && Number.isFinite(second))) {
    return null;
  }

  const candidates: LatLng[] = [
    { lat: first, lng: second },
    { lat: second, lng: first },
  ];

  for (const c of candidates) {
    if (c.lat >= 30 && c.lat <= 38 && c.lng >= -116 && c.lng <= -108) {
      return c;
    }
  }

  return null;
}

function detectCornerPosition(context: string): CornerPosition {
  const text = context.toUpperCase();

  if (CORNER_NW_RE.test(text)) {
    return "northwest";
  }
  if (CORNER_NE_RE.test(text)) {
    return "northeast";
  }
  if (CORNER_SW_RE.test(text)) {
    return "southwest";
  }
  if (CORNER_SE_RE.test(text)) {
    return "southeast";
  }

  return "unknown";
}

function extractTextFromUnknown(value: unknown, maxChars: number): string {
  const chunks: string[] = [];
  let totalChars = 0;
  const stack: Array<{ value: unknown; key: string | null }> = [
    { value, key: null },
  ];

  while (stack.length > 0 && totalChars < maxChars) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    const node = current.value;
    if (typeof node === "string") {
      const text = normalizeWhitespace(node);
      if (!text) {
        continue;
      }

      const shouldInclude =
        current.key === null ||
        DEBUG_TEXT_KEYS.test(current.key) ||
        text.length > 160;
      if (!shouldInclude) {
        continue;
      }

      const remaining = maxChars - totalChars;
      const slice = text.slice(0, remaining);
      if (!slice) {
        continue;
      }

      chunks.push(slice);
      totalChars += slice.length + 1;
      continue;
    }

    if (Array.isArray(node)) {
      const limit = Math.min(node.length, 120);
      for (let i = limit - 1; i >= 0; i--) {
        stack.push({ value: node[i], key: current.key });
      }
      continue;
    }

    if (node && typeof node === "object") {
      const entries = Object.entries(node as Record<string, unknown>);
      for (let i = entries.length - 1; i >= 0; i--) {
        const entry = entries[i];
        if (!entry) {
          continue;
        }
        const [key, child] = entry;
        stack.push({ value: child, key });
      }
    }
  }

  return chunks.join("\n");
}

function extractRoads(text: string): ExtractedRoad[] {
  const counts = new Map<string, number>();

  for (const match of text.matchAll(ROAD_NAME_REGEX)) {
    const raw = match[0];
    if (!raw) {
      continue;
    }

    const normalized = normalizeRoadName(raw);
    if (normalized.length < 6) {
      continue;
    }

    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }

  const sorted = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 14)
    .map(([name], idx) => ({
      name,
      direction: "unknown" as const,
      isPrimary: idx < 2,
    }));

  return sorted;
}

function extractIntersections(text: string): ExtractedIntersection[] {
  const seen = new Set<string>();
  const out: ExtractedIntersection[] = [];

  const collect = (regex: RegExp): void => {
    regex.lastIndex = 0;

    for (const match of text.matchAll(regex)) {
      const road1Raw = match[1];
      const road2Raw = match[2];
      if (!(road1Raw && road2Raw)) {
        continue;
      }

      const road1 = normalizeRoadName(road1Raw);
      const road2 = normalizeRoadName(road2Raw);
      if (road1 === road2) {
        continue;
      }

      const key = [road1, road2].sort().join("||");
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      const full = match[0] ?? "";
      const idx = match.index ?? text.indexOf(full);
      const start = Math.max(0, idx - 90);
      const end = Math.min(text.length, idx + full.length + 90);
      const context = text.slice(start, end);

      out.push({
        road1,
        road2,
        cornerPosition: detectCornerPosition(context),
      });

      if (out.length >= 10) {
        return;
      }
    }
  };

  collect(INTERSECTION_REGEX);
  if (out.length < 10) {
    collect(INTERSECTION_SLASH_REGEX);
  }

  return out.slice(0, 10);
}

function coordinateKey(coord: LatLng): string {
  return `${coord.lat.toFixed(6)},${coord.lng.toFixed(6)}`;
}

function dedupeCoordinates(coords: LatLng[], maxCount = 12): LatLng[] {
  const out: LatLng[] = [];
  const seen = new Set<string>();

  for (const coord of coords) {
    const key = coordinateKey(coord);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    out.push(coord);

    if (out.length >= maxCount) {
      break;
    }
  }

  return out;
}

function extractCoordinatesFromApnPairs(
  text: string,
  permitApnCandidates: string[]
): LatLng[] {
  APN_COORD_REGEX.lastIndex = 0;

  const candidates: Array<{
    coordinate: LatLng;
    score: number;
    prefixScore: number;
    numericDistance: number;
  }> = [];

  for (const match of text.matchAll(APN_COORD_REGEX)) {
    const apnRaw = match[1];
    const firstRaw = match[2];
    const secondRaw = match[3];
    if (!(apnRaw && firstRaw && secondRaw)) {
      continue;
    }

    const coordinate = parseAzCoordinatePair(firstRaw, secondRaw);
    if (!coordinate) {
      continue;
    }

    const apnClean = cleanAlphaNum(apnRaw);
    if (apnClean.length < 6) {
      continue;
    }

    let bestPrefix = permitApnCandidates.length > 0 ? -1 : 0;
    let bestNumericDistance = Number.POSITIVE_INFINITY;

    for (const permitApn of permitApnCandidates) {
      const prefix = sharedPrefixLength(apnClean, permitApn);
      if (prefix > bestPrefix) {
        bestPrefix = prefix;
      }

      const apnDigits = Number(apnClean.replace(/[^0-9]/g, ""));
      const permitDigits = Number(permitApn.replace(/[^0-9]/g, ""));
      if (Number.isFinite(apnDigits) && Number.isFinite(permitDigits)) {
        const distance = Math.abs(apnDigits - permitDigits);
        if (distance < bestNumericDistance) {
          bestNumericDistance = distance;
        }
      }
    }

    if (permitApnCandidates.length > 0 && bestPrefix < 5) {
      continue;
    }

    const numericPenalty = Number.isFinite(bestNumericDistance)
      ? bestNumericDistance
      : 0;
    const score = bestPrefix * 1000 - numericPenalty;
    candidates.push({
      coordinate,
      score,
      prefixScore: bestPrefix,
      numericDistance: bestNumericDistance,
    });
  }

  if (candidates.length === 0) {
    return [];
  }

  candidates.sort(
    (a, b) =>
      b.score - a.score ||
      b.prefixScore - a.prefixScore ||
      a.numericDistance - b.numericDistance
  );

  return dedupeCoordinates(
    candidates.map((candidate) => candidate.coordinate),
    12
  );
}

function extractCoordinates(text: string): LatLng | null {
  COORD_REGEX.lastIndex = 0;

  for (const match of text.matchAll(COORD_REGEX)) {
    const firstRaw = match[1];
    const secondRaw = match[2];
    if (!(firstRaw && secondRaw)) {
      continue;
    }

    const coordinate = parseAzCoordinatePair(firstRaw, secondRaw);
    if (coordinate) {
      return coordinate;
    }
  }

  return null;
}

function extractDisturbedAcreage(text: string): number | null {
  const disturbedRegex =
    /(\d+(?:\.\d+)?)\s*ACRES?\s*(?:OF\s+)?(?:DISTURBED|DISTURBANCE|TO\s+BE\s+DISTURBED)/gi;
  const _anyAcreRegex = /(\d+(?:\.\d+)?)\s*ACRES?/gi;

  for (const match of text.matchAll(disturbedRegex)) {
    const raw = match[1];
    if (!raw) {
      continue;
    }
    const value = Number(raw);
    if (Number.isFinite(value) && value > 0 && value < 5000) {
      return value;
    }
  }

  return null;
}

function acreageToEstimatedSizeMeters(acres: number | null): number | null {
  if (!acres || acres <= 0) {
    return null;
  }

  const areaM2 = acres * 4046.856_422_4;
  const size = Math.sqrt(areaM2);
  if (!Number.isFinite(size)) {
    return null;
  }

  return Math.max(40, Math.min(1800, size));
}

function extractAddressCandidate(text: string): string | null {
  const match = ADDRESS_REGEX.exec(text);
  ADDRESS_REGEX.lastIndex = 0;
  if (!match?.[0]) {
    return null;
  }

  const normalized = normalizeAddress(match[0]);
  if (normalized.length < 8) {
    return null;
  }
  return normalized;
}

async function runPsqlJsonQuery(
  container: string,
  sql: string
): Promise<ProjectDocumentRow[]> {
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
      `document query failed (exit=${exitCode})${stderr ? `: ${stderr}` : ""}`
    );
  }

  const output = stdoutText.trim();
  if (!output || output === "null") {
    return [];
  }

  return JSON.parse(output) as ProjectDocumentRow[];
}

function fetchProjectDocuments(
  projectId: number,
  container: string,
  fetchLimit: number
): Promise<ProjectDocumentRow[]> {
  const safeProjectId = Math.floor(projectId);
  const safeLimit = Math.max(1, Math.min(160, Math.floor(fetchLimit)));

  const sql = `
SELECT COALESCE(json_agg(t), '[]'::json) AS rows
FROM (
  SELECT
    id,
    document_type AS "documentType",
    file_name AS "fileName",
    summary,
    raw_extraction AS "rawExtraction"
  FROM documents
  WHERE project_id = ${safeProjectId}
  ORDER BY created_at DESC
  LIMIT ${safeLimit}
) t;
`.trim();

  return runPsqlJsonQuery(container, sql);
}

function scoreDocumentForPermit(
  row: ProjectDocumentRow,
  permit: PermitDocumentContext
): RankedDoc {
  const reason: string[] = [];
  let score = 0;

  const docType = (row.documentType ?? "").toLowerCase();
  const permitId = (permit.permitId ?? "").toUpperCase();
  const parcelRaw = (permit.parcel ?? "").toUpperCase();
  const parcelClean = cleanAlphaNum(parcelRaw);
  const address = (permit.address ?? "").toUpperCase();
  const projectName = (permit.projectName ?? "").toUpperCase();

  const parsedRaw = parseJsonValue(row.rawExtraction);
  const textSample = extractTextFromUnknown(parsedRaw, 7000).toUpperCase();
  const haystack = [
    (row.fileName ?? "").toUpperCase(),
    (row.summary ?? "").toUpperCase(),
    textSample,
  ].join("\n");
  const haystackClean = cleanAlphaNum(haystack);

  if (permitId && haystack.includes(permitId)) {
    score += 20;
    reason.push("permitId");
  }

  if (parcelRaw && haystack.includes(parcelRaw)) {
    score += 16;
    reason.push("parcelRaw");
  }

  if (parcelClean && haystackClean.includes(parcelClean)) {
    score += 16;
    reason.push("parcelClean");
  }

  if (address) {
    const tokens = address
      .split(WHITESPACE_SPLIT_RE)
      .filter((t) => t.length >= 4 && !ADDRESS_TOKEN_SKIP_RE.test(t))
      .slice(0, 5);

    let tokenHits = 0;
    for (const token of tokens) {
      if (haystack.includes(token)) {
        tokenHits += 1;
      }
    }

    if (tokenHits > 0) {
      score += Math.min(10, tokenHits * 2);
      reason.push(`addressTokens:${tokenHits}`);
    }
  }

  if (projectName) {
    const tokens = projectName
      .split(WHITESPACE_SPLIT_RE)
      .filter((t) => t.length >= 4)
      .slice(0, 6);

    let tokenHits = 0;
    for (const token of tokens) {
      if (haystack.includes(token)) {
        tokenHits += 1;
      }
    }

    if (tokenHits > 0) {
      score += Math.min(10, tokenHits * 2);
      reason.push(`projectTokens:${tokenHits}`);
    }
  }

  if (PLAN_KEYWORDS_RE.test(haystack)) {
    score += 4;
    reason.push("planKeywords");
  }

  if (docType === "swppp_plan") {
    score += 7;
    reason.push("type:swppp_plan");
  } else if (docType === "unknown") {
    score += 3;
    reason.push("type:unknown");
  } else if (docType === "pdf_document") {
    score += 4;
    reason.push("type:pdf_document");
  } else if (docType === "estimate") {
    score -= 8;
    reason.push("type:estimate");
  } else if (docType === "spreadsheet") {
    score -= 10;
    reason.push("type:spreadsheet");
  }

  return { row, score, reason };
}

function rankDocumentsForPermit(
  rows: ProjectDocumentRow[],
  permit: PermitDocumentContext,
  maxDocs: number
): RankedDoc[] {
  const scored = rows.map((row) => scoreDocumentForPermit(row, permit));
  scored.sort((a, b) => b.score - a.score);

  const positive = scored.filter((doc) => doc.score > 0);
  if (positive.length >= 2) {
    return positive.slice(0, maxDocs);
  }

  return scored.slice(0, maxDocs);
}

export async function buildDocumentCluesForPermit(
  permit: PermitDocumentContext,
  options: DocumentClueOptions = {},
  cache: Map<number, ProjectDocumentRow[]> | null = null
): Promise<DocumentClueResult> {
  const container = options.container ?? DEFAULT_CONTAINER;
  const maxDocs = options.maxDocs ?? DEFAULT_MAX_DOCS;
  const maxCharsPerDoc = options.maxCharsPerDoc ?? DEFAULT_MAX_CHARS_PER_DOC;
  const state = options.state ?? DEFAULT_STATE;
  const county = options.county ?? DEFAULT_COUNTY;
  const debug: string[] = [];

  let rawDocs: ProjectDocumentRow[] = [];
  let docs: ProjectDocumentRow[] = [];

  if (permit.projectId && permit.projectId > 0) {
    if (cache?.has(permit.projectId)) {
      rawDocs = cache.get(permit.projectId) ?? [];
      debug.push(`documents from cache: ${rawDocs.length}`);
    } else {
      const fetchLimit = Math.max(maxDocs * 5, 30);
      rawDocs = await fetchProjectDocuments(
        permit.projectId,
        container,
        fetchLimit
      );
      cache?.set(permit.projectId, rawDocs);
      debug.push(`documents queried: ${rawDocs.length}`);
    }

    const ranked = rankDocumentsForPermit(rawDocs, permit, maxDocs);
    docs = ranked.map((r) => r.row);

    debug.push(`documents selected: ${docs.length}`);
    debug.push(
      `top relevance: ${ranked
        .slice(0, 3)
        .map((r) => `${r.row.id ?? "?"}:${r.score}`)
        .join(", ")}`
    );
  } else {
    debug.push("no project_id; skipped document lookup");
  }

  const textChunks: string[] = [];
  for (const row of docs) {
    if (row.fileName) {
      textChunks.push(String(row.fileName));
    }
    if (row.summary) {
      textChunks.push(String(row.summary));
    }

    const parsedRaw = parseJsonValue(row.rawExtraction);
    const extractedText = extractTextFromUnknown(parsedRaw, maxCharsPerDoc);
    if (extractedText) {
      textChunks.push(extractedText);
    }
  }

  const combinedText = textChunks.join("\n").toUpperCase();
  const permitApnCandidates = extractPermitApnCandidates(permit.parcel);
  const roads = combinedText ? extractRoads(combinedText) : [];
  const intersections = combinedText ? extractIntersections(combinedText) : [];
  const primaryCoordinate = combinedText
    ? extractCoordinates(combinedText)
    : null;
  const apnPairCoordinates = combinedText
    ? extractCoordinatesFromApnPairs(combinedText, permitApnCandidates)
    : [];
  const coordinateCandidates = dedupeCoordinates(
    [...(primaryCoordinate ? [primaryCoordinate] : []), ...apnPairCoordinates],
    12
  );
  const coordinates = coordinateCandidates[0] ?? null;
  const disturbedAcreage = combinedText
    ? extractDisturbedAcreage(combinedText)
    : null;
  const estimatedSizeMeters = acreageToEstimatedSizeMeters(disturbedAcreage);
  const fallbackAddress =
    !permit.address && combinedText
      ? extractAddressCandidate(combinedText)
      : null;

  if (fallbackAddress) {
    debug.push(`address extracted from docs: ${fallbackAddress}`);
  }
  if (disturbedAcreage) {
    debug.push(`disturbed acreage extracted: ${disturbedAcreage}`);
  }
  if (coordinateCandidates.length > 1) {
    debug.push(
      `coordinate candidates extracted: ${coordinateCandidates.length}`
    );
  }

  const hints: ExtractedPlanHints = {
    projectName: permit.projectName ?? null,
    parcelNumber: permit.parcel ?? null,
    address: permit.address ?? fallbackAddress,
    city: permit.city ?? null,
    state,
    county,
    roads,
    intersections,
    scaleInfo: disturbedAcreage ? `disturbed_acres=${disturbedAcreage}` : null,
    estimatedSizeMeters,
    coordinates,
    coordinateCandidates,
  };

  return {
    hints,
    docsUsed: docs.length,
    extracted: {
      roads: roads.length,
      intersections: intersections.length,
      hasCoordinates: Boolean(coordinates),
      hasEstimatedSize: Boolean(estimatedSizeMeters),
    },
    debug,
  };
}
