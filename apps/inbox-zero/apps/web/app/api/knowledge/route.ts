import { NextResponse } from "next/server";
import type { Knowledge } from "@/generated/prisma/client";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";

export type GetKnowledgeResponse = {
  items: Knowledge[];
};

export const GET = withEmailAccount("knowledge", async (request) => {
  const emailAccountId = request.auth.emailAccountId;
  const items = await prisma.knowledge.findMany({
    where: { emailAccountId },
    orderBy: { updatedAt: "desc" },
  });

  const result: GetKnowledgeResponse = { items };

  return NextResponse.json(result);
});
