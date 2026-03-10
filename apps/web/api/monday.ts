/**
 * Monday.com search API handlers
 * Routes: GET /api/monday/search
 *
 * Searches the estimates table in Supabase Postgres (synced from Monday ESTIMATING board).
 */
import { parseQuery, searchParam } from "@/api/validation";
import { likeSearch } from "@lib/db/search";
import { z } from "zod";

const mondaySearchSchema = z.object({
  q: searchParam,
  limit: z.coerce.number().int().min(1).max(100).catch(20),
});

// GET /api/monday/search - Search estimates
export async function searchMonday(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url);
    const { q, limit } = parseQuery(url, mondaySearchSchema);

    if (!q || q.length < 2) {
      return Response.json([]);
    }

    const items = await likeSearch({
      table: "estimates",
      select: `id, monday_item_id, name, estimate_number, contractor,
               bid_status, bid_value, awarded_value, group_title, monday_url`,
      columns: ["name", "contractor", "estimate_number"],
      query: q,
      orderBy: "updated_at DESC",
      limit,
    });

    return Response.json(items);
  } catch (error) {
    console.error("Error searching estimates:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
