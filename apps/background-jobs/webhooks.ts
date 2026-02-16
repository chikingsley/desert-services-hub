/**
 * Desert Services Hub - Webhook Receiver + Background Worker
 *
 * Separate entrypoint for webhook ingestion (Monday, Outlook) and
 * the background job queue processor. Runs behind Cloudflare Tunnel.
 *
 * Run with: bun run apps/background-jobs/webhooks.ts
 */

import { serve } from "bun";
import { healthCheck } from "./api/health";
import { handleIntakeWebhook } from "./api/webhooks/intake";
import { handleMondayWebhook } from "./api/webhooks/monday";
import { handleOutlookWebhook } from "./api/webhooks/outlook";
import { startWorker } from "./worker";

// Bun.serve route handlers require `(req: Request) => Response | Promise<Response>`
// but our handlers return `Promise<Response>`. The cast bridges this mismatch.
const handler = (fn: (req: Request) => Promise<Response>) => fn as never;

const server = serve({
  port: process.env.WEBHOOK_PORT || 4747,

  routes: {
    "/api/health": {
      GET: healthCheck,
    },
    "/api/webhooks/monday": {
      POST: handler(handleMondayWebhook),
    },
    "/api/webhooks/outlook": {
      POST: handler(handleOutlookWebhook),
    },
    "/api/webhooks/intake": {
      POST: handler(handleIntakeWebhook),
    },
    // Backward compat aliases (old CF Workers may still POST here)
    "/api/webhooks/files-intake": {
      POST: handler(handleIntakeWebhook),
    },
    "/api/webhooks/contracts-intake": {
      POST: handler(handleIntakeWebhook),
    },
  },

  fetch() {
    return new Response("Not Found", { status: 404 });
  },

  error(error) {
    console.error("Webhook server error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  },
});

console.log(`Webhook receiver running at ${server.url}`);

startWorker().catch((err) => console.error("[worker] Failed to start:", err));
