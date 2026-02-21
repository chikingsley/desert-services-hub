/**
 * Permit MCP Tool Definitions
 *
 * Each tool wraps a PermitClient method with:
 * - LLM-facing descriptions (when to use, format hints, constraints)
 * - Zod input schemas with .describe() on every parameter
 * - Annotations (readOnlyHint, destructiveHint, idempotentHint)
 * - Error handling that returns isError:true (never throws)
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { PermitClient } from "@permits/client";
import { PermitWorkerError } from "@permits/client";

const PERMIT_ID_DESC =
  "Maricopa County dust permit number in D0XXXXXX format (e.g., D0063827)";

function json(data: unknown): {
  content: Array<{ type: "text"; text: string }>;
} {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function error(message: string): {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
} {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

async function wrap<T>(
  fn: () => Promise<T>
): Promise<
  | { content: Array<{ type: "text"; text: string }> }
  | { content: Array<{ type: "text"; text: string }>; isError: true }
> {
  try {
    const result = await fn();
    return json(result);
  } catch (err) {
    if (err instanceof PermitWorkerError) {
      return error(
        `Permit worker error (${err.status}) at ${err.endpoint}: ${err.message}`
      );
    }
    return error(
      `Unexpected error: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

export function registerPermitTools(
  server: McpServer,
  client: PermitClient
): void {
  // --------------------------------------------------------------------------
  // Health & Status
  // --------------------------------------------------------------------------

  server.registerTool(
    "permit_health",
    {
      title: "Check Permit Worker Health",
      description:
        "Check if the permit worker service is running and responsive. Use this before other permit operations to verify the service is available.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async () => wrap(() => client.health())
  );

  server.registerTool(
    "permit_browser_status",
    {
      title: "Permit Browser Status",
      description:
        "Get the status of the permit worker's browser session. Shows whether the browser is active, logged into the Maricopa County portal, and whether it's currently busy with an operation. Useful for diagnosing automation issues.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async () => wrap(() => client.browserStatus())
  );

  // --------------------------------------------------------------------------
  // Read Operations
  // --------------------------------------------------------------------------

  server.registerTool(
    "permit_list",
    {
      title: "List All Permits",
      description:
        "List all Maricopa County dust permits tracked in the system. Returns permit number, company name, project name, status, expiration date, and version history for each permit. Use this to find permits or get an overview of all active permits.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async () => wrap(() => client.listPermits())
  );

  server.registerTool(
    "permit_get",
    {
      title: "Get Permit Details",
      description:
        "Get detailed information about a specific Maricopa County dust permit. Returns company, project name, status, dates, address, and full version history. Use when you know the permit number and need its details.",
      inputSchema: {
        permitId: z.string().describe(PERMIT_ID_DESC),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ permitId }) => wrap(() => client.getPermit(permitId))
  );

  server.registerTool(
    "permit_search",
    {
      title: "Search Permits",
      description:
        "Search for Maricopa County dust permits by company name, project name, address, city, or permit ID. Uses full-text search with ranked results — Active permits are prioritized. Returns up to 20 matches. Use this when you need to find a permit but don't know the exact permit number.",
      inputSchema: {
        query: z
          .string()
          .describe(
            "Search query — company name, project name, address, permit ID, or any combination"
          ),
        limit: z
          .number()
          .optional()
          .describe("Max results to return (default 20, max 50)"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ query, limit }) =>
      wrap(() => client.searchPermits({ query, limit }))
  );

  server.registerTool(
    "permit_expiring",
    {
      title: "Get Expiring Permits",
      description:
        "Get all active permits expiring within a given number of days. Defaults to 30 days. Use this to identify permits that need renewal soon.",
      inputSchema: {
        days: z
          .number()
          .optional()
          .describe(
            "Number of days to look ahead for expiring permits (default 30, max 365)"
          ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ days }) => wrap(() => client.expiringPermits({ days }))
  );

  server.registerTool(
    "permit_scrape",
    {
      title: "Scrape Permit Data",
      description:
        "Scrape the latest permit data directly from the Maricopa County portal. Returns the full permit record including contact info, project details, locations, and dust control plan data. Use when you need current portal data that may be newer than what's in the local database.",
      inputSchema: {
        permitId: z.string().describe(PERMIT_ID_DESC),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async ({ permitId }) => wrap(() => client.scrape(permitId))
  );

  server.registerTool(
    "permit_scrape_pdf",
    {
      title: "Scrape Permit & Download PDF",
      description:
        "Scrape permit data from the Maricopa County portal AND download the permit PDF document. Returns both the scraped data and PDF. Use when you need the official permit document (e.g., for a contractor requesting their permit copy).",
      inputSchema: {
        permitId: z.string().describe(PERMIT_ID_DESC),
        outputDir: z
          .string()
          .optional()
          .describe(
            "Directory to save the PDF file. If omitted, PDF is returned as base64."
          ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async ({ permitId, outputDir }) =>
      wrap(() => client.scrapePdf({ permitId, outputDir }))
  );

  // --------------------------------------------------------------------------
  // Form Data Schema (for agents building form data)
  // --------------------------------------------------------------------------

  server.registerTool(
    "permit_form_schema",
    {
      title: "Get Permit Form Schema",
      description:
        "Get the JSON Schema definition of the FormData object used for creating dust permit applications. The schema describes all 200+ fields across Pages 1-5 of the Maricopa County permit application, including applicant info, project details, dust control plan categories A-K, water requirements, and more. Use this to understand the structure before creating or modifying permit applications.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async () => {
      try {
        const baseUrl =
          process.env.PERMIT_WORKER_URL ?? "http://localhost:47822";
        const resp = await fetch(`${baseUrl}/api/form/schema`);
        if (!resp.ok) {
          return error(`Failed to fetch form schema: HTTP ${resp.status}`);
        }
        const schema = await resp.json();
        return json(schema);
      } catch (err) {
        return error(
          `Failed to fetch form schema: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  );

  server.registerTool(
    "permit_form_defaults",
    {
      title: "Get Permit Form Defaults",
      description:
        "Get the default values used when creating a new dust permit application. Shows Desert Services' standard defaults for all form fields (contact info, dust control measures, water supply, etc.). Use this to see what values are pre-filled so you only need to override what's different for a specific project. Note: payment and internal metadata fields are excluded.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async () => {
      try {
        const baseUrl =
          process.env.PERMIT_WORKER_URL ?? "http://localhost:47822";
        const resp = await fetch(`${baseUrl}/api/form/defaults`);
        if (!resp.ok) {
          return error(`Failed to fetch form defaults: HTTP ${resp.status}`);
        }
        const defaults = await resp.json();
        return json(defaults);
      } catch (err) {
        return error(
          `Failed to fetch form defaults: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  );

  // --------------------------------------------------------------------------
  // Write Operations - Permit Lifecycle
  // --------------------------------------------------------------------------

  server.registerTool(
    "permit_create",
    {
      title: "Create Permit Application",
      description:
        "Create a new Maricopa County dust permit application using browser automation. This navigates the portal, fills out Pages 1-5, and stops at the review page (does NOT submit or pay). Requires specifying the flow type and company name. Use permit_form_defaults to see default values and only provide overrides for fields that differ.",
      inputSchema: {
        flow: z
          .enum(["new-company", "existing-company"])
          .describe(
            "Whether this is a brand new company in the portal or an existing one"
          ),
        companyName: z
          .string()
          .optional()
          .describe(
            "Company name to search for (required for existing-company flow)"
          ),
        copyFromApp: z
          .string()
          .optional()
          .describe(
            "Permit application number to copy form data from (e.g., D0063827-01)"
          ),
        formDataPath: z
          .string()
          .optional()
          .describe(
            "Path to a JSON file on the permit-worker filesystem containing form data overrides"
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async ({ flow, companyName, copyFromApp, formDataPath }) =>
      wrap(() =>
        client.createPermit({ flow, companyName, copyFromApp, formDataPath })
      )
  );

  server.registerTool(
    "permit_renew",
    {
      title: "Renew Permit",
      description:
        "Start the renewal process for an existing dust permit. This fills out the renewal form but does NOT submit or pay. Use this when you only need to prepare the renewal. For a full renewal including submission and payment, use permit_renew_and_pay instead.",
      inputSchema: {
        permitId: z.string().describe(PERMIT_ID_DESC),
        companyName: z
          .string()
          .optional()
          .describe(
            "Company name (required if it differs from the original permit)"
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async ({ permitId, companyName }) =>
      wrap(() =>
        client.renewPermit(permitId, companyName ? { companyName } : undefined)
      )
  );

  server.registerTool(
    "permit_renew_and_pay",
    {
      title: "Renew & Pay Permit",
      description:
        "Full permit renewal workflow: fills renewal form, submits the application, and processes payment with the company credit card on file. This is the most common renewal operation. CRITICAL SAFETY NOTE: The 'expedited' parameter defaults to FALSE. NEVER set expedited to true unless the user has explicitly requested accelerated processing — it costs significantly more money. The process includes operator confirmation checkpoints before submission and payment.",
      inputSchema: {
        permitId: z.string().describe(PERMIT_ID_DESC),
        companyName: z
          .string()
          .describe("Company name for the renewal (must match portal records)"),
        expedited: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            "SAFETY CRITICAL: Enable accelerated processing (extra fee). Defaults to FALSE. Only set to true if explicitly requested by the user."
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
      },
    },
    async ({ permitId, companyName, expedited }) =>
      wrap(() =>
        client.renewAndPay(permitId, {
          companyName,
          expedited: expedited ?? false,
        })
      )
  );

  server.registerTool(
    "permit_close",
    {
      title: "Close Permit",
      description:
        "Close/terminate a dust permit. Use when a construction project is completed and the permit is no longer needed, or when the permit should be closed for any other reason.",
      inputSchema: {
        permitId: z.string().describe(PERMIT_ID_DESC),
        reason: z
          .string()
          .optional()
          .describe(
            "Reason for closing (e.g., 'project completed', 'permit no longer needed')"
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
      },
    },
    async ({ permitId, reason }) =>
      wrap(() => client.closePermit(permitId, reason ? { reason } : undefined))
  );

  server.registerTool(
    "permit_revise",
    {
      title: "Revise Permit",
      description:
        "Submit a revision to an existing permit. Revisions are used to update specific aspects of a permit without creating a new application. Common revision types: boundary (change site boundary), acreage (update disturbed acreage), contact (update contact info), schedule (change dates), bmp (update best management practices), other.",
      inputSchema: {
        permitId: z.string().describe(PERMIT_ID_DESC),
        revisionType: z
          .string()
          .describe(
            "Type of revision: boundary, acreage, contact, schedule, bmp, or other"
          ),
        notes: z
          .string()
          .optional()
          .describe(
            "Additional notes about the revision (e.g., 'Update phone number to 555-1234')"
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async ({ permitId, revisionType, notes }) =>
      wrap(() => client.revisePermit(permitId, { revisionType, notes }))
  );

  server.registerTool(
    "permit_delete",
    {
      title: "Delete Draft Permit",
      description:
        "Delete a draft permit application that hasn't been submitted yet. Only works on applications in 'Draft' status. Use this to clean up abandoned or incorrect draft applications.",
      inputSchema: {
        permitId: z.string().describe(PERMIT_ID_DESC),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
      },
    },
    async ({ permitId }) => wrap(() => client.deletePermit(permitId))
  );

  // --------------------------------------------------------------------------
  // Sync
  // --------------------------------------------------------------------------

  server.registerTool(
    "permit_sync",
    {
      title: "Sync Permits from Portal",
      description:
        "Synchronize permit data from the Maricopa County portal to the local database. Fetches both company permits and marketing permits. Use when you suspect local data is stale or after manual portal changes.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async () => wrap(() => client.sync())
  );
}
