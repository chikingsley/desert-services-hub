/**
 * Desert Services Hub - AQData Receiver + Background Worker
 *
 * Runs the background job queue consumer and AQData trigger endpoints.
 * Monday/Outlook/Intake ingress is handled by Supabase Edge Functions.
 *
 * Run with: bun run apps/background-jobs/webhooks.ts
 */

import { serve } from "bun";
import {
  handleAQDataCompanySync,
  handleAQDataDetailScrape,
  handleAQDataSync,
} from "./api/aqdata";
import {
  handleBuildingConnectedAuthClipboardCopy,
  handleBuildingConnectedAuthClipboardPaste,
  handleBuildingConnectedAuthStart,
  handleBuildingConnectedAuthStatus,
  handleBuildingConnectedAuthStop,
} from "./api/buildingconnected-auth";
import { healthCheck } from "./api/health";
import { handleIntakeWebhook } from "./api/webhooks/intake";
import { startWorker } from "./worker";

const IDLE_TIMEOUT_SECONDS = Number.parseInt(
  process.env.WEBHOOK_IDLE_TIMEOUT_S ?? "255",
  10
);

const server = serve({
  idleTimeout:
    Number.isFinite(IDLE_TIMEOUT_SECONDS) && IDLE_TIMEOUT_SECONDS > 0
      ? Math.min(255, IDLE_TIMEOUT_SECONDS)
      : 255,
  port: process.env.WEBHOOK_PORT || 4747,

  routes: {
    "/api/health": {
      GET: healthCheck,
    },
    "/api/buildingconnected/auth/status": {
      GET: handleBuildingConnectedAuthStatus,
    },
    "/api/buildingconnected/auth/start": {
      POST: ((req: Request) => handleBuildingConnectedAuthStart(req)) as never,
    },
    "/api/buildingconnected/auth/stop": {
      POST: handleBuildingConnectedAuthStop,
    },
    "/api/buildingconnected/auth/clipboard/paste": {
      POST: ((req: Request) =>
        handleBuildingConnectedAuthClipboardPaste(req)) as never,
    },
    "/api/buildingconnected/auth/clipboard/copy": {
      POST: handleBuildingConnectedAuthClipboardCopy,
    },
    "/api/aqdata/sync": {
      POST: handleAQDataSync,
    },
    "/api/aqdata/sync/company": {
      POST: handleAQDataCompanySync,
    },
    "/api/aqdata/scrape": {
      POST: ((req: Request) => handleAQDataDetailScrape(req)) as never,
    },
    "/api/webhooks/intake": {
      POST: ((req: Request) => handleIntakeWebhook(req)) as never,
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
