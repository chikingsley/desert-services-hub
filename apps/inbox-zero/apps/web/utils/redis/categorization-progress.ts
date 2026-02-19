import { z } from "zod";
import { redis } from "@/utils/redis";

const categorizationProgressSchema = z.object({
  totalItems: z.number().int().min(0),
  completedItems: z.number().int().min(0),
});
type RedisCategorizationProgress = z.infer<typeof categorizationProgressSchema>;

function getKey({ emailAccountId }: { emailAccountId: string }) {
  return `categorization-progress:${emailAccountId}`;
}

export async function getCategorizationProgress({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const key = getKey({ emailAccountId });
  try {
    const progress = await redis.get<RedisCategorizationProgress>(key);
    if (!progress) return null;
    return progress;
  } catch {
    return null;
  }
}

export async function saveCategorizationTotalItems({
  emailAccountId,
  totalItems,
}: {
  emailAccountId: string;
  totalItems: number;
}) {
  const key = getKey({ emailAccountId });
  const existingProgress = await getCategorizationProgress({ emailAccountId });
  try {
    await redis.set(
      key,
      {
        ...existingProgress,
        totalItems: (existingProgress?.totalItems || 0) + totalItems,
      },
      { ex: 2 * 60 },
    );
  } catch {
    // no-op for self-hosted mode without Redis
  }
}

export async function saveCategorizationProgress({
  emailAccountId,
  incrementCompleted,
}: {
  emailAccountId: string;
  incrementCompleted: number;
}) {
  const existingProgress = await getCategorizationProgress({ emailAccountId });
  if (!existingProgress) return null;

  const key = getKey({ emailAccountId });
  const updatedProgress: RedisCategorizationProgress = {
    ...existingProgress,
    completedItems: (existingProgress.completedItems || 0) + incrementCompleted,
  };

  // Store progress for 2 minutes
  try {
    await redis.set(key, updatedProgress, { ex: 2 * 60 });
  } catch {
    // no-op for self-hosted mode without Redis
  }
  return updatedProgress;
}

export async function deleteCategorizationProgress({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const key = getKey({ emailAccountId });
  try {
    await redis.del(key);
  } catch {
    // no-op for self-hosted mode without Redis
  }
}
