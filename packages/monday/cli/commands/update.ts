import { updateItem } from "@monday/client";
import { resolveBoardId } from "../config";
import { getBoardNameArg, getJsonArg } from "./args";
import type { CommandHandler } from "./types";

export const updateHandlers: Record<string, CommandHandler> = {
  update: async (args) => {
    const boardName = getBoardNameArg(args);
    const itemId = args[2];
    if (!itemId) {
      throw new Error("Usage: update <board> <itemId> '<json>'");
    }

    const jsonStr = getJsonArg(args);
    const boardId = resolveBoardId(boardName);
    const columnValues = JSON.parse(jsonStr);

    await updateItem({
      boardId,
      columnValues,
      createLabelsIfMissing: true,
      itemId,
    });

    console.log(`Updated item ${itemId}`);
  },
};
