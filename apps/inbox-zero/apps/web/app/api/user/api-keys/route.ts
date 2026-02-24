import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import prisma from "@/utils/prisma";

export type ApiKeyResponse = Awaited<ReturnType<typeof getApiKeys>>;

async function getApiKeys({ userId }: { userId: string }) {
  const apiKeys = await prisma.apiKey.findMany({
    where: { userId, isActive: true },
    select: {
      id: true,
      name: true,
      createdAt: true,
    },
  });

  return { apiKeys };
}

export const GET = withAuth("user/api-keys", async (request) => {
  const userId = request.auth.userId;

  const apiKeys = await getApiKeys({ userId });

  return NextResponse.json(apiKeys);
});
