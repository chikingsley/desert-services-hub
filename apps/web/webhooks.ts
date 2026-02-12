/**
 * Desert Services Hub - Webhook Receiver + Background Worker
 *
 * Separate entrypoint for webhook ingestion (Monday, Outlook) and
 * the background job queue processor. Runs behind Cloudflare Tunnel.
 *
 * Run with: bun run apps/web/webhooks.ts
 */

import { serve } from "bun";
import { healthCheck } from "@/api/health";
import { handleMondayWebhook } from "@/api/webhooks";
import { handleIntakeWebhook } from "@/api/webhooks-intake";
import { handleOutlookWebhook } from "@/api/webhooks-outlook";
import { startWorker } from "@/apps/web/worker";

const h = (handler: unknown) => handler as never;

const server = serve({
  port: process.env.WEBHOOK_PORT || 4747,

  routes: {
    "/api/health": {
      GET: healthCheck,
    },
    "/api/webhooks/monday": {
      POST: h(handleMondayWebhook),
    },
    "/api/webhooks/outlook": {
      POST: h(handleOutlookWebhook),
    },
    "/api/webhooks/intake": {
      POST: h(handleIntakeWebhook),
    },
    // Backward compat aliases (old CF Workers may still POST here)
    "/api/webhooks/files-intake": {
      POST: h(handleIntakeWebhook),
    },
    "/api/webhooks/contracts-intake": {
      POST: h(handleIntakeWebhook),
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
