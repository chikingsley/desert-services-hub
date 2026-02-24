import type { Action } from "@/generated/prisma/client";
import { ActionType } from "@/generated/prisma/enums";

export function isDigestEnabled(ruleActions: Pick<Action, "type">[]) {
  return ruleActions.some((action) => action.type === ActionType.DIGEST);
}
