/**
 * Dust Permit Automation API
 *
 * Main entry point using Bun.serve().
 */

import { serve } from "bun";
import {
  handleBrowserStart,
  handleBrowserStatus,
  handleBrowserStop,
} from "@/api/browser";
import {
  handleListTemplates,
  handleSendEmail,
  handleSwpppEmail,
} from "@/api/email";
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
// Handlers
import { handleScrapePdf, handleScrapePermit } from "@/api/scrape";
import { handleSync } from "@/api/sync";
import index from "@/index.html";
import { initSentry } from "@/portal/utils/sentry";

// Initialize Sentry first (before other imports that might throw)
initSentry();

const PORT = Number(process.env.PORT) || 47_822;

// ============================================
// Server
// ============================================

const server = serve({
  port: PORT,
  hostname: "0.0.0.0",
  routes: {
    // ============================================
    // Health Check
    // ============================================
    "/health": {
      GET: handleHealthCheck,
    },

    // ============================================
    // Permits API
    // ============================================
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

    // ============================================
    // Scrape API
    // ============================================
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

    // ============================================
    // Sync API
    // ============================================
    "/api/sync": {
      POST() {
        return handleSync();
      },
    },

    // ============================================
    // Browser API
    // ============================================
    "/api/browser/status": {
      GET: handleBrowserStatus,
    },
    "/api/browser/start": {
      POST() {
        return handleBrowserStart();
      },
    },
    "/api/browser/stop": {
      POST() {
        return handleBrowserStop();
      },
    },

    // ============================================
    // Email API
    // ============================================
    "/api/email/templates": {
      GET() {
        return handleListTemplates();
      },
    },
    "/api/email/send": {
      async POST(req) {
        const body = await req.json();
        return handleSendEmail(body);
      },
    },
    "/swppp-plan-notifications": {
      async POST(req) {
        const body = await req.json();
        return handleSwpppEmail(body);
      },
    },

    // ============================================
    // Static Assets & Fallback
    // ============================================
    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`
Dust Permit Automation API & Dashboard

http://localhost:${PORT}
http://localhost:${PORT}/health

Ready for requests...
`);

export { server };
