import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type SitelineClient, SitelineError } from "@siteline/client";
import { z } from "zod";

const CURRENT_COMPANY_OUTPUT_SCHEMA = z.object({
  currentCompany: z.object({
    id: z.string(),
    name: z.string(),
  }),
});

const PROJECT_OUTPUT_SCHEMA = z.object({
  id: z.string(),
  name: z.string(),
  projectNumber: z.string(),
});

const CONTRACT_SUMMARY_OUTPUT_SCHEMA = z.object({
  contractNumber: z.string().nullable(),
  id: z.string(),
  internalProjectNumber: z.string().nullable(),
  project: PROJECT_OUTPUT_SCHEMA,
  status: z.string(),
});

const LIST_CONTRACTS_OUTPUT_SCHEMA = z.object({
  paginatedContracts: z.object({
    contracts: z.array(CONTRACT_SUMMARY_OUTPUT_SCHEMA),
    cursor: z.string().nullable(),
    hasNext: z.boolean(),
  }),
});

const PAY_APP_SUMMARY_OUTPUT_SCHEMA = z.object({
  billingEnd: z.string(),
  billingStart: z.string(),
  id: z.string(),
  payAppNumber: z.number(),
  status: z.string(),
  submittedAt: z.string().nullable(),
});

const LIST_PAY_APPS_OUTPUT_SCHEMA = z.object({
  paginatedPayApps: z.object({
    cursor: z.string().nullable(),
    hasNext: z.boolean(),
    payApps: z.array(PAY_APP_SUMMARY_OUTPUT_SCHEMA),
  }),
});

const CONTRACT_OUTPUT_SCHEMA = z.object({
  contract: z.object({
    contractNumber: z.string().nullable(),
    id: z.string(),
    internalProjectNumber: z.string().nullable(),
    payApps: z.array(
      z.object({
        id: z.string(),
        payAppNumber: z.number(),
        status: z.string(),
      })
    ),
    project: PROJECT_OUTPUT_SCHEMA,
    status: z.string(),
  }),
});

const PAY_APP_OUTPUT_SCHEMA = z.object({
  payApp: z.object({
    billingEnd: z.string(),
    billingStart: z.string(),
    currentBilled: z.number(),
    currentRetention: z.number(),
    id: z.string(),
    payAppNumber: z.number(),
    progress: z.array(
      z.object({
        id: z.string(),
        progressBilled: z.number(),
        sovLineItem: z.object({
          code: z.string().nullable(),
          id: z.string(),
          name: z.string(),
        }),
        storedMaterialBilled: z.number(),
        totalValue: z.number(),
      })
    ),
    status: z.string(),
    submittedAt: z.string().nullable(),
    timeZone: z.string(),
    totalRetention: z.number(),
  }),
});

const RAW_QUERY_OUTPUT_SCHEMA = z.record(z.string(), z.unknown());

function success<TData extends object>(
  data: TData
): {
  content: Array<{ type: "text"; text: string }>;
  structuredContent: Record<string, unknown>;
} {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    structuredContent: data as Record<string, unknown>,
  };
}

function failure(message: string): {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
} {
  return { content: [{ type: "text", text: message }], isError: true };
}

async function wrap<TData extends object>(
  fn: () => Promise<TData>
): Promise<
  | {
      content: Array<{ type: "text"; text: string }>;
      structuredContent: Record<string, unknown>;
    }
  | {
      content: Array<{ type: "text"; text: string }>;
      isError: true;
    }
> {
  try {
    const result = await fn();
    return success(result);
  } catch (error) {
    if (error instanceof SitelineError) {
      return failure(error.message);
    }
    return failure(
      `Unexpected error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export function registerSitelineTools(
  server: McpServer,
  client: SitelineClient
): void {
  server.registerTool(
    "siteline_current_company",
    {
      title: "Get Siteline Current Company",
      description:
        "Run a safe read-only auth check and return the current Siteline company for this API key.",
      outputSchema: CURRENT_COMPANY_OUTPUT_SCHEMA,
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
        readOnlyHint: true,
      },
    },
    async () => wrap(() => client.currentCompany())
  );

  server.registerTool(
    "siteline_list_contracts",
    {
      title: "List Siteline Contracts",
      description:
        "Read-only paginated contract listing with optional filters. Includes project id/name/number per contract.",
      inputSchema: {
        contractStatus: z
          .string()
          .optional()
          .describe("Optional contract status filter (e.g. ACTIVE)"),
        cursor: z
          .string()
          .nullable()
          .optional()
          .describe("Pagination cursor from prior response"),
        limit: z
          .number()
          .min(1)
          .max(50)
          .optional()
          .describe("Max contracts to return (1-50)"),
        month: z
          .string()
          .optional()
          .describe("Optional billing month filter in YYYY-MM format"),
        payAppStatus: z
          .string()
          .optional()
          .describe("Optional pay app status filter"),
        search: z
          .string()
          .optional()
          .describe("Optional free-text search across contracts/projects"),
      },
      outputSchema: LIST_CONTRACTS_OUTPUT_SCHEMA,
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
        readOnlyHint: true,
      },
    },
    async ({ contractStatus, cursor, limit, month, payAppStatus, search }) =>
      wrap(() =>
        client.paginatedContracts({
          contractStatus,
          cursor,
          limit,
          month,
          payAppStatus,
          search,
        })
      )
  );

  server.registerTool(
    "siteline_get_contract",
    {
      title: "Get Siteline Contract",
      description:
        "Read-only query for a single contract by id, including project and pay app summaries.",
      inputSchema: {
        id: z.string().describe("Siteline contract id"),
      },
      outputSchema: CONTRACT_OUTPUT_SCHEMA,
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
        readOnlyHint: true,
      },
    },
    async ({ id }) => wrap(() => client.contract(id))
  );

  server.registerTool(
    "siteline_list_pay_apps",
    {
      title: "List Siteline Pay Apps",
      description:
        "Read-only paginated pay app listing with optional status/month filters.",
      inputSchema: {
        cursor: z
          .string()
          .nullable()
          .optional()
          .describe("Pagination cursor from prior response"),
        limit: z
          .number()
          .min(1)
          .max(50)
          .optional()
          .describe("Max pay apps to return (1-50)"),
        paidInMonth: z
          .string()
          .optional()
          .describe("Filter by paid month in YYYY-MM format"),
        status: z
          .string()
          .optional()
          .describe("Filter by pay app status (e.g. PROPOSED, PAID, SYNCED)"),
        submittedInMonth: z
          .string()
          .optional()
          .describe("Filter by submitted month in YYYY-MM format"),
      },
      outputSchema: LIST_PAY_APPS_OUTPUT_SCHEMA,
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
        readOnlyHint: true,
      },
    },
    async ({ cursor, limit, paidInMonth, status, submittedInMonth }) =>
      wrap(() =>
        client.paginatedPayApps({
          cursor,
          limit,
          paidInMonth,
          status,
          submittedInMonth,
        })
      )
  );

  server.registerTool(
    "siteline_get_pay_app",
    {
      title: "Get Siteline Pay App",
      description:
        "Read-only query for a single pay app by id with billing and progress values.",
      inputSchema: {
        id: z.string().describe("Siteline pay app id"),
      },
      outputSchema: PAY_APP_OUTPUT_SCHEMA,
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
        readOnlyHint: true,
      },
    },
    async ({ id }) => wrap(() => client.payApp(id))
  );

  server.registerTool(
    "siteline_query",
    {
      title: "Run Read-Only Siteline GraphQL Query",
      description:
        "Run a read-only GraphQL query against Siteline. Mutations/subscriptions are rejected to keep testing non-destructive.",
      inputSchema: {
        query: z
          .string()
          .describe(
            "GraphQL query text. Must be read-only (query or selection-set)."
          ),
        variables: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Optional GraphQL variables object"),
      },
      outputSchema: RAW_QUERY_OUTPUT_SCHEMA,
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
        readOnlyHint: true,
      },
    },
    async ({ query, variables }) =>
      wrap(() =>
        client.queryReadOnly<Record<string, unknown>>(query, variables)
      )
  );
}
