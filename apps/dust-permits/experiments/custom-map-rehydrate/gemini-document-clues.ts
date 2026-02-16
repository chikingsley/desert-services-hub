import { createUserContent, GoogleGenAI } from "@google/genai";
import type { LatLng } from "./types";

export interface GeminiDocumentClueOptions {
  enabled: boolean;
  model: string;
  maxDocs: number;
  maxDocBytes: number;
  container?: string;
}

export interface GeminiDocumentClueResult {
  coordinates: LatLng[];
  apnCandidates: string[];
  docsTried: number;
  docsProcessed: number;
  debug: string[];
}

type DocumentRow = {
  id: number;
  fileName: string | null;
  filePath: string | null;
  documentType: string | null;
  emailId: number | null;
  attachmentId: number | null;
};

type GeminiExtraction = {
  apn_candidates?: string[];
  coordinates?: Array<{ lat?: number; lng?: number; context?: string | null }>;
  apn_coordinate_pairs?: Array<{
    apn?: string;
    lat?: number;
    lng?: number;
    context?: string | null;
  }>;
  disturbed_acres?: number | null;
  site_address?: string | null;
  notes?: string[];
};

const DEFAULT_CONTAINER = "supabase_db_desert-services-hub";

const PROMPT = [
  "Extract only machine-readable facts from this construction/SWPPP/grading PDF.",
  "Return strict JSON object:",
  "{",
  '  "apn_candidates": string[],',
  '  "coordinates": [{"lat": number, "lng": number, "context": string|null}],',
  '  "apn_coordinate_pairs": [{"apn": string, "lat": number, "lng": number, "context": string|null}],',
  '  "disturbed_acres": number|null,',
  '  "site_address": string|null,',
  '  "notes": string[]',
  "}",
  "Rules:",
  "- no guessing",
  "- if unknown, return null/[]",
  "- keep coordinate precision",
  "- include APN if present even without coordinates",
].join("\n");

function cleanApn(value: string): string {
  return value.replace(/[^A-Z0-9]/gi, "").toUpperCase();
}

function coordinateKey(coord: LatLng): string {
  return coord.lat.toFixed(6) + "," + coord.lng.toFixed(6);
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

function parseAzCoordinatePair(firstRaw: unknown, secondRaw: unknown): LatLng | null {
  const first = Number(firstRaw);
  const second = Number(secondRaw);
  if (!Number.isFinite(first) || !Number.isFinite(second)) {
    return null;
  }

  const candidates: Array<LatLng> = [
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

function normalizeExtraction(value: unknown): GeminiExtraction {
  if (!(value && typeof value === "object")) {
    return {};
  }
  return value as GeminiExtraction;
}

function sqlEscape(value: string): string {
  return value.replace(/'/g, "''");
}

async function runPsqlJsonQuery<T>(container: string, sql: string): Promise<T[]> {
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
    { stdout: "pipe", stderr: "pipe" },
  );

  const [exitCode, stdoutText, stderrText] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  if (exitCode !== 0) {
    throw new Error(
      `gemini clue query failed (exit=${exitCode}): ${stderrText.trim() || "unknown"}`,
    );
  }

  const output = stdoutText.trim();
  if (!output || output === "null") {
    return [];
  }

  return JSON.parse(output) as T[];
}

async function loadProjectDocs(
  projectId: number,
  maxRows: number,
  container: string,
): Promise<DocumentRow[]> {
  const safeProjectId = Math.floor(projectId);
  const safeLimit = Math.max(1, Math.min(60, Math.floor(maxRows)));

  const sql = `
SELECT COALESCE(json_agg(t), '[]'::json)
FROM (
  SELECT
    id,
    file_name AS "fileName",
    file_path AS "filePath",
    document_type AS "documentType",
    email_id AS "emailId",
    attachment_id AS "attachmentId"
  FROM documents
  WHERE project_id = ${safeProjectId}
    AND attachment_id IS NOT NULL
    AND file_name ILIKE '%.pdf'
  ORDER BY
    CASE
      WHEN document_type = 'swppp_plan' THEN 0
      WHEN file_name ILIKE '%swppp%' THEN 1
      WHEN file_name ILIKE '%grading%' OR file_name ILIKE '%drain%' THEN 2
      WHEN file_name ILIKE '%site%' OR file_name ILIKE '%plan%' THEN 3
      ELSE 9
    END,
    created_at DESC
  LIMIT ${safeLimit}
) t;
`.trim();

  return runPsqlJsonQuery<DocumentRow>(container, sql);
}

async function readFromDisk(
  filePath: string,
): Promise<{ ok: boolean; bytes: ArrayBuffer | null; error: string | null }> {
  try {
    const file = Bun.file(filePath);
    if (!(await file.exists())) {
      return { ok: false, bytes: null, error: "not found on disk" };
    }

    const bytes = await file.arrayBuffer();
    return { ok: true, bytes, error: null };
  } catch (error) {
    return {
      ok: false,
      bytes: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function downloadAttachment(
  emailId: number,
  attachmentId: number,
): Promise<{ ok: boolean; bytes: ArrayBuffer | null; error: string | null }> {
  const url = `http://localhost:3000/api/emails/${emailId}/attachments/db:${attachmentId}/download`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      const body = await response.text();
      return {
        ok: false,
        bytes: null,
        error: `download ${response.status}: ${body.slice(0, 200)}`,
      };
    }

    const bytes = await response.arrayBuffer();
    return { ok: true, bytes, error: null };
  } catch (error) {
    return {
      ok: false,
      bytes: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function resolveDocumentBytes(doc: DocumentRow): Promise<{
  ok: boolean;
  bytes: ArrayBuffer | null;
  source: "disk" | "attachment_api";
  error: string | null;
}> {
  if (doc.filePath && doc.filePath.trim().length > 0) {
    const diskResult = await readFromDisk(doc.filePath.trim());
    if (diskResult.ok && diskResult.bytes) {
      return {
        ok: true,
        bytes: diskResult.bytes,
        source: "disk",
        error: null,
      };
    }
  }

  if (doc.emailId && doc.attachmentId) {
    const download = await downloadAttachment(doc.emailId, doc.attachmentId);
    if (download.ok && download.bytes) {
      return {
        ok: true,
        bytes: download.bytes,
        source: "attachment_api",
        error: null,
      };
    }

    return {
      ok: false,
      bytes: null,
      source: "attachment_api",
      error: download.error,
    };
  }

  return {
    ok: false,
    bytes: null,
    source: "attachment_api",
    error: "missing email/attachment ids and disk file unavailable",
  };
}

async function extractFromPdf(
  ai: GoogleGenAI,
  model: string,
  bytes: ArrayBuffer,
): Promise<GeminiExtraction> {
  const base64 = Buffer.from(bytes).toString("base64");
  const response = await ai.models.generateContent({
    model,
    contents: createUserContent([
      {
        inlineData: {
          mimeType: "application/pdf",
          data: base64,
        },
      },
      PROMPT,
    ]),
    config: { responseMimeType: "application/json" },
  });

  const text = response.text ?? "{}";
  try {
    return normalizeExtraction(JSON.parse(text));
  } catch {
    return {};
  }
}

export async function buildGeminiDocumentCluesForPermit(
  permitId: string,
  projectId: number | null,
  options: GeminiDocumentClueOptions,
): Promise<GeminiDocumentClueResult> {
  const debug: string[] = [];

  if (!options.enabled) {
    return {
      coordinates: [],
      apnCandidates: [],
      docsTried: 0,
      docsProcessed: 0,
      debug,
    };
  }

  if (!(projectId && projectId > 0)) {
    debug.push("gemini: skipped (no project_id)");
    return {
      coordinates: [],
      apnCandidates: [],
      docsTried: 0,
      docsProcessed: 0,
      debug,
    };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    debug.push("gemini: skipped (GEMINI_API_KEY missing)");
    return {
      coordinates: [],
      apnCandidates: [],
      docsTried: 0,
      docsProcessed: 0,
      debug,
    };
  }

  const ai = new GoogleGenAI({ apiKey });
  const container = options.container ?? DEFAULT_CONTAINER;

  const docs = await loadProjectDocs(projectId, options.maxDocs * 4, container);
  const picked = docs.slice(0, Math.max(1, options.maxDocs));

  const coordinates: LatLng[] = [];
  const apnCandidates = new Set<string>();
  let docsProcessed = 0;

  for (const doc of picked) {
    const resolved = await resolveDocumentBytes(doc);
    if (!(resolved.ok && resolved.bytes)) {
      debug.push(`gemini: doc ${doc.id} source failed (${resolved.error ?? "unknown"})`);
      continue;
    }

    if (resolved.bytes.byteLength > options.maxDocBytes) {
      debug.push(`gemini: doc ${doc.id} skipped oversized (${resolved.bytes.byteLength} bytes)`);
      continue;
    }

    try {
      const extracted = await extractFromPdf(ai, options.model, resolved.bytes);
      const directCoordinates = Array.isArray(extracted.coordinates)
        ? extracted.coordinates
            .map((item) => parseAzCoordinatePair(item.lat, item.lng))
            .filter((coord): coord is LatLng => Boolean(coord))
        : [];

      const pairCoordinates = Array.isArray(extracted.apn_coordinate_pairs)
        ? extracted.apn_coordinate_pairs
            .map((pair) => {
              if (typeof pair.apn === "string") {
                const apnClean = cleanApn(pair.apn);
                if (apnClean.length >= 6) {
                  apnCandidates.add(apnClean);
                }
              }
              return parseAzCoordinatePair(pair.lat, pair.lng);
            })
            .filter((coord): coord is LatLng => Boolean(coord))
        : [];

      const directApns = Array.isArray(extracted.apn_candidates)
        ? extracted.apn_candidates
            .map((value) => cleanApn(value))
            .filter((value) => value.length >= 6)
        : [];

      for (const apn of directApns) {
        apnCandidates.add(apn);
      }

      coordinates.push(...directCoordinates, ...pairCoordinates);
      docsProcessed += 1;

      debug.push(
        `gemini: doc ${doc.id} extracted source=${resolved.source} coords=${directCoordinates.length + pairCoordinates.length} apns=${directApns.length}`,
      );
    } catch (error) {
      debug.push(
        `gemini: doc ${doc.id} extraction failed (${error instanceof Error ? error.message : String(error)})`,
      );
    }
  }

  debug.push(
    `gemini: permit ${sqlEscape(permitId)} docs_tried=${picked.length} docs_processed=${docsProcessed}`,
  );

  return {
    coordinates: dedupeCoordinates(coordinates, 14),
    apnCandidates: [...apnCandidates],
    docsTried: picked.length,
    docsProcessed,
    debug,
  };
}
