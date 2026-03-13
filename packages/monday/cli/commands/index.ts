import { auditHandlers } from "./audit";
import { backfillHandlers } from "./backfill";
import { contractHandlers } from "./contract";
import { itemHandlers } from "./item";
import { metadataHandlers } from "./metadata";
import { searchHandlers } from "./search";
import type { CommandHandler } from "./types";
import { updateHandlers } from "./update";

export const commandHandlers: Record<string, CommandHandler> = {
  ...backfillHandlers,
  ...itemHandlers,
  ...searchHandlers,
  ...metadataHandlers,
  ...contractHandlers,
  ...updateHandlers,
  ...auditHandlers,
};
