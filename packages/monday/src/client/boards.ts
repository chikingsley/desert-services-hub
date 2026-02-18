/**
 * Board-level operations.
 */
import type { MondayBoard, MondayColumn } from "@monday/types/schema";
import { query } from "./query";

/**
 * Get board information.
 */
export async function getBoard(boardId: string): Promise<MondayBoard | null> {
  const result = await query<{
    boards: {
      id: string;
      name: string;
      groups: Array<{ id: string; title: string }>;
    }[];
  }>(`
    query {
      boards(ids: ${boardId}) {
        id
        name
        groups {
          id
          title
        }
      }
    }
  `);

  return result.boards[0] ?? null;
}

/**
 * Get board columns schema.
 */
export async function getBoardColumns(
  boardId: string
): Promise<MondayColumn[]> {
  const result = await query<{
    boards: {
      columns: Array<{ id: string; title: string; type: string }>;
    }[];
  }>(`
    query {
      boards(ids: ${boardId}) {
        columns {
          id
          title
          type
        }
      }
    }
  `);

  return result.boards[0]?.columns ?? [];
}
