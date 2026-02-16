import { auditHandlers } from "./audit";
import { itemHandlers } from "./item";
import { metadataHandlers } from "./metadata";
import { searchHandlers } from "./search";
import type { CommandHandler } from "./types";
import { updateHandlers } from "./update";

export { showHelp } from "./args";

export const commandHandlers: Record<string, CommandHandler> = {
  ...itemHandlers,
  ...searchHandlers,
  ...metadataHandlers,
  ...updateHandlers,
  ...auditHandlers,
};
