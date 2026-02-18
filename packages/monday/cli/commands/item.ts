import { getItemRich } from "@monday/client/rich";
import { getItemIdArg } from "./args";
import { formatItem } from "./shared";
import type { CommandHandler } from "./types";

export const itemHandlers: Record<string, CommandHandler> = {
  get: async (args) => {
    const itemId = getItemIdArg(args);
    const item = await getItemRich(itemId);
    if (!item) {
      throw new Error(`Item ${itemId} not found`);
    }
    formatItem(item);
  },
};
