import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q");
    const boardId = searchParams.get("boardId");
    const limit = Number.parseInt(searchParams.get("limit") || "20");

    if (!query || query.length < 2) {
      return NextResponse.json([]);
    }

    let items: any[] = [];

    // Try FTS5 search first
    try {
      if (boardId) {
        items = db
          .prepare(`
          SELECT m.* FROM monday_cache m
          JOIN monday_search_vectors v ON m.id = v.item_id
          WHERE v.board_id = ? AND monday_search_vectors MATCH ?
          ORDER BY rank
          LIMIT ?
        `)
          .all(boardId, query, limit);
      } else {
        items = db
          .prepare(`
          SELECT m.* FROM monday_cache m
          JOIN monday_search_vectors v ON m.id = v.item_id
          WHERE monday_search_vectors MATCH ?
          ORDER BY rank
          LIMIT ?
        `)
          .all(query, limit);
      }
    } catch (e) {
      // Fallback to simple LIKE search if FTS5 fails or is missing
      console.warn("FTS5 search failed, falling back to LIKE:", e);
      const likeQuery = `%${query}%`;
      if (boardId) {
        items = db
          .prepare(`
          SELECT * FROM monday_cache 
          WHERE board_id = ? AND (name LIKE ? OR column_values LIKE ?)
          LIMIT ?
        `)
          .all(boardId, likeQuery, likeQuery, limit);
      } else {
        items = db
          .prepare(`
          SELECT * FROM monday_cache 
          WHERE name LIKE ? OR column_values LIKE ?
          LIMIT ?
        `)
          .all(likeQuery, likeQuery, limit);
      }
    }

    // Parse column_values JSON
    const results = items.map((item) => ({
      ...item,
      column_values: JSON.parse(item.column_values),
    }));

    return NextResponse.json(results);
  } catch (error) {
    console.error("Error searching Monday cache:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
