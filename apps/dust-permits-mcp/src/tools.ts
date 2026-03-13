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
import type { PermitClient } from "@/apps/dust-permits-mcp/client";
import { PermitWorkerError } from "@/apps/dust-permits-mcp/client";

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

  server.registerTool(
    "permit_browser_abort",
    {
      title: "Emergency Abort Permit Operation",
      description:
        "Emergency kill switch for permit automation. Force-stops any in-flight browser operation by tearing down the current browser session. Use when an operation was started by mistake or appears stuck.",
      inputSchema: {
        reason: z
          .string()
          .optional()
          .describe(
            "Optional reason recorded with the abort (e.g., 'operator requested stop')"
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
      },
    },
    async ({ reason }) => wrap(() => client.browserAbort({ reason }))
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
  // NOI (Notice of Intent) Triage & Auto-Create
  // --------------------------------------------------------------------------

  server.registerTool(
    "permit_noi_resolve",
    {
      title: "Resolve NOI for Permit Filing",
      description:
        "Validate a Notice of Intent (NOI) identifier against AZDEQ, look up the parcel at Maricopa County Assessor, and check whether acreage and pricing tier qualify for automated permit creation. Returns the triage decision, company match status (whether the company is already known in our system), and a ready-to-use create payload. Use this to check feasibility before filing. Does NOT create anything.",
      inputSchema: {
        identifier: z
          .string()
          .describe(
            "NOI identifier — accepts AZC# (e.g., AZC114575), LTF# (e.g., LTF#114575), or bare digits (e.g., 114575)"
          ),
        disturbedAcres: z
          .number()
          .optional()
          .describe(
            "Override disturbed acres (otherwise parsed from NOI record)"
          ),
        companyName: z
          .string()
          .optional()
          .describe("Override company name (otherwise parsed from NOI record)"),
        flow: z
          .enum(["new-company", "existing-company"])
          .optional()
          .describe(
            "Force flow type. If omitted, defaults to existing-company. Check companyMatch in response to see if the company was found in our database."
          ),
        copyFromApp: z
          .string()
          .optional()
          .describe(
            "Permit application ID to copy form data from (e.g., D0063827-01)"
          ),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ identifier, disturbedAcres, companyName, flow, copyFromApp }) =>
      wrap(() =>
        client.resolveNoi({
          identifier,
          disturbedAcres,
          companyName,
          flow,
          copyFromApp,
        })
      )
  );

  server.registerTool(
    "permit_noi_create",
    {
      title: "Create Permit from NOI",
      description:
        "Same validation as permit_noi_resolve, but if all checks pass (Maricopa county, parcel acreage fits, same pricing tier), automatically triggers permit creation via browser automation. Fills Pages 1-5 and stops at review (does NOT submit or pay). Set create=false for a dry-run that validates without creating.",
      inputSchema: {
        identifier: z
          .string()
          .describe(
            "NOI identifier — accepts AZC# (e.g., AZC114575), LTF# (e.g., LTF#114575), or bare digits (e.g., 114575)"
          ),
        disturbedAcres: z
          .number()
          .optional()
          .describe(
            "Override disturbed acres (otherwise parsed from NOI record)"
          ),
        companyName: z
          .string()
          .optional()
          .describe("Override company name (otherwise parsed from NOI record)"),
        flow: z
          .enum(["new-company", "existing-company"])
          .optional()
          .describe(
            "Force flow type. If omitted, defaults to existing-company."
          ),
        copyFromApp: z
          .string()
          .optional()
          .describe(
            "Permit application ID to copy form data from (e.g., D0063827-01)"
          ),
        create: z
          .boolean()
          .optional()
          .default(true)
          .describe(
            "Set to false for dry-run: validates everything but skips permit creation. Default: true"
          ),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async ({
      identifier,
      disturbedAcres,
      companyName,
      flow,
      copyFromApp,
      create,
    }) =>
      wrap(() =>
        client.createFromNoi({
          identifier,
          disturbedAcres,
          companyName,
          flow,
          copyFromApp,
          create: create ?? true,
        })
      )
  );

  server.registerTool(
    "permit_pima_lookup",
    {
      title: "Lookup Pima County Parcels",
      description:
        "Resolve Pima County parcel data by AZDEQ NOI identifier, street address, parcel number, or direct coordinates. Use this for Tucson/Pima jobs when you need a quick parcel anchor from an NOI or address without going through the Maricopa-only permit flow.",
      inputSchema: {
        identifier: z
          .string()
          .optional()
          .describe(
            "AZDEQ NOI identifier — accepts AZC#, LTF#, or bare digits (for example 114964)"
          ),
        address: z
          .string()
          .optional()
          .describe("Street address to search in Pima County"),
        parcel: z
          .string()
          .optional()
          .describe("Pima parcel/APN with or without dashes"),
        latitude: z
          .number()
          .optional()
          .describe("Latitude for direct coordinate lookup"),
        longitude: z
          .number()
          .optional()
          .describe("Longitude for direct coordinate lookup"),
        distanceFeet: z
          .number()
          .optional()
          .describe(
            "Optional point buffer in feet when resolving parcels from coordinates or NOI"
          ),
        includeGeometry: z
          .boolean()
          .optional()
          .default(false)
          .describe("Include parcel polygon coordinates in the response"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({
      identifier,
      address,
      parcel,
      latitude,
      longitude,
      distanceFeet,
      includeGeometry,
    }) =>
      wrap(() =>
        client.pimaLookup({
          identifier,
          address,
          parcel,
          latitude,
          longitude,
          distanceFeet,
          includeGeometry,
        })
      )
  );

  server.registerTool(
    "permit_maricopa_lookup",
    {
      title: "Lookup Maricopa County Parcels",
      description:
        "Resolve Maricopa County parcel data by AZDEQ NOI identifier, street address, parcel/APN, or direct coordinates. Use this as a quick lookup helper outside the stricter permit_noi_resolve permit-creation workflow.",
      inputSchema: {
        identifier: z
          .string()
          .optional()
          .describe(
            "AZDEQ NOI identifier — accepts AZC#, LTF#, or bare digits"
          ),
        address: z
          .string()
          .optional()
          .describe("Street address to search in Maricopa County"),
        parcel: z
          .string()
          .optional()
          .describe("Maricopa parcel/APN with or without dashes"),
        latitude: z
          .number()
          .optional()
          .describe("Latitude for direct coordinate lookup"),
        longitude: z
          .number()
          .optional()
          .describe("Longitude for direct coordinate lookup"),
        includeGeometry: z
          .boolean()
          .optional()
          .default(false)
          .describe("Include parcel polygon coordinates in the response"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ identifier, address, parcel, latitude, longitude, includeGeometry }) =>
      wrap(() =>
        client.maricopaLookup({
          identifier,
          address,
          parcel,
          latitude,
          longitude,
          includeGeometry,
        })
      )
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
        formData: z
          .object({})
          .passthrough()
          .optional()
          .describe(
            "Inline form data overrides (alternative to formDataPath). Provide only fields that differ from defaults."
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
    async ({ flow, companyName, copyFromApp, formData, formDataPath }) =>
      wrap(() =>
        client.createPermit({
          flow,
          companyName,
          copyFromApp,
          formData,
          formDataPath,
        })
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
    "permit_submit_draft_and_pay",
    {
      title: "Submit & Pay Draft Permit",
      description:
        "Resume an existing approved draft permit application, submit it, and process payment without recreating the renewal. If applicationId is omitted, the latest draft linked to the permit ID is used.",
      inputSchema: {
        permitId: z.string().describe(PERMIT_ID_DESC),
        applicationId: z
          .string()
          .optional()
          .describe(
            "Specific draft application ID to submit. If omitted, the latest linked draft is used."
          ),
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
    async ({ permitId, applicationId, expedited }) =>
      wrap(() =>
        client.submitDraftAndPay(permitId, {
          applicationId,
          expedited: expedited ?? false,
        })
      )
  );

  server.registerTool(
    "permit_close",
    {
      title: "Close Permit",
      description:
        "Close/terminate a dust permit. Primary use: project has been completed. The worker uses a hardcoded default close reason unless a custom reason is explicitly provided.",
      inputSchema: {
        permitId: z.string().describe(PERMIT_ID_DESC),
        reason: z
          .string()
          .optional()
          .describe(
            "Optional custom reason. Default reason is hardcoded to 'Project has been completed.'"
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
