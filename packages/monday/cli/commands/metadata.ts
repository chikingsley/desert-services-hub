import { getBoard, getBoardColumns } from "@monday/client/boards";
import { BOARDS, resolveBoardId } from "../config";
import { getBoardNameArg } from "./args";
import type { CommandHandler } from "./types";

export const metadataHandlers: Record<string, CommandHandler> = {
  boards: () => {
    console.log("Known boards:");
    for (const [name, id] of Object.entries(BOARDS)) {
      console.log(`  ${name}: ${id}`);
    }
  },

  columns: async (args) => {
    const boardName = getBoardNameArg(args);
    const boardId = resolveBoardId(boardName);
    const columns = await getBoardColumns(boardId);
    for (const col of columns) {
      console.log(`  ${col.id} (${col.type}): ${col.title}`);
    }
  },

  groups: async (args) => {
    const boardName = getBoardNameArg(args);
    const boardId = resolveBoardId(boardName);
    const board = await getBoard(boardId);
    if (!board) {
      throw new Error(`Board ${boardId} not found`);
    }
    console.log(`${board.name} groups:`);
    for (const group of board.groups) {
      console.log(`  ${group.id}: ${group.title}`);
    }
  },
};
