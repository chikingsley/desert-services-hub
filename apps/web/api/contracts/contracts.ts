/**
 * Contracts API handlers
 * Route: GET /api/contracts
 */
import {
  multiFilter,
  paginationSchema,
  parseQuery,
  searchParam,
  sortParam,
} from "@/api/validation";
import { db, type SqlParam } from "@lib/db/client";
import {
  clearContractsListInflight,
  getCachedContractsListResponse,
  getContractsListCacheKey,
  getContractsListInflight,
  setCachedContractsListResponse,
  setContractsListInflight,
} from "@/api/contracts/cache";
import {
  formatErrorForLog,
  isApiDbTimeoutError,
  withApiDbTimeout,
} from "@/api/utils/db-guard";

const SORT_FIELDS = [
  "updated_at",
  "name",
  "contractor",
  "total",
  "contract_status",
] as const;
type SortField = (typeof SORT_FIELDS)[number];

const contractsQuerySchema = paginationSchema.extend({
  q: searchParam,
  status: multiFilter,
  sort: sortParam(SORT_FIELDS, "updated_at"),
});
const MAX_CONTRACTS_PER_PAGE = 100;

interface ContractRow {
  awarded_value: number | null;
  bid_status: string | null;
  bid_value: number | null;
  contract_status: string | null;
  contractor: string | null;
  created_at: string;
  due_date: string | null;
  dust_permit_status: string | null;
  estimate_number: string | null;
  group_id: string | null;
  id: number;
  location: string | null;
  monday_item_id: string | null;
  name: string;
  noi_status: string | null;
  project_id: number | null;
  project_name: string | null;
  safety_status: string | null;
  updated_at: string;
}

interface ContractsListPayload {
  facets: {
    contractStatuses: Array<{ status: string; count: number }>;
  };
  items: ContractRow[];
  pagination: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
  summary: {
    totalValue: number;
  };
}

function getSortExpression(field: SortField): string {
  switch (field) {
    case "name":
      return "LOWER(e.name)";
    case "contractor":
      return "LOWER(COALESCE(e.contractor, ''))";
    case "total":
      return "COALESCE(e.awarded_value, e.bid_value, 0)";
    case "contract_status":
      return "LOWER(COALESCE(proj.contract_status, 'Unlinked'))";
    default:
      return "e.updated_at";
  }
}

function includeContractsMeta(raw: string | null): boolean {
  if (raw == null) {
    return true;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized !== "0" && normalized !== "false";
}

export async function listContracts(req: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const url = new URL(req.url);
    const { page, perPage, q, status, sort } = parseQuery(
      url,
      contractsQuerySchema
    );
    const includeMeta = includeContractsMeta(url.searchParams.get("includeMeta"));
    const effectivePerPage = Math.min(perPage, MAX_CONTRACTS_PER_PAGE);
    const cacheKey = getContractsListCacheKey(url);

    const cachedPayload =
      getCachedContractsListResponse<ContractsListPayload>(cacheKey);
    if (cachedPayload) {
      return Response.json(cachedPayload);
    }

    const inflightPayload =
      getContractsListInflight<ContractsListPayload>(cacheKey);
    if (inflightPayload) {
      return Response.json(await inflightPayload);
    }

    const payloadPromise = (async (): Promise<ContractsListPayload> => {
      const conditions: string[] = ["e.bid_status = 'Won'"];
      const params: SqlParam[] = [];

      if (status.length > 0) {
        const offset = params.length;
        conditions.push(
          `COALESCE(proj.contract_status, 'Unlinked') IN (${status.map((_, i) => `$${offset + i + 1}`).join(", ")})`
        );
        params.push(...status);
      }

      if (q) {
        const like = `%${q}%`;
        const offset = params.length;
        conditions.push(
          `(e.name ILIKE $${offset + 1} OR e.contractor ILIKE $${offset + 2} OR e.estimate_number ILIKE $${offset + 3} OR e.location ILIKE $${offset + 4} OR proj.project_name ILIKE $${offset + 5})`
        );
        params.push(like, like, like, like, like);
      }

      const where = `WHERE ${conditions.join(" AND ")}`;
      const orderBy = getSortExpression(sort.field);
      const offset = (page - 1) * effectivePerPage;

      const limitParam = `$${params.length + 1}`;
      const offsetParam = `$${params.length + 2}`;

      // Bun SQL + unnamed statements can cross-wire bind counts when mixed
      // placeholder shapes execute in parallel on the same pooled connection.
      // Keep these sequential to avoid intermittent ERR_POSTGRES_SERVER_ERROR.
      const items = (await withApiDbTimeout(
        {
          operation: "contracts.items",
          requestId,
          route: "/api/contracts",
        },
        () =>
          db
            .query(
              `SELECT
              e.id, e.monday_item_id, e.name, e.estimate_number,
              e.contractor, e.group_id, e.bid_status, e.bid_value,
              e.awarded_value, e.due_date, e.location,
              proj.project_id, proj.project_name,
              proj.contract_status, proj.dust_permit_status,
              proj.noi_status, proj.safety_status,
              e.created_at, e.updated_at
             FROM estimates e
             LEFT JOIN LATERAL (
                SELECT
                  p.id as project_id,
                  p.name as project_name,
                  p.contract_status,
                  p.dust_permit_status,
                  p.noi_status,
                  p.swppp_status as safety_status
                FROM project_estimates pe
                JOIN projects p ON p.id = pe.project_id
                WHERE pe.estimate_id = e.id
                ORDER BY pe.created_at DESC NULLS LAST, p.id DESC
                LIMIT 1
             ) proj ON true
             ${where}
            ORDER BY ${orderBy} ${sort.direction.toUpperCase()}, e.id DESC
             LIMIT ${limitParam} OFFSET ${offsetParam}`
            )
            .all(...params, effectivePerPage, offset)
      )) as ContractRow[];

      let total = items.length;
      let facetRows: Array<{ status: string; count: number }> = [];
      let totalValue = 0;

      if (includeMeta) {
        const countResult = (await withApiDbTimeout(
          {
            operation: "contracts.count",
            requestId,
            route: "/api/contracts",
          },
          () =>
            db
              .query(
                `SELECT count(*)::int as total
               FROM estimates e
               LEFT JOIN LATERAL (
                  SELECT p.contract_status, p.name as project_name
                  FROM project_estimates pe
                  JOIN projects p ON p.id = pe.project_id
                  WHERE pe.estimate_id = e.id
                  ORDER BY pe.created_at DESC NULLS LAST, p.id DESC
                  LIMIT 1
               ) proj ON true
               ${where}`
              )
              .get(...params)
        )) as { total: number } | null;

        facetRows = (await withApiDbTimeout(
          {
            operation: "contracts.facets",
            requestId,
            route: "/api/contracts",
          },
          () =>
            db
              .query(
                `SELECT COALESCE(proj.contract_status, 'Unlinked') as status, COUNT(*)::int as count
               FROM estimates e
               LEFT JOIN LATERAL (
                  SELECT p.contract_status
                  FROM project_estimates pe
                  JOIN projects p ON p.id = pe.project_id
                  WHERE pe.estimate_id = e.id
                  ORDER BY pe.created_at DESC NULLS LAST, p.id DESC
                  LIMIT 1
               ) proj ON true
               WHERE e.bid_status = 'Won'
               GROUP BY COALESCE(proj.contract_status, 'Unlinked')
               ORDER BY COALESCE(proj.contract_status, 'Unlinked') ASC`
              )
              .all()
        )) as Array<{ status: string; count: number }>;

        const valueRow = (await withApiDbTimeout(
          {
            operation: "contracts.total-value",
            requestId,
            route: "/api/contracts",
          },
          () =>
            db
              .query(
                `SELECT COALESCE(SUM(COALESCE(awarded_value, bid_value, 0)), 0)::bigint as total_value
               FROM estimates
               WHERE bid_status = 'Won'`
              )
              .get()
        )) as { total_value: number } | null;

        total = countResult?.total ?? 0;
        totalValue = valueRow?.total_value ?? 0;
      }

      return {
        items,
        pagination: {
          page,
          perPage: effectivePerPage,
          total,
          totalPages: Math.max(1, Math.ceil(total / effectivePerPage)),
        },
        facets: {
          contractStatuses: facetRows,
        },
        summary: {
          totalValue,
        },
      };
    })();

    setContractsListInflight(cacheKey, payloadPromise);
    try {
      const payload = await payloadPromise;
      setCachedContractsListResponse(cacheKey, payload);
      return Response.json(payload);
    } finally {
      clearContractsListInflight(cacheKey);
    }
  } catch (error) {
    console.error("[api.contracts] failed", {
      requestId,
      route: "/api/contracts",
      error: formatErrorForLog(error),
    });
    if (isApiDbTimeoutError(error)) {
      return Response.json(
        {
          error: "Contracts query timed out",
          requestId,
        },
        { status: 503 }
      );
    }
    return Response.json(
      { error: "Failed to fetch contracts", requestId },
      { status: 500 }
    );
  }
}
