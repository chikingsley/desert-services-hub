/**
 * Desert Services Hub - Bun Server
 *
 * Main entry point using Bun.serve() with native routing.
 * Run with: bun run server.ts
 * Or with hot reload: bun --hot server.ts
 */

import { file, serve } from "bun";
import {
  getArchiveIndex,
  getAttachment,
  getConversation,
  listArchives,
} from "@/api/archive";
import { getCatalog, getTakeoffItems } from "@/api/catalog";
import { createEstimate, listEstimates } from "@/api/estimates";
import {
  deleteEstimate,
  duplicateEstimate,
  getEstimate,
  getEstimatePdf,
  getEstimateTakeoff,
  updateEstimate,
} from "@/api/estimates-by-id";
import { healthCheck } from "@/api/health";
import { searchMonday } from "@/api/monday";
import { createTakeoff, listTakeoffs } from "@/api/takeoffs";
import {
  deleteTakeoff,
  getTakeoff,
  getTakeoffEstimate,
  getTakeoffPdf,
  updateTakeoff,
} from "@/api/takeoffs-by-id";
import { checkPdfExists, uploadPdf } from "@/api/upload";
import { handleMondayWebhook } from "@/api/webhooks";

// Bun.serve route handlers expect BunRequest<path> but our API handlers use standard
// Request. Cloudflare Workers types also pollute the global Request generic, causing
// type conflicts. This helper bridges the gap.
const h = (handler: unknown) => handler as never;

// Frontend - HTML entry point (Bun bundles automatically)
import homepage from "@/apps/web/frontend/index.html";

const server = serve({
  port: process.env.PORT || 4747,

  routes: {
    // ===========================================
    // API Routes
    // ===========================================

    // Health Check
    "/api/health": {
      GET: healthCheck,
    },

    // Estimates
    "/api/estimates": {
      GET: h(listEstimates),
      POST: h(createEstimate),
    },
    "/api/estimates/:id": {
      GET: h(getEstimate),
      PUT: h(updateEstimate),
      DELETE: h(deleteEstimate),
    },
    "/api/estimates/:id/pdf": {
      GET: h(getEstimatePdf),
    },
    "/api/estimates/:id/duplicate": {
      POST: h(duplicateEstimate),
    },
    "/api/estimates/:id/takeoff": {
      GET: h(getEstimateTakeoff),
    },

    // Takeoffs
    "/api/takeoffs": {
      GET: h(listTakeoffs),
      POST: h(createTakeoff),
    },
    "/api/takeoffs/:id": {
      GET: h(getTakeoff),
      PUT: h(updateTakeoff),
      DELETE: h(deleteTakeoff),
    },
    "/api/takeoffs/:id/pdf": {
      GET: h(getTakeoffPdf),
    },
    "/api/takeoffs/:id/estimate": {
      GET: h(getTakeoffEstimate),
    },

    // Upload
    "/api/upload/pdf": {
      GET: h(checkPdfExists),
      POST: h(uploadPdf),
    },

    // Catalog
    "/api/catalog": {
      GET: h(getCatalog),
    },
    "/api/catalog/takeoff-items": {
      GET: h(getTakeoffItems),
    },

    // Monday.com
    "/api/monday/search": {
      GET: h(searchMonday),
    },

    // Webhooks
    "/api/webhooks/monday": {
      POST: h(handleMondayWebhook),
    },

    // Email Archives
    "/api/archives": {
      GET: h(listArchives),
    },
    "/api/archives/:archive": {
      GET: h(getArchiveIndex),
    },
    "/api/archives/:archive/conversations/:folder": {
      GET: h(getConversation),
    },
    "/api/archives/:archive/conversations/:folder/attachments/:filename": {
      GET: h(getAttachment),
    },

    // ===========================================
    // Frontend SPA Routes (explicit paths)
    // ===========================================
    "/": homepage,
    "/estimates": homepage,
    "/estimates/*": homepage,
    "/takeoffs": homepage,
    "/takeoffs/*": homepage,
    "/contracts": homepage,
    "/contracts/*": homepage,
    "/catalog": homepage,
    "/settings": homepage,
  },

  // Fallback handler for unmatched routes
  // Serves static files from public/ or falls back to SPA
  async fetch(req) {
    const url = new URL(req.url);
    const pathname = url.pathname;

    // Try to serve static file from public directory
    const staticFile = file(`./public${pathname}`);
    if (await staticFile.exists()) {
      return new Response(staticFile);
    }

    // SPA fallback - serve index.html for client-side routing
    // Note: HTMLBundle can't be returned from fetch(), only from routes
    const indexHtml = file("./src/frontend/index.html");
    return new Response(indexHtml, {
      headers: { "Content-Type": "text/html" },
    });
  },

  // Development features
  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },

  // Error handling
  error(error) {
    console.error("Server error:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  },
});

console.log(`🚀 Desert Services Hub running at ${server.url}`);
console.log(`   Environment: ${process.env.NODE_ENV || "development"}`);
