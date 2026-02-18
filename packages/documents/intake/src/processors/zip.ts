import { mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { insertFileError, LOG } from "../files-intake-db";
import type {
  ContractsEmailIntakePayload,
  EmailMeta,
  ParseIntakeResult,
} from "../types";

async function listFilesRecursive(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursive(fullPath)));
    } else if (
      !(entry.name.startsWith(".") || entry.name.startsWith("__MACOSX"))
    ) {
      files.push(fullPath);
    }
  }

  return files;
}

export async function processZipFile(
  zipPath: string,
  emailMeta: EmailMeta,
  payload: ContractsEmailIntakePayload,
  processFiles: (p: ContractsEmailIntakePayload) => Promise<ParseIntakeResult[]>
): Promise<ParseIntakeResult[]> {
  const fileName = zipPath.split("/").pop() ?? zipPath;
  const extractDir = join(
    "/app/data/backfill",
    `zip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );

  try {
    await mkdir(extractDir, { recursive: true });

    const proc = Bun.spawn(["unzip", "-o", "-q", zipPath, "-d", extractDir], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    if (exitCode !== 0) {
      throw new Error(`unzip exit ${exitCode}: ${stderr.trim().slice(0, 500)}`);
    }

    const files = await listFilesRecursive(extractDir);

    if (files.length === 0) {
      return [];
    }

    return await processFiles({
      ...payload,
      attachmentPaths: files,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`${LOG}   Failed ZIP ${fileName}: ${msg}`);
    await insertFileError.run(
      zipPath,
      fileName,
      msg.slice(0, 1000),
      emailMeta.originalFrom || null,
      emailMeta.originalSubject || null,
      emailMeta.forwarderEmail || null
    );

    return [
      {
        documentId: null,
        fileName,
        documentType: "error",
        pageCount: 0,
        processingTimeMs: 0,
        error: msg,
      },
    ];
  } finally {
    await rm(extractDir, { recursive: true, force: true }).catch(() => {
      // Non-fatal cleanup failure.
    });
  }
}
