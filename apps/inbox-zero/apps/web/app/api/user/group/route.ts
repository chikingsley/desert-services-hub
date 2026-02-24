import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";

export type GroupsResponse = Awaited<ReturnType<typeof getGroups>>;

async function getGroups({ emailAccountId }: { emailAccountId: string }) {
  const groups = await prisma.group.findMany({
    where: { emailAccountId },
    select: {
      id: true,
      name: true,
      rule: { select: { id: true, name: true } },
      _count: { select: { items: true } },
    },
  });
  return { groups };
}

export const GET = withEmailAccount("user/group", async (request) => {
  const emailAccountId = request.auth.emailAccountId;
  const result = await getGroups({ emailAccountId });
  return NextResponse.json(result);
});
