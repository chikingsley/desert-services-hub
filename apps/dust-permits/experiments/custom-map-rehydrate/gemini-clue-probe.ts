#!/usr/bin/env bun

import { mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createUserContent, GoogleGenAI } from "@google/genai";

interface BenchmarkResult {
  permitId: string;
  status: "scored" | "skipped" | "error";
  metrics: { iou: number } | null;
  hints: {
    projectName: string | null;
    parcelRaw: string | null;
    address: string | null;
    city: string | null;
  };
}

interface BenchmarkInput {
  results?: BenchmarkResult[];
}

interface PermitRow {
  permitId: string;
  projectId: number | null;
  projectName: string | null;
  address: string | null;
  city: string | null;
  parcel: string | null;
}

interface DocumentRow {
  id: number;
  fileName: string | null;
  documentType: string | null;
  emailId: number | null;
  attachmentId: number | null;
  createdAt: string | null;
}

interface ProbeExtraction {
  apn_candidates: string[];
  coordinates: Array<{ lat: number; lng: number; context: string | null }>;
  apn_coordinate_pairs: Array<{
    apn: string;
    lat: number;
    lng: number;
    context: string | null;
  }>;
  disturbed_acres: number | null;
  site_address: string | null;
  notes: string[];
}

interface PermitProbeResult {
  permitId: string;
  iou: number | null;
  projectId: number | null;
  projectName: string | null;
  parcel: string | null;
  docsAttempted: number;
  docsSucceeded: number;
  docs: Array<{
    docId: number;
    fileName: string | null;
    documentType: string | null;
    emailId: number | null;
    attachmentId: number | null;
    downloadOk: boolean;
    bytes: number | null;
    error: string | null;
    extraction: ProbeExtraction | null;
  }>;
}

interface CliArgs {
  benchmarkPath: string;
  outPath: string;
  maxPermits: number;
  maxDocsPerPermit: number;
  maxDocBytes: number;
  maxIou: number;
  permitIds: string[];
  model: string;
}

const DEFAULT_CONTAINER = "supabase_db_desert-services-hub";
const DEFAULT_BENCHMARK_PATH =
  "experiments/custom-map-rehydrate/out/benchmark-doc-coord-final-v4.json";

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

function parseArgs(argv: string[]): CliArgs {
  const args = [...argv];

  let benchmarkPath = DEFAULT_BENCHMARK_PATH;
  let outPath = "experiments/custom-map-rehydrate/out/gemini-clue-probe.json";
  let maxPermits = 5;
  let maxDocsPerPermit = 2;
  let maxDocBytes = 12 * 1024 * 1024;
  let maxIou = 0.25;
  const permitIds: string[] = [];
  let model = "gemini-2.5-flash";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) {
      continue;
    }

    if (arg === "--input") {
      benchmarkPath = args[i + 1] ?? benchmarkPath;
      i += 1;
      continue;
    }
    if (arg === "--out") {
      outPath = args[i + 1] ?? outPath;
      i += 1;
      continue;
    }
    if (arg === "--max-permits") {
      maxPermits = Number(args[i + 1] ?? String(maxPermits));
      i += 1;
      continue;
    }
    if (arg === "--max-docs") {
      maxDocsPerPermit = Number(args[i + 1] ?? String(maxDocsPerPermit));
      i += 1;
      continue;
    }
    if (arg === "--max-doc-bytes") {
      maxDocBytes = Number(args[i + 1] ?? String(maxDocBytes));
      i += 1;
      continue;
    }
    if (arg === "--max-iou") {
      maxIou = Number(args[i + 1] ?? String(maxIou));
      i += 1;
      continue;
    }
    if (arg === "--permit") {
      const permit = (args[i + 1] ?? "").trim();
      if (permit) {
        permitIds.push(permit);
      }
      i += 1;
      continue;
    }
    if (arg === "--model") {
      model = args[i + 1] ?? model;
      i += 1;
    }
  }

  return {
    benchmarkPath,
    outPath,
    maxPermits,
    maxDocsPerPermit,
    maxDocBytes,
    maxIou,
    permitIds,
    model,
  };
}

function sqlEscape(value: string): string {
  return value.replace(/'/g, "''");
}

async function runPsqlJsonQuery<T>(sql: string): Promise<T[]> {
  const proc = Bun.spawn(
    [
      "docker",
      "exec",
      "-i",
      DEFAULT_CONTAINER,
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
    { stdout: "pipe", stderr: "pipe" }
  );

  const [exitCode, stdoutText, stderrText] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);

  if (exitCode !== 0) {
    throw new Error(
      `psql failed (exit=${exitCode}): ${stderrText.trim() || "unknown"}`
    );
  }

  const output = stdoutText.trim();
  if (!output || output === "null") {
    return [];
  }

  return JSON.parse(output) as T[];
}

async function loadPermitContext(permitId: string): Promise<PermitRow | null> {
  const safe = sqlEscape(permitId);
  const sql = `
SELECT COALESCE(json_agg(t), '[]'::json)
FROM (
  SELECT
    id AS "permitId",
    project_id AS "projectId",
    project_name AS "projectName",
    address,
    city,
    parcel
  FROM dust_permits_filed_by_desert_services
  WHERE id = '${safe}'
  LIMIT 1
) t;
`.trim();

  const rows = await runPsqlJsonQuery<PermitRow>(sql);
  return rows[0] ?? null;
}

function loadProjectDocs(projectId: number): Promise<DocumentRow[]> {
  const safeProjectId = Math.floor(projectId);
  const sql = `
SELECT COALESCE(json_agg(t), '[]'::json)
FROM (
  SELECT
    id,
    file_name AS "fileName",
    document_type AS "documentType",
    email_id AS "emailId",
    attachment_id AS "attachmentId",
    created_at AS "createdAt"
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
  LIMIT 40
) t;
`.trim();

  return runPsqlJsonQuery<DocumentRow>(sql);
}

function normalizeExtraction(value: unknown): ProbeExtraction | null {
  if (!(value && typeof value === "object")) {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const apnCandidates = Array.isArray(raw.apn_candidates)
    ? raw.apn_candidates.filter((v): v is string => typeof v === "string")
    : [];

  const coordinates = Array.isArray(raw.coordinates)
    ? raw.coordinates
        .map((coord) => {
          const c = coord as Record<string, unknown>;
          const lat = Number(c.lat);
          const lng = Number(c.lng);
          if (!(Number.isFinite(lat) && Number.isFinite(lng))) {
            return null;
          }
          return {
            lat,
            lng,
            context: typeof c.context === "string" ? c.context : null,
          };
        })
        .filter(
          (
            item
          ): item is { lat: number; lng: number; context: string | null } =>
            Boolean(item)
        )
    : [];

  const apnCoordinatePairs = Array.isArray(raw.apn_coordinate_pairs)
    ? raw.apn_coordinate_pairs
        .map((pair) => {
          const p = pair as Record<string, unknown>;
          const apn = typeof p.apn === "string" ? p.apn : null;
          const lat = Number(p.lat);
          const lng = Number(p.lng);
          if (!(apn && Number.isFinite(lat) && Number.isFinite(lng))) {
            return null;
          }
          return {
            apn,
            lat,
            lng,
            context: typeof p.context === "string" ? p.context : null,
          };
        })
        .filter(
          (
            item
          ): item is {
            apn: string;
            lat: number;
            lng: number;
            context: string | null;
          } => Boolean(item)
        )
    : [];

  const disturbed = Number(raw.disturbed_acres);
  const disturbedAcreage = Number.isFinite(disturbed) ? disturbed : null;
  const siteAddress =
    typeof raw.site_address === "string" ? raw.site_address : null;
  const notes = Array.isArray(raw.notes)
    ? raw.notes.filter((v): v is string => typeof v === "string")
    : [];

  return {
    apn_candidates: apnCandidates,
    coordinates,
    apn_coordinate_pairs: apnCoordinatePairs,
    disturbed_acres: disturbedAcreage,
    site_address: siteAddress,
    notes,
  };
}

async function downloadAttachment(
  emailId: number,
  attachmentId: number
): Promise<{ ok: boolean; bytes: ArrayBuffer | null; error: string | null }> {
  const url = `http://localhost:3000/api/emails/${emailId}/attachments/db:${attachmentId}/download`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      const body = await response.text();
      return {
        ok: false,
        bytes: null,
        error: `download ${response.status}: ${body.slice(0, 240)}`,
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

async function extractWithGemini(
  ai: GoogleGenAI,
  model: string,
  pdfBytes: ArrayBuffer
): Promise<ProbeExtraction | null> {
  const base64 = Buffer.from(pdfBytes).toString("base64");

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
    config: {
      responseMimeType: "application/json",
    },
  });

  const text = response.text ?? "{}";
  try {
    return normalizeExtraction(JSON.parse(text));
  } catch {
    return null;
  }
}

function selectPermits(
  args: CliArgs,
  benchmark: BenchmarkInput
): Array<{ permitId: string; iou: number | null }> {
  const results = benchmark.results ?? [];

  if (args.permitIds.length > 0) {
    const wanted = new Set(args.permitIds.map((p) => p.trim()).filter(Boolean));
    return results
      .filter((row) => wanted.has(row.permitId))
      .map((row) => ({
        permitId: row.permitId,
        iou: row.metrics?.iou ?? null,
      }));
  }

  return results
    .filter((row) => row.status === "scored")
    .filter((row) => {
      const iou = row.metrics?.iou;
      return Number.isFinite(iou) && (iou as number) < args.maxIou;
    })
    .sort((a, b) => (a.metrics?.iou ?? 1) - (b.metrics?.iou ?? 1))
    .slice(0, args.maxPermits)
    .map((row) => ({ permitId: row.permitId, iou: row.metrics?.iou ?? null }));
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is required");
  }

  const raw = await readFile(args.benchmarkPath, "utf8");
  const benchmark = JSON.parse(raw) as BenchmarkInput;
  const permits = selectPermits(args, benchmark);

  if (permits.length === 0) {
    console.log("No permits selected.");
    return;
  }

  const ai = new GoogleGenAI({ apiKey });
  const results: PermitProbeResult[] = [];

  for (const selected of permits) {
    const permit = await loadPermitContext(selected.permitId);
    if (!(permit?.projectId && permit.projectId > 0)) {
      results.push({
        permitId: selected.permitId,
        iou: selected.iou,
        projectId: permit?.projectId ?? null,
        projectName: permit?.projectName ?? null,
        parcel: permit?.parcel ?? null,
        docsAttempted: 0,
        docsSucceeded: 0,
        docs: [],
      });
      continue;
    }

    const docs = await loadProjectDocs(permit.projectId);
    const picked = docs.slice(0, Math.max(1, args.maxDocsPerPermit));

    const probe: PermitProbeResult = {
      permitId: selected.permitId,
      iou: selected.iou,
      projectId: permit.projectId,
      projectName: permit.projectName,
      parcel: permit.parcel,
      docsAttempted: picked.length,
      docsSucceeded: 0,
      docs: [],
    };

    for (const doc of picked) {
      const entry: PermitProbeResult["docs"][number] = {
        docId: doc.id,
        fileName: doc.fileName,
        documentType: doc.documentType,
        emailId: doc.emailId,
        attachmentId: doc.attachmentId,
        downloadOk: false,
        bytes: null,
        error: null,
        extraction: null,
      };

      if (!(doc.emailId && doc.attachmentId)) {
        entry.error = "missing email_id or attachment_id";
        probe.docs.push(entry);
        continue;
      }

      const download = await downloadAttachment(doc.emailId, doc.attachmentId);
      if (!(download.ok && download.bytes)) {
        entry.error = download.error;
        probe.docs.push(entry);
        continue;
      }

      entry.downloadOk = true;
      entry.bytes = download.bytes.byteLength;

      if (download.bytes.byteLength > args.maxDocBytes) {
        entry.error = `skipped oversized file (${download.bytes.byteLength} bytes)`;
        probe.docs.push(entry);
        continue;
      }

      try {
        const extraction = await extractWithGemini(
          ai,
          args.model,
          download.bytes
        );
        entry.extraction = extraction;
        probe.docsSucceeded += 1;
      } catch (error) {
        entry.error = error instanceof Error ? error.message : String(error);
      }

      probe.docs.push(entry);
    }

    results.push(probe);
    console.log(
      `permit ${probe.permitId}: docs=${probe.docsAttempted}, extracted=${probe.docsSucceeded}`
    );
  }

  const output = {
    generatedAt: new Date().toISOString(),
    model: args.model,
    options: args,
    permits: results,
  };

  await mkdir(dirname(args.outPath), { recursive: true });
  await Bun.write(args.outPath, JSON.stringify(output, null, 2));

  console.log(`wrote ${args.outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
