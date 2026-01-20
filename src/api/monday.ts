/**
 * Monday.com API handlers
 * Routes: GET /api/monday/search
 */
import { db } from "../../lib/db";

// GET /api/monday/search - Search Monday cache
export function searchMonday(req: Request): Response {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q");
    const boardId = searchParams.get("boardId");
    const limit = Number.parseInt(searchParams.get("limit") || "20", 10);

    if (!query || query.length < 2) {
      return Response.json([]);
    }

    let items: unknown[] = [];

    // Try FTS5 search first
    try {
      if (boardId) {
        items = db
          .prepare(
            `
          SELECT m.* FROM monday_cache m
          JOIN monday_search_vectors v ON m.id = v.item_id
          WHERE v.board_id = ? AND monday_search_vectors MATCH ?
          ORDER BY rank
          LIMIT ?
        `
          )
          .all(boardId, query, limit);
      } else {
        items = db
          .prepare(
            `
          SELECT m.* FROM monday_cache m
          JOIN monday_search_vectors v ON m.id = v.item_id
          WHERE monday_search_vectors MATCH ?
          ORDER BY rank
          LIMIT ?
        `
          )
          .all(query, limit);
      }
    } catch {
      // Fallback to simple LIKE search if FTS5 fails
      const likeQuery = `%${query}%`;
      if (boardId) {
        items = db
          .prepare(
            `
          SELECT * FROM monday_cache
          WHERE board_id = ? AND (name LIKE ? OR column_values LIKE ?)
          LIMIT ?
        `
          )
          .all(boardId, likeQuery, likeQuery, limit);
      } else {
        items = db
          .prepare(
            `
          SELECT * FROM monday_cache
          WHERE name LIKE ? OR column_values LIKE ?
          LIMIT ?
        `
          )
          .all(likeQuery, likeQuery, limit);
      }
    }

    // Parse column_values JSON
    const results = (items as Record<string, unknown>[]).map((item) => ({
      ...item,
      column_values: JSON.parse(item.column_values as string),
    }));

    return Response.json(results);
  } catch (error) {
    console.error("Error searching Monday cache:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
