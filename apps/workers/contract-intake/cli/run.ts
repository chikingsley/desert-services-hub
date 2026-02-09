/**
 * Contract Intake Worker — Standalone CLI
 *
 * Polls webhook_jobs for contract_intake jobs and processes them.
 * Can run as a separate process from the main web server.
 *
 * Usage:
 *   bun apps/workers/contract-intake/cli/run.ts
 *   bun apps/workers/contract-intake/cli/run.ts --once   # process one job and exit
 */
import { db } from "@lib/db/hub";
import { z } from "zod";
import { processContractIntake } from "@/apps/workers/contract-intake/lib/intake";

const POLL_INTERVAL_MS = 10_000; // 10s — LLM processing is slow anyway

interface WebhookJob {
  id: number;
  payload: string;
  status: string;
  attempts: number;
}

const selectNextJob = db.query<WebhookJob>(`
  SELECT id, payload, status, attempts FROM webhook_jobs
  WHERE job_type = 'contract_intake'
    AND (status = 'pending' OR (status = 'failed' AND attempts < max_attempts))
  ORDER BY created_at ASC
  LIMIT 1
`);

const claimJob = db.prepare(
  "UPDATE webhook_jobs SET status = 'processing', started_at = now(), attempts = attempts + 1 WHERE id = ? AND status IN ('pending', 'failed')"
);

const completeJob = db.prepare(
  "UPDATE webhook_jobs SET status = 'completed', completed_at = now(), error = NULL WHERE id = ?"
);

const failJob = db.prepare(
  "UPDATE webhook_jobs SET status = 'failed', error = ? WHERE id = ?"
);

const CONTRACT_INTAKE_PAYLOAD_SCHEMA = z.object({
  emailId: z.number().int().positive(),
  subject: z.string().trim().min(1),
  pdfPaths: z.array(z.string().trim().min(1)),
});

function parseContractIntakePayload(job: WebhookJob): {
  emailId: number;
  subject: string;
  pdfPaths: string[];
} {
  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(job.payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Invalid JSON payload for contract_intake job #${job.id}: ${message}`
    );
  }

  const parsed = CONTRACT_INTAKE_PAYLOAD_SCHEMA.safeParse(rawPayload);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
        return `${path}: ${issue.message}`;
      })
      .join("; ");
    throw new Error(
      `Invalid payload for contract_intake job #${job.id}: ${details}`
    );
  }

  return parsed.data;
}

async function processNext(): Promise<boolean> {
  const job = await selectNextJob.get();
  if (!job) {
    return false;
  }

  const claimed = await claimJob.run(job.id);
  if (claimed.count === 0) {
    return false;
  }

  console.log(`[contract-intake] Processing job #${job.id}`);

  try {
    const { emailId, subject, pdfPaths } = parseContractIntakePayload(job);

    await processContractIntake(emailId, subject, pdfPaths);
    await completeJob.run(job.id);
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[contract-intake] Job #${job.id} failed: ${msg}`);
    await failJob.run(msg.slice(0, 1000), job.id);
    return true;
  }
}

// CLI entry
const once = process.argv.includes("--once");

if (once) {
  const had = await processNext();
  if (!had) {
    console.log("[contract-intake] No pending jobs");
  }
  process.exit(0);
}

console.log("[contract-intake] Worker started — polling for jobs");
console.log(`[contract-intake] Poll interval: ${POLL_INTERVAL_MS / 1000}s`);

setInterval(async () => {
  try {
    await processNext();
  } catch (err) {
    console.error("[contract-intake] Poll error:", err);
  }
}, POLL_INTERVAL_MS);
