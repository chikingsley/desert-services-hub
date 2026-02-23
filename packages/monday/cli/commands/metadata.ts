import { getBoard, getBoardColumns } from "@monday/client/boards";
import { BOARD_IDS } from "@monday/types/schema";
import { getBoardNameArg } from "./args";
import { resolveBoardId } from "./shared";
import type { CommandHandler } from "./types";

export const metadataHandlers: Record<string, CommandHandler> = {
  boards: () => {
    console.log("Known boards:");
    for (const [name, id] of Object.entries(BOARD_IDS)) {
      console.log(`  ${name.toLowerCase()}: ${id}`);
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
