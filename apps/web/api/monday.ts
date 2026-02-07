/**
 * Monday.com search API handlers
 * Routes: GET /api/monday/search
 *
 * Searches the estimates table in hub.db (synced from Monday ESTIMATING board).
 */
import { db } from "@lib/db/hub";

// GET /api/monday/search - Search estimates
export async function searchMonday(req: Request): Promise<Response> {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q");
    const limit = Number.parseInt(searchParams.get("limit") || "20", 10);

    if (!query || query.length < 2) {
      return Response.json([]);
    }

    const likeQuery = `%${query}%`;
    const items = await db
      .prepare(
        `SELECT id, monday_item_id, name, estimate_number, contractor,
                bid_status, bid_value, awarded_value, group_title, monday_url
         FROM estimates
         WHERE name LIKE ? OR contractor LIKE ? OR estimate_number LIKE ?
         ORDER BY updated_at DESC
         LIMIT ?`
      )
      .all(likeQuery, likeQuery, likeQuery, limit);

    return Response.json(items);
  } catch (error) {
    console.error("Error searching estimates:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
