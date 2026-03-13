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
  postAutomationKeepAlive,
  postAutomationReady,
  postAutomationStart,
  postAutomationStop,
  postPermitRenewAndPay,
  postPermitSubmitDraftAndPay,
} from "@/api/automation";
import {
  getBuildingConnectedAuthStatus,
  postBuildingConnectedAuthStart,
  postBuildingConnectedAuthStop,
} from "@/api/buildingconnected-auth";
import { getCatalog, getTakeoffItems } from "@/api/catalog";
import {
  createCheckpoint,
  getCheckpoint,
  listCheckpoints,
  respondCheckpoint,
} from "@/api/checkpoints";
// -- Contracts --
import {
  getArchiveIndex,
  getAttachment,
  getConversation,
  listArchives,
} from "@/api/contracts/archive";
import {
  addContractEmailLink,
  getContractContext,
  removeContractEmailLink,
} from "@/api/contracts/context";
import { listContracts } from "@/api/contracts/contracts";
import { listContractReview } from "@/api/contracts/review";
import { updateContractStatus } from "@/api/contracts/status";
import {
  getDocumentReviewDetail,
  getDocumentReviewFile,
  listDocumentReview,
  rerunDocumentReview,
  updateDocumentReviewState,
} from "@/api/documents/review";
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
import {
  getEmailRelevanceReviewDetail,
  getEmailRelevanceRunStatus,
  listEmailRelevanceReview,
  runEmailRelevanceReview,
  updateEmailRelevanceReview,
} from "@/api/emails/relevance-review";
import {
  approveDomainClassification,
  classifyDomains,
  getClassifyStatus,
  getSenderReviewAudit,
  listSenderReview,
  refreshDomainEmailStats,
} from "@/api/emails/sender-review";
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
// -- Email compose (inbox API) --
import {
  composeEmail,
  listWritableMailboxes,
  replyToThread,
  sendDraftEmail,
} from "@/apps/web/api/emails/compose";
import { searchMonday } from "@/api/monday";
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

const STATIC_DIRS = [
  "./apps/web/frontend/public",
  "./apps/web/frontend/.bundle/apps/web/frontend",
];

const BUNDLED_MAIN_JS = file(
  "./apps/web/frontend/.bundle/apps/web/frontend/main.js"
);

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

    // Browser Automation / Permit Worker
    "/api/browser/status": {
      GET: h(getAutomationStatus),
    },
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
    "/api/buildingconnected/auth/status": {
      GET: h(getBuildingConnectedAuthStatus),
    },
    "/api/buildingconnected/auth/start": {
      POST: h(postBuildingConnectedAuthStart),
    },
    "/api/buildingconnected/auth/stop": {
      POST: h(postBuildingConnectedAuthStop),
    },
    "/api/permits/:id/renew-and-pay": {
      POST(req) {
        return postPermitRenewAndPay(req, req.params.id);
      },
    },
    "/api/permits/:id/submit-draft-and-pay": {
      POST(req) {
        return postPermitSubmitDraftAndPay(req, req.params.id);
      },
    },

    // Operator Checkpoints (interactive yes/no for automation)
    "/api/checkpoints": {
      GET: h(listCheckpoints),
      POST: h(createCheckpoint),
    },
    "/api/checkpoints/:id": {
      GET: h(getCheckpoint),
      PUT: h(respondCheckpoint),
    },

    // Contracts (Won estimates)
    "/api/contracts": {
      GET: h(listContracts),
    },
    "/api/contracts/:id/context": {
      GET: h(getContractContext),
    },
    "/api/contracts/:id/email-links": {
      POST: h(addContractEmailLink),
    },
    "/api/contracts/:id/email-links/:emailId": {
      DELETE: h(removeContractEmailLink),
    },
    "/api/contracts/:id/status": {
      PUT: h(updateContractStatus),
    },
    "/api/contracts/review": {
      GET: h(listContractReview),
    },
    "/api/documents/review": {
      GET: h(listDocumentReview),
    },
    "/api/documents/review/rerun": {
      POST: h(rerunDocumentReview),
    },
    "/api/documents/review/:id": {
      GET: h(getDocumentReviewDetail),
    },
    "/api/documents/review/:id/review": {
      PUT: h(updateDocumentReviewState),
    },
    "/api/documents/review/:id/file": {
      GET: h(getDocumentReviewFile),
    },
    "/docs": {
      GET(req) {
        return Response.redirect(new URL("/documents", req.url), 302);
      },
    },

    // Email compose/reply (used by ComposeModal on Emails page)
    "/api/inbox/compose": {
      POST: h(composeEmail),
    },
    "/api/inbox/reply": {
      POST: h(replyToThread),
    },
    "/api/inbox/send": {
      POST: h(sendDraftEmail),
    },
    "/api/inbox/mailboxes": {
      GET: h(listWritableMailboxes),
    },

    // Emails
    "/api/emails": {
      GET: h(listEmails),
    },
    "/api/emails/senders": {
      GET: h(listEmailSenders),
    },
    "/api/emails/sender-review": {
      GET: h(listSenderReview),
    },
    "/api/emails/sender-review/classify": {
      GET: h(getClassifyStatus),
      POST: h(classifyDomains),
    },
    "/api/emails/sender-review/classify/:domain": {
      POST: h(approveDomainClassification),
    },
    "/api/emails/sender-review/:domain/audit": {
      GET: h(getSenderReviewAudit),
    },
    "/api/emails/sender-review/refresh": {
      POST: h(() => {
        refreshDomainEmailStats();
        return Response.json({ ok: true });
      }),
    },
    "/api/emails/relevance-review": {
      GET: h(listEmailRelevanceReview),
    },
    "/api/emails/relevance-review/run": {
      GET: h(getEmailRelevanceRunStatus),
      POST: h(runEmailRelevanceReview),
    },
    "/api/emails/relevance-review/:id": {
      GET: h(getEmailRelevanceReviewDetail),
    },
    "/api/emails/relevance-review/:id/review": {
      PUT: h(updateEmailRelevanceReview),
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
    "/emails": homepage,
    "/emails/*": homepage,
    "/senders": homepage,
    "/senders/*": homepage,
    "/documents": homepage,
    "/documents/*": homepage,
    "/catalog": homepage,
    "/map": homepage,
    "/maricopa": homepage,
    "/buildingconnected": homepage,
    "/automation": homepage,
    "/settings": homepage,
    "/main.tsx": BUNDLED_MAIN_JS,
    "/main.js": BUNDLED_MAIN_JS,
  },

  // Fallback handler for unmatched routes.
  // Serve static files only; unknown routes should 404 instead of silently
  // aliasing to the SPA shell.
  async fetch(req) {
    const url = new URL(req.url);
    const pathname = url.pathname;

    // Try to serve static file from web package public directory
    const staticFile = await findStaticFile(pathname);
    if (staticFile) {
      return new Response(staticFile);
    }

    if (pathname.startsWith("/api/")) {
      return Response.json({ error: "Not Found" }, { status: 404 });
    }

    return new Response("Not Found", {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      status: 404,
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
