/**
 * Desert Services Hub - Web App Server
 *
 * Frontend SPA + API routes for estimates, takeoffs, catalog, archives.
 * Run with: bun run apps/web/server.ts
 * Or with hot reload: bun --hot apps/web/server.ts
 *
 * Webhooks and background worker run separately in webhooks.ts.
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
import { listContracts } from "@/api/contracts";
import { healthCheck } from "@/api/health";
import { searchMonday } from "@/api/monday";
import { listPermits } from "@/api/permits";
import { listProjects } from "@/api/projects";
import { createTakeoff, listTakeoffs } from "@/api/takeoffs";
import {
  deleteTakeoff,
  getTakeoff,
  getTakeoffEstimate,
  getTakeoffPdf,
  updateTakeoff,
} from "@/api/takeoffs-by-id";
import { checkPdfExists, uploadPdf } from "@/api/upload";

// Bun.serve route handlers expect BunRequest<path> but our API handlers use standard
// Request. Cloudflare Workers types also pollute the global Request generic, causing
// type conflicts. This helper bridges the gap.
const h = (handler: unknown) => handler as never;

// Frontend - HTML entry point (Bun bundles automatically)
import homepage from "@/apps/web/frontend/index.html";

const server = serve({
  port: process.env.PORT || 3000,

  routes: {
    // ===========================================
    // API Routes
    // ===========================================

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

    // Projects
    "/api/projects": {
      GET: h(listProjects),
    },

    // Dust Permits
    "/api/permits": {
      GET: h(listPermits),
    },

    // Contracts (Won estimates)
    "/api/contracts": {
      GET: h(listContracts),
    },

    // Monday.com
    "/api/monday/search": {
      GET: h(searchMonday),
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
    "/projects": homepage,
    "/projects/*": homepage,
    "/permits": homepage,
    "/permits/*": homepage,
    "/catalog": homepage,
    "/map": homepage,
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
    const indexHtml = file("./apps/web/frontend/index.html");
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

console.log(`Desert Services Hub running at ${server.url}`);
console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
