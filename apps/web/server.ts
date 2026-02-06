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
import { healthCheck } from "@/api/health";
import { searchMonday } from "@/api/monday";
import { createQuote, listQuotes } from "@/api/quotes";
import {
  deleteQuote,
  duplicateQuote,
  getQuote,
  getQuotePdf,
  getQuoteTakeoff,
  updateQuote,
} from "@/api/quotes-by-id";
import { createTakeoff, listTakeoffs } from "@/api/takeoffs";
import {
  deleteTakeoff,
  getTakeoff,
  getTakeoffPdf,
  getTakeoffQuote,
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

    // Quotes
    "/api/quotes": {
      GET: h(listQuotes),
      POST: h(createQuote),
    },
    "/api/quotes/:id": {
      GET: h(getQuote),
      PUT: h(updateQuote),
      DELETE: h(deleteQuote),
    },
    "/api/quotes/:id/pdf": {
      GET: h(getQuotePdf),
    },
    "/api/quotes/:id/duplicate": {
      POST: h(duplicateQuote),
    },
    "/api/quotes/:id/takeoff": {
      GET: h(getQuoteTakeoff),
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
    "/api/takeoffs/:id/quote": {
      GET: h(getTakeoffQuote),
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
    "/quotes": homepage,
    "/quotes/*": homepage,
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
