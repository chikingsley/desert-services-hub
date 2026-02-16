import { runResolutionAudit } from "../audit/resolution";
import type { CommandHandler } from "./types";

export const auditHandlers: Record<string, CommandHandler> = {
  "audit-rel": async (args) => {
    const scope = args[1] ?? "all";
    const activeOnly = args.includes("--active-only");
    await runResolutionAudit(scope, activeOnly);
  },
};
