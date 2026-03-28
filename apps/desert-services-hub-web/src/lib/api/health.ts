import { z } from "zod";

import { requestJson } from "@/lib/api/client";

const databaseCheckSchema = z.object({
  error: z.string().optional(),
  latencyMs: z.number().int().nonnegative().optional(),
  ok: z.boolean(),
});

const healthResponseSchema = z
  .object({
    checks: z.object({
      db: databaseCheckSchema,
    }),
    status: z.string(),
    timestamp: z.string(),
  })
  .passthrough();

type HealthResponse = z.infer<typeof healthResponseSchema>;

export type HealthStatus =
  | {
      detail: string;
      httpStatus: number;
      kind: "reachable";
      label: string;
      payload: HealthResponse;
    }
  | {
      detail: string;
      kind: "unreachable";
      label: string;
    };

const describeHealth = (
  payload: HealthResponse,
  httpStatus: number
): Omit<Extract<HealthStatus, { kind: "reachable" }>, "payload"> => {
  const { db } = payload.checks;
  if (payload.status === "healthy" && db.ok) {
    const latencyDetail =
      db.latencyMs === undefined
        ? "Database responded successfully."
        : `Database responded in ${db.latencyMs}ms.`;

    return {
      detail: latencyDetail,
      httpStatus,
      kind: "reachable",
      label: "Backend reachable",
    };
  }

  return {
    detail: db.error ?? "The backend responded, but one or more checks failed.",
    httpStatus,
    kind: "reachable",
    label: "Backend degraded",
  };
};

export const getHealthStatus = async (
  signal?: AbortSignal
): Promise<HealthStatus> => {
  try {
    const { data, response } = await requestJson({
      init: { signal },
      path: "/health",
      schema: healthResponseSchema,
    });

    return {
      ...describeHealth(data, response.status),
      payload: data,
    };
  } catch (error) {
    const detail =
      error instanceof Error
        ? error.message
        : "Unexpected error while contacting /api/health.";

    return {
      detail,
      kind: "unreachable",
      label: "Backend unavailable",
    };
  }
};
