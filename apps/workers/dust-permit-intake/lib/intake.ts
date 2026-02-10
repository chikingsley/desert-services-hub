/**
 * Dust Permit Intake Processing
 *
 * Processes forwarded emails with PDF attachments:
 *   1. Run NOI extraction on each PDF
 *   2. Store PDF + extraction blob in documents table
 *   3. Match to project and update noi_status
 */
import { join } from "node:path";
import { db } from "@lib/db/hub";
import {
  createSharePointClientFromEnv,
  uploadLocalFileToProjectSubfolder,
} from "@lib/sharepoint/intake-upload";
import type { SharePointClient } from "@sharepoint/client";
import { matchProject } from "@/apps/workers/dust-permit-intake/lib/project-matcher";

const PDF_ANALYSIS_CWD = join(
  import.meta.dir,
  "../../../../apps/cli-tools/pdf-analysis-cli"
);

const LOG = "[dust-permit-intake]";

// ============================================================================
// Types
// ============================================================================

export interface DustPermitIntakePayload {
  originalSubject: string;
  originalFrom: string;
  bodyText: string;
  attachmentPaths: string[];
  forwarderEmail: string;
}

interface NOIResult {
  applicantName: string;
  applicantAddress1: string | null;
  applicantAddress2: string | null;
  applicantCity: string | null;
  applicantState: string | null;
  applicantZip: string | null;
  siteName: string;
  siteAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  acresDisturbed: number | null;
  swpppContactFirstName: string | null;
  swpppContactLastName: string | null;
  swpppContactEmail: string | null;
  swpppContactPhone: string | null;
  permitId: string | null;
  ltfNumber: string | null;
  _extraction: {
    confidence: string;
    missingFields: string[];
    warnings: string[];
  };
}

interface IntakeResult {
  documentId: number | null;
  projectId: number | null;
  projectName: string | null;
  fileName: string;
  error?: string;
}

// ============================================================================
// DB Writes (documents)
// ============================================================================

const insertNoiDocument = db.prepare(`
  INSERT INTO documents (
    project_id, document_type, summary, raw_extraction,
    file_path, file_name,
    model, processing_time_ms,
    extraction_status,
    original_from, original_subject, forwarder_email
  ) VALUES (
    $1, 'NOI', $2, $3::jsonb,
    $4, $5,
    $6, $7,
    'success',
    $8, $9, $10
  )
  RETURNING id
`);

const insertNoiDocumentError = db.prepare(`
  INSERT INTO documents (
    project_id, document_type,
    file_path, file_name,
    extraction_status, extraction_error,
    original_from, original_subject, forwarder_email
  ) VALUES (
    $1, 'NOI',
    $2, $3,
    'failed', $4,
    $5, $6, $7
  )
  RETURNING id
`);

// ============================================================================
// NOI Extraction via Python CLI
// ============================================================================

async function runNOIExtraction(pdfPath: string): Promise<NOIResult> {
  const proc = Bun.spawn(
    [
      "uv",
      "run",
      "-m",
      "pdf_analysis.cli",
      "noi",
      pdfPath,
      "--ocr-fallback",
      "--format",
      "json",
    ],
    {
      cwd: PDF_ANALYSIS_CWD,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, PATH: process.env.PATH ?? "" },
    }
  );

  const timeout = setTimeout(() => proc.kill(), 180_000); // 3min (OCR fallback can be slow)
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  clearTimeout(timeout);

  if (exitCode !== 0) {
    throw new Error(
      `pdf-analysis noi exit ${exitCode}: ${stderr.trim().slice(0, 500)}`
    );
  }

  return JSON.parse(stdout) as NOIResult;
}

// ============================================================================
// Single PDF Processing
// ============================================================================

async function processSinglePdf(
  pdfPath: string,
  emailMeta: Pick<
    DustPermitIntakePayload,
    "originalSubject" | "originalFrom" | "forwarderEmail"
  >,
  sp: SharePointClient | null
): Promise<IntakeResult> {
  const fileName = pdfPath.split("/").pop() ?? pdfPath;

  try {
    const started = performance.now();
    const result = await runNOIExtraction(pdfPath);
    const elapsed = Math.round(performance.now() - started);
    const meta = result._extraction;

    // Match to project
    const project = await matchProject(
      emailMeta.originalSubject,
      result.siteName
    );

    const summary = [
      result.siteName,
      result.permitId ? `(${result.permitId})` : null,
      `${meta.confidence} confidence`,
    ]
      .filter(Boolean)
      .join(" ");

    const row = (await insertNoiDocument.get(
      project?.id ?? null,
      summary,
      JSON.stringify(result),
      pdfPath,
      fileName,
      "pdf-analysis/noi",
      elapsed,
      emailMeta.originalFrom || null,
      emailMeta.originalSubject || null,
      emailMeta.forwarderEmail || null
    )) as { id: number } | null;

    const documentId = row?.id ?? null;

    // Update project noi_status if linked
    if (project) {
      await db.run(
        "UPDATE projects SET noi_status = 'Received', updated_at = now() WHERE id = ?",
        [project.id]
      );
      console.log(
        `${LOG} NOI document #${documentId} linked to project: ${project.name} (id=${project.id})`
      );
    } else {
      console.log(
        `${LOG} NOI document #${documentId} stored — no project match for "${emailMeta.originalSubject}"`
      );
    }

    if (project && sp && documentId) {
      try {
        const uploaded = await uploadLocalFileToProjectSubfolder(sp, {
          projectId: project.id,
          subfolder: "NOI",
          localPath: pdfPath,
          originalFileName: fileName,
          stableSuffix: String(documentId),
        });

        if (uploaded) {
          console.log(
            `${LOG} Uploaded NOI to SharePoint: ${uploaded.sharepointPath}`
          );
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(`${LOG} SharePoint upload failed for ${fileName}: ${msg}`);
      }
    }

    console.log(
      `${LOG} ${fileName}: ${result.siteName} | ${result.permitId ?? "no permit ID"} | ${meta.confidence} confidence`
    );

    return {
      documentId,
      projectId: project?.id ?? null,
      projectName: project?.name ?? null,
      fileName,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${LOG} Failed ${fileName}: ${msg}`);

    try {
      const row = (await insertNoiDocumentError.get(
        null,
        pdfPath,
        fileName,
        msg.slice(0, 1000),
        emailMeta.originalFrom || null,
        emailMeta.originalSubject || null,
        emailMeta.forwarderEmail || null
      )) as { id: number } | null;

      return {
        documentId: row?.id ?? null,
        projectId: null,
        projectName: null,
        fileName,
        error: msg,
      };
    } catch (dbErr) {
      const dbMsg = dbErr instanceof Error ? dbErr.message : String(dbErr);
      console.warn(
        `${LOG} Failed to store error record for ${fileName}: ${dbMsg}`
      );
    }

    return {
      documentId: null,
      projectId: null,
      projectName: null,
      fileName,
      error: msg,
    };
  }
}

// ============================================================================
// Main Entry Point
// ============================================================================

export async function processDustPermitIntake(
  payload: DustPermitIntakePayload
): Promise<IntakeResult[]> {
  const { originalSubject, attachmentPaths } = payload;
  const sp = createSharePointClientFromEnv();

  console.log(
    `${LOG} Processing ${attachmentPaths.length} PDF(s) from "${originalSubject}"`
  );

  const results: IntakeResult[] = [];
  for (const pdfPath of attachmentPaths) {
    const result = await processSinglePdf(pdfPath, payload, sp);
    results.push(result);
  }

  const succeeded = results.filter((r) => !r.error).length;
  console.log(`${LOG} Done: ${succeeded}/${results.length} extracted`);

  if (succeeded === 0 && results.length > 0) {
    const errors = results.map((r) => `${r.fileName}: ${r.error}`).join("; ");
    throw new Error(
      `All ${results.length} PDF(s) failed extraction: ${errors}`
    );
  }

  return results;
}
