/**
 * Monday.com search API handlers
 * Routes: GET /api/monday/search
 *
 * Searches the estimates table in hub.db (synced from Monday ESTIMATING board).
 */
import { likeSearch } from "@lib/db/search";

// GET /api/monday/search - Search estimates
export async function searchMonday(req: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q");
    const limit = Number.parseInt(searchParams.get("limit") || "20", 10);

    if (!query || query.length < 2) {
      return Response.json([]);
    }

    const items = await likeSearch({
      table: "estimates",
      select: `id, monday_item_id, name, estimate_number, contractor,
               bid_status, bid_value, awarded_value, group_title, monday_url`,
      columns: ["name", "contractor", "estimate_number"],
      query,
      orderBy: "updated_at DESC",
      limit,
    });

    return Response.json(items);
  } catch (error) {
    console.error("Error searching estimates:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
