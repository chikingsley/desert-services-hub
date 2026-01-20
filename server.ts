/**
 * Desert Services Hub - Bun Server
 *
 * Main entry point using Bun.serve() with native routing.
 * Run with: bun run server.ts
 * Or with hot reload: bun --hot server.ts
 */

import { file, serve } from "bun";

// API handlers
import { healthCheck } from "./src/api/health";
import { searchMonday } from "./src/api/monday";
import { createQuote, listQuotes } from "./src/api/quotes";
import {
  deleteQuote,
  duplicateQuote,
  getQuote,
  getQuotePdf,
  getQuoteTakeoff,
  updateQuote,
} from "./src/api/quotes-by-id";
import { createTakeoff, listTakeoffs } from "./src/api/takeoffs";
import {
  deleteTakeoff,
  getTakeoff,
  getTakeoffPdf,
  getTakeoffQuote,
  updateTakeoff,
} from "./src/api/takeoffs-by-id";
import { checkPdfExists, uploadPdf } from "./src/api/upload";
import { handleMondayWebhook } from "./src/api/webhooks";

// Frontend - HTML entry point (Bun bundles automatically)
import homepage from "./src/frontend/index.html";

const server = serve({
  port: process.env.PORT || 3000,

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

    // Monday.com
    "/api/monday/search": {
      GET: searchMonday,
    },

    // Webhooks
    "/api/webhooks/monday": {
      POST: handleMondayWebhook,
    },

    // ===========================================
    // Frontend SPA Routes (explicit paths)
    // ===========================================
    "/": homepage,
    "/quotes": homepage,
    "/quotes/*": homepage,
    "/takeoffs": homepage,
    "/takeoffs/*": homepage,
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

    // SPA fallback - serve homepage for client-side routing
    return new Response(homepage);
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
