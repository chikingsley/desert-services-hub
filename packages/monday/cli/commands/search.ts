import { searchByColumnValue, searchItems } from "@monday/client/search";
import { resolveBoardId } from "../config";
import { getBoardNameArg } from "./args";
import { formatItem } from "./shared";
import type { CommandHandler } from "./types";

export const searchHandlers: Record<string, CommandHandler> = {
  search: async (args) => {
    const boardName = getBoardNameArg(args);
    const query = args[2];
    if (!query) {
      throw new Error("Usage: search <board> <query>");
    }
    const boardId = resolveBoardId(boardName);
    const items = await searchItems(boardId, query);
    console.log(`Found ${items.length} results:`);
    for (const item of items) {
      console.log(`  ${item.id}: ${item.name} (${item.groupTitle})`);
    }
  },

  "search-col": async (args) => {
    const boardName = getBoardNameArg(args);
    const colId = args[2];
    const value = args[3];
    if (!(colId && value)) {
      throw new Error("Usage: search-col <board> <colId> <value>");
    }
    const boardId = resolveBoardId(boardName);
    const items = await searchByColumnValue(boardId, colId, value);
    console.log(`Found ${items.length} results:`);
    for (const item of items) {
      formatItem(item);
    }
  },
};
