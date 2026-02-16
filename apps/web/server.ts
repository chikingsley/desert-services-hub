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
// -- Webhooks --
// (webhooks are registered in webhooks.ts, not here)
// -- Flat (single-concern) --
import {
  getAutomationStatus,
  postAutomationClipboardCopy,
  postAutomationClipboardPaste,
  postAutomationKeepAlive,
  postAutomationReady,
  postAutomationStart,
  postAutomationStop,
} from "@/api/automation";
import { getCatalog, getTakeoffItems } from "@/api/catalog";
// -- Contracts --
import {
  getArchiveIndex,
  getAttachment,
  getConversation,
  listArchives,
} from "@/api/contracts/archive";
import { listContracts } from "@/api/contracts/contracts";
// -- Emails --
import {
  downloadEmailAttachment,
  listEmailAttachments,
} from "@/api/emails/attachments";
import {
  getEmail,
  getEmailEstimateCandidates,
  listDomainRules,
  listEmailSenders,
  listEmails,
  markDomainAsSpam,
  setDomainRule,
  setEmailClassification,
} from "@/api/emails/emails";
// -- Estimates --
import { createEstimate, listEstimates } from "@/api/estimates/estimates";
import {
  deleteEstimate,
  duplicateEstimate,
  finalizeEstimate,
  getEstimate,
  getEstimatePdf,
  getEstimateTakeoff,
  updateEstimate,
} from "@/api/estimates/estimates-by-id";
import { healthCheck } from "@/api/health";
import { searchMonday } from "@/api/monday";
import { listPermits } from "@/api/permits";
// -- Projects --
import { listProjects } from "@/api/projects/projects";
import { getProjectFinalSov } from "@/api/projects/projects-by-id";
// -- Takeoffs --
import { createTakeoff, listTakeoffs } from "@/api/takeoffs/takeoffs";
import {
  deleteTakeoff,
  getTakeoff,
  getTakeoffEstimate,
  getTakeoffPdf,
  updateTakeoff,
} from "@/api/takeoffs/takeoffs-by-id";
import { checkPdfExists, uploadPdf } from "@/api/upload";

// Bun.serve route handlers expect BunRequest<path> but our API handlers use standard
// Request. Cloudflare Workers types also pollute the global Request generic, causing
// type conflicts. This helper bridges the gap.
const h = (handler: unknown) => handler as never;

// Frontend - HTML entry point (Bun bundles automatically)
import homepage from "@/apps/web/frontend/index.html";

const STATIC_DIRS = ["./apps/web/frontend/public"];

async function findStaticFile(pathname: string) {
  for (const dir of STATIC_DIRS) {
    const staticFile = file(`${dir}${pathname}`);
    if (await staticFile.exists()) {
      return staticFile;
    }
  }
  return null;
}

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
    "/api/estimates/:id/finalize": {
      POST: h(finalizeEstimate),
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
    "/api/projects/:id/final-sov": {
      GET: h(getProjectFinalSov),
    },

    // Dust Permits
    "/api/permits": {
      GET: h(listPermits),
    },

    // Browser Automation / Permit Worker
    "/api/automation/status": {
      GET: h(getAutomationStatus),
    },
    "/api/automation/start": {
      POST: h(postAutomationStart),
    },
    "/api/automation/ready": {
      POST: h(postAutomationReady),
    },
    "/api/automation/keepalive": {
      POST: h(postAutomationKeepAlive),
    },
    "/api/automation/stop": {
      POST: h(postAutomationStop),
    },
    "/api/automation/clipboard/paste": {
      POST: h(postAutomationClipboardPaste),
    },
    "/api/automation/clipboard/copy": {
      POST: h(postAutomationClipboardCopy),
    },

    // Contracts (Won estimates)
    "/api/contracts": {
      GET: h(listContracts),
    },

    // Emails
    "/api/emails": {
      GET: h(listEmails),
    },
    "/api/emails/senders": {
      GET: h(listEmailSenders),
    },
    "/api/emails/spam": {
      POST: h(markDomainAsSpam),
    },
    "/api/emails/domain-rules": {
      GET: h(listDomainRules),
      POST: h(setDomainRule),
    },
    "/api/emails/:id": {
      GET: h(getEmail),
    },
    "/api/emails/:id/estimate-candidates": {
      GET: h(getEmailEstimateCandidates),
    },
    "/api/emails/:id/classification": {
      POST: h(setEmailClassification),
    },
    "/api/emails/:id/attachments": {
      GET: h(listEmailAttachments),
    },
    "/api/emails/:id/attachments/:attachmentId/download": {
      GET: h(downloadEmailAttachment),
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
    "/experiments": homepage,
    "/experiments/*": homepage,
    "/projects": homepage,
    "/projects/*": homepage,
    "/permits": homepage,
    "/permits/*": homepage,
    "/emails": homepage,
    "/emails/*": homepage,
    "/catalog": homepage,
    "/map": homepage,
    "/maricopa": homepage,
    "/automation": homepage,
    "/settings": homepage,
  },

  // Fallback handler for unmatched routes
  // Serves static files from package public dirs or falls back to SPA
  async fetch(req) {
    const url = new URL(req.url);
    const pathname = url.pathname;

    // Try to serve static file from web package public directory
    const staticFile = await findStaticFile(pathname);
    if (staticFile) {
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
