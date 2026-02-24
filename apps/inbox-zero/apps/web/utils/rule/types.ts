import type { Action, Prisma, Rule } from "@/generated/prisma/client";
import type { createRule } from "@/utils/rule/rule";

export type CreateRuleResult = NonNullable<
  Awaited<ReturnType<typeof createRule>>
>;

export type RuleWithRelations = Rule & {
  actions: Action[];
  group?:
    | (Prisma.GroupGetPayload<{
        select: { id: true; name: true };
      }> & {
        items?:
          | Prisma.GroupItemGetPayload<{
              select: { id: true; type: true; value: true };
            }>[]
          | null;
      })
    | null;
};
