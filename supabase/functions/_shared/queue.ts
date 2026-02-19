/* global Deno */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

function requireEnv(name: string, value: string): void {
  if (!value.trim()) {
    throw new Error(`${name} is required`);
  }
}

function headers(): HeadersInit {
  requireEnv("SUPABASE_URL", SUPABASE_URL);
  requireEnv("SUPABASE_SERVICE_ROLE_KEY", SERVICE_ROLE_KEY);
  return {
    "Content-Type": "application/json",
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  };
}

export async function enqueueBackgroundJob(
  jobType: string,
  payload: Record<string, unknown>,
  options?: {
    mondayItemId?: string | null;
    maxAttempts?: number;
    dedupe?: boolean;
  }
): Promise<number | null> {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/rpc/enqueue_background_job`,
    {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        p_job_type: jobType,
        p_payload: payload,
        p_monday_item_id: options?.mondayItemId ?? null,
        p_max_attempts: options?.maxAttempts ?? 3,
        p_dedupe: options?.dedupe ?? false,
      }),
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `enqueue_background_job failed (${response.status}): ${body}`
    );
  }

  const raw = (await response.json()) as number | null;
  return raw;
}

export async function selectOne<T>(
  table: string,
  params: URLSearchParams
): Promise<T | null> {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?${params.toString()}`,
    {
      method: "GET",
      headers: headers(),
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`selectOne ${table} failed (${response.status}): ${body}`);
  }

  const rows = (await response.json()) as T[];
  return rows[0] ?? null;
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
