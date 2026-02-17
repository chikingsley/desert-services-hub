/**
 * Dust Permit Automation API
 *
 * Headless API server for browser automation.
 * Dashboard UI lives in apps/web (main web app).
 */

import { serve } from "bun";
import {
  handleBrowserClipboardCopy,
  handleBrowserClipboardPaste,
  handleBrowserKeepAlive,
  handleBrowserReady,
  handleBrowserStart,
  handleBrowserStatus,
  handleBrowserStop,
} from "@/api/browser";
import { handleInvoicePdf } from "@/api/invoices";
import {
  handleClosePermit,
  handleCreatePermit,
  handleDeleteAllDrafts,
  handleDeletePermit,
  handleGetPermit,
  handleHealthCheck,
  handleListPermits,
  handleRenewPermit,
  handleRevisePermit,
} from "@/api/permits";
import { handleScrapePdf, handleScrapePermit } from "@/api/scrape";
import { handleCompanySync, handleSync } from "@/api/sync";
import { initSentry } from "@/portal/utils/sentry";

initSentry();

const PORT = Number(process.env.PORT) || 47_822;
const parsedIdleTimeoutSeconds = Number.parseInt(
  process.env.PERMIT_WORKER_IDLE_TIMEOUT_SECONDS ?? "180",
  10
);
const IDLE_TIMEOUT_SECONDS = Number.isFinite(parsedIdleTimeoutSeconds)
  ? Math.max(10, parsedIdleTimeoutSeconds)
  : 180;

serve({
  hostname: "0.0.0.0",
  idleTimeout: IDLE_TIMEOUT_SECONDS,
  port: PORT,
  routes: {
    "/health": {
      GET: handleHealthCheck,
    },

    // Permits API
    "/api/permits": {
      GET: handleListPermits,
    },
    "/api/permits/create": {
      async POST(req) {
        const body = await req.json();
        return handleCreatePermit(body);
      },
    },
    "/api/permits/drafts": {
      DELETE() {
        return handleDeleteAllDrafts();
      },
    },
    "/api/permits/:id": {
      GET(req) {
        return handleGetPermit(req.params.id);
      },
      DELETE(req) {
        return handleDeletePermit(req.params.id);
      },
    },
    "/api/permits/:id/:action": {
      async POST(req) {
        const id = req.params.id;
        const action = req.params.action;
        const body = await req.json().catch(() => ({}));

        switch (action) {
          case "renew":
            return handleRenewPermit(id, body);
          case "close":
            return handleClosePermit(id, body);
          case "revise":
            return handleRevisePermit(id, body);
          default:
            return new Response("Invalid action", { status: 400 });
        }
      },
    },

    // Scrape API
    "/api/scrape/pdf": {
      async POST(req) {
        const body = await req.json();
        return handleScrapePdf(body);
      },
    },
    "/api/scrape/:id": {
      GET(req) {
        return handleScrapePermit(req.params.id);
      },
    },

    // Invoices API
    "/api/invoices/pdf": {
      async POST(req) {
        const body = await req.json();
        return handleInvoicePdf(body);
      },
    },

    // Sync API
    "/api/sync": {
      POST() {
        return handleSync();
      },
    },

    // Sync API (company-only)
    "/api/sync/company": {
      POST() {
        return handleCompanySync();
      },
    },

    // Browser API
    "/api/browser/status": {
      GET: handleBrowserStatus,
    },
    "/api/browser/start": {
      POST() {
        return handleBrowserStart();
      },
    },
    "/api/browser/ready": {
      POST() {
        return handleBrowserReady();
      },
    },
    "/api/browser/keepalive": {
      POST() {
        return handleBrowserKeepAlive();
      },
    },
    "/api/browser/stop": {
      POST() {
        return handleBrowserStop();
      },
    },
    "/api/browser/clipboard/paste": {
      POST(req) {
        return handleBrowserClipboardPaste(req);
      },
    },
    "/api/browser/clipboard/copy": {
      POST() {
        return handleBrowserClipboardCopy();
      },
    },
  },
});

console.log(`
Dust Permit Automation API

http://localhost:${PORT}
http://localhost:${PORT}/health

Ready for requests...
`);
