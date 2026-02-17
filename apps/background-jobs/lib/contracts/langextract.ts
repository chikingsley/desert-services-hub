import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { db } from "@lib/db/hub";

interface DocumentRow {
  id: number;
  file_name: string | null;
  document_type: string | null;
  summary: string | null;
  raw_extraction: unknown;
}

interface LangExtractResult {
  ok: boolean;
  model: string;
  extraction_count: number;
  entities: Array<{
    class: string;
    text: string;
    attributes: Record<string, unknown>;
    start: number | null;
    end: number | null;
  }>;
  error?: string;
}

const LOG = "[contracts:langextract]";

const getDocument = db.query<DocumentRow>(
  `SELECT id, file_name, document_type, summary, raw_extraction
   FROM documents
   WHERE id = ?`
);

const updateDocumentExtraction = db.prepare(`
  UPDATE documents
  SET raw_extraction = COALESCE(raw_extraction, '{}'::jsonb)
      || jsonb_build_object('contract_structured_extraction', $1::jsonb)
  WHERE id = $2
`);

function resolveUvBin(): string {
  if (process.env.UV_BIN?.trim()) {
    return process.env.UV_BIN.trim();
  }
  if (existsSync("/root/.local/bin/uv")) {
    return "/root/.local/bin/uv";
  }
  return "uv";
}

function resolveLangExtractCwd(): string | null {
  const candidates = [
    process.env.LANGEXTRACT_CLI_CWD?.trim(),
    "/app/packages/contracts/langextract",
    join(import.meta.dir, "../../../../packages/contracts/langextract"),
  ].filter((x): x is string => Boolean(x));

  for (const candidate of candidates) {
    if (existsSync(join(candidate, "pyproject.toml"))) {
      return candidate;
    }
  }
  return null;
}

function parseRawExtraction(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === "object") {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

function pickSourceText(row: DocumentRow): string {
  const parsed = parseRawExtraction(row.raw_extraction);
  const textContent = parsed?.text_content;
  if (typeof textContent === "string" && textContent.trim()) {
    return textContent;
  }
  return row.summary?.trim() ?? "";
}

async function runLangExtract(
  text: string,
  model: string
): Promise<LangExtractResult> {
  const cwd = resolveLangExtractCwd();
  if (!cwd) {
    throw new Error("LangExtract workspace not found (LANGEXTRACT_CLI_CWD)");
  }

  const uvBin = resolveUvBin();
  const tempDir = mkdtempSync(join(tmpdir(), "contract-lx-"));
  const textPath = join(tempDir, "input.txt");
  writeFileSync(textPath, text, "utf-8");

  try {
    const proc = Bun.spawn(
      [
        uvBin,
        "run",
        "langextract-cli",
        "extract",
        "--profile",
        "contracts",
        "--text-file",
        textPath,
        "--model",
        model,
      ],
      {
        cwd,
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, PATH: process.env.PATH ?? "" },
      }
    );

    const timeout = setTimeout(() => proc.kill(), 180_000);
    const stdoutPromise = new Response(proc.stdout).text();
    const stderrPromise = new Response(proc.stderr).text();
    const exitCode = await proc.exited;
    const [stdout, stderr] = await Promise.all([stdoutPromise, stderrPromise]);
    clearTimeout(timeout);

    if (exitCode !== 0) {
      throw new Error(`exit ${exitCode}: ${stderr.trim().slice(0, 500)}`);
    }

    return JSON.parse(stdout) as LangExtractResult;
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

export async function enrichContractDocumentsWithLangExtract(
  documentIds: number[]
): Promise<void> {
  const enabled =
    (process.env.CONTRACT_STRUCTURED_EXTRACTION_ENABLED ?? "true") === "true";
  if (!enabled) {
    return;
  }

  const model = (
    process.env.CONTRACT_LANGEXTRACT_MODEL ??
    process.env.GEMINI_FAST_MODEL ??
    "gemini-2.5-flash-lite"
  ).trim();

  const uniqueIds = [...new Set(documentIds)];
  for (const documentId of uniqueIds) {
    const row = await getDocument.get(documentId);
    if (!row) {
      continue;
    }

    const sourceText = pickSourceText(row);
    if (!sourceText) {
      console.log(`${LOG} skip #${documentId} (no source text)`);
      continue;
    }

    try {
      const result = await runLangExtract(sourceText, model);
      await updateDocumentExtraction.run(JSON.stringify(result), documentId);
      console.log(
        `${LOG} document #${documentId} (${row.file_name ?? "unknown"}): ${result.extraction_count} entities via ${result.model}`
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`${LOG} failed document #${documentId}: ${msg}`);
    }
  }
}
