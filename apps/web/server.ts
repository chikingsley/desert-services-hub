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
} from "./api/archive";
import { getCatalog, getTakeoffItems } from "./api/catalog";
import { healthCheck } from "./api/health";
import { searchMonday } from "./api/monday";
import { createQuote, listQuotes } from "./api/quotes";
import {
  deleteQuote,
  duplicateQuote,
  getQuote,
  getQuotePdf,
  getQuoteTakeoff,
  updateQuote,
} from "./api/quotes-by-id";
import { createTakeoff, listTakeoffs } from "./api/takeoffs";
import {
  deleteTakeoff,
  getTakeoff,
  getTakeoffPdf,
  getTakeoffQuote,
  updateTakeoff,
} from "./api/takeoffs-by-id";
import { checkPdfExists, uploadPdf } from "./api/upload";
import { handleMondayWebhook } from "./api/webhooks";

// Frontend - HTML entry point (Bun bundles automatically)
import homepage from "./frontend/index.html";

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
      GET: listQuotes,
      POST: createQuote,
    },
    "/api/quotes/:id": {
      GET: getQuote,
      PUT: updateQuote,
      DELETE: deleteQuote,
    },
    "/api/quotes/:id/pdf": {
      GET: getQuotePdf,
    },
    "/api/quotes/:id/duplicate": {
      POST: duplicateQuote,
    },
    "/api/quotes/:id/takeoff": {
      GET: getQuoteTakeoff,
    },

    // Takeoffs
    "/api/takeoffs": {
      GET: listTakeoffs,
      POST: createTakeoff,
    },
    "/api/takeoffs/:id": {
      GET: getTakeoff,
      PUT: updateTakeoff,
      DELETE: deleteTakeoff,
    },
    "/api/takeoffs/:id/pdf": {
      GET: getTakeoffPdf,
    },
    "/api/takeoffs/:id/quote": {
      GET: getTakeoffQuote,
    },

    // Upload
    "/api/upload/pdf": {
      GET: checkPdfExists,
      POST: uploadPdf,
    },

    // Catalog
    "/api/catalog": {
      GET: getCatalog,
    },
    "/api/catalog/takeoff-items": {
      GET: getTakeoffItems,
    },

    // Monday.com
    "/api/monday/search": {
      GET: searchMonday,
    },

    // Webhooks
    "/api/webhooks/monday": {
      POST: handleMondayWebhook,
    },

    // Email Archives
    "/api/archives": {
      GET: listArchives,
    },
    "/api/archives/:archive": {
      GET: getArchiveIndex,
    },
    "/api/archives/:archive/conversations/:folder": {
      GET: getConversation,
    },
    "/api/archives/:archive/conversations/:folder/attachments/:filename": {
      GET: getAttachment,
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
