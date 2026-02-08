/**
 * Dust Permit Intake Processing
 *
 * Processes forwarded emails with PDF attachments:
 *   1. Run NOI extraction on each PDF
 *   2. Store result in noi_extractions table
 *   3. Match to project and update noi_status
 */
import { join } from "node:path";
import { db } from "@lib/db/hub";
import { insertNOI } from "@lib/db/repositories/noi";
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
  noiId: number | null;
  projectId: number | null;
  projectName: string | null;
  fileName: string;
  error?: string;
}

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
  originalSubject: string
): Promise<IntakeResult> {
  const fileName = pdfPath.split("/").pop() ?? pdfPath;

  try {
    const result = await runNOIExtraction(pdfPath);
    const meta = result._extraction;

    // Match to project
    const project = await matchProject(originalSubject, result.siteName);

    const noiId = await insertNOI({
      projectId: project?.id ?? null,
      filePath: pdfPath,
      fileName,
      permitId: result.permitId,
      ltfNumber: result.ltfNumber,
      applicantName: result.applicantName,
      applicantAddress1: result.applicantAddress1,
      applicantAddress2: result.applicantAddress2,
      applicantCity: result.applicantCity,
      applicantState: result.applicantState,
      applicantZip: result.applicantZip,
      siteName: result.siteName,
      siteAddress: result.siteAddress,
      latitude: result.latitude,
      longitude: result.longitude,
      acresDisturbed: result.acresDisturbed,
      swpppContactFirstName: result.swpppContactFirstName,
      swpppContactLastName: result.swpppContactLastName,
      swpppContactEmail: result.swpppContactEmail,
      swpppContactPhone: result.swpppContactPhone,
      extractionConfidence: meta.confidence,
      missingFields: meta.missingFields,
      warnings: meta.warnings,
    });

    // Update project noi_status if linked
    if (project) {
      await db.run(
        "UPDATE projects SET noi_status = 'Received', updated_at = now() WHERE id = ?",
        [project.id]
      );
      console.log(
        `${LOG} NOI #${noiId} linked to project: ${project.name} (id=${project.id})`
      );
    } else {
      console.log(
        `${LOG} NOI #${noiId} stored — no project match for "${originalSubject}"`
      );
    }

    console.log(
      `${LOG} ${fileName}: ${result.siteName} | ${result.permitId ?? "no permit ID"} | ${meta.confidence} confidence`
    );

    return {
      noiId,
      projectId: project?.id ?? null,
      projectName: project?.name ?? null,
      fileName,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${LOG} Failed ${fileName}: ${msg}`);
    return {
      noiId: null,
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

  console.log(
    `${LOG} Processing ${attachmentPaths.length} PDF(s) from "${originalSubject}"`
  );

  const results: IntakeResult[] = [];
  for (const pdfPath of attachmentPaths) {
    const result = await processSinglePdf(pdfPath, originalSubject);
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
