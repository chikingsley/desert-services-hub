import { z } from "zod";

import { apiBasePath } from "@/lib/env";

const errorPayloadSchema = z
  .object({
    message: z.string().optional(),
  })
  .passthrough();

const createJsonHeaders = (headers?: HeadersInit): Headers => {
  const nextHeaders = new Headers(headers);
  if (!nextHeaders.has("accept")) {
    nextHeaders.set("accept", "application/json");
  }

  return nextHeaders;
};

export const normalizeApiPath = (path: string): string => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (normalizedPath.startsWith(`${apiBasePath}/`)) {
    return normalizedPath;
  }

  return `${apiBasePath}${normalizedPath}`;
};

export class ApiError extends Error {
  readonly details: unknown;
  readonly status: number;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

interface RequestJsonOptions<TSchema extends z.ZodTypeAny> {
  init?: RequestInit;
  path: string;
  schema: TSchema;
}

export const requestJson = async <TSchema extends z.ZodTypeAny>({
  init,
  path,
  schema,
}: RequestJsonOptions<TSchema>): Promise<{
  data: z.infer<TSchema>;
  response: Response;
}> => {
  const response = await fetch(normalizeApiPath(path), {
    ...init,
    headers: createJsonHeaders(init?.headers),
  });
  const rawBody: unknown = await response.json().catch(() => null);
  const parsedBody = schema.safeParse(rawBody);

  if (!parsedBody.success) {
    throw new Error(
      `API ${normalizeApiPath(path)} returned an unexpected response payload.`
    );
  }

  return {
    data: parsedBody.data,
    response,
  };
};

export const getJson = async <TSchema extends z.ZodTypeAny>(
  options: RequestJsonOptions<TSchema>
): Promise<z.infer<TSchema>> => {
  const { data, response } = await requestJson(options);

  if (!response.ok) {
    const errorPayload = errorPayloadSchema.safeParse(data);
    const fallbackMessage = `API request to ${normalizeApiPath(options.path)} failed with status ${response.status}.`;
    const message = errorPayload.success
      ? (errorPayload.data.message ?? fallbackMessage)
      : fallbackMessage;

    throw new ApiError(message, response.status, data);
  }

  return data;
};
