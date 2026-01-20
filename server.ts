/**
 * Desert Services Hub - Bun Server
 *
 * Main entry point using Bun.serve() with native routing.
 * Run with: bun run server.ts
 * Or with hot reload: bun --hot server.ts
 */
import { serve } from "bun";
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
    // Frontend SPA Routes
    // ===========================================
    // Serve the React app for all non-API routes
    // React Router handles client-side routing
    "/": homepage,
    "/quotes": homepage,
    "/quotes/*": homepage,
    "/takeoffs": homepage,
    "/takeoffs/*": homepage,
    "/catalog": homepage,
    "/settings": homepage,

    // Catch-all for any other routes (SPA fallback)
    "/*": homepage,
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
