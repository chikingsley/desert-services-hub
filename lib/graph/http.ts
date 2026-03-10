import { getGraphToken } from "./auth";

const GRAPH_API_BASE = "https://graph.microsoft.com/v1.0";

function resolveGraphUrl(path: string): string {
  return path.startsWith("https://") ? path : `${GRAPH_API_BASE}/${path}`;
}

export async function graphGet<T>(path: string): Promise<T> {
  const token = await getGraphToken();
  const res = await fetch(resolveGraphUrl(path), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph API ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

export async function graphGetBinary(path: string): Promise<Buffer> {
  const token = await getGraphToken();
  const res = await fetch(resolveGraphUrl(path), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph API ${res.status}: ${text}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

export async function graphPost<T>(
  path: string,
  body: Record<string, unknown>
): Promise<T> {
  const token = await getGraphToken();
  const res = await fetch(resolveGraphUrl(path), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph API POST ${res.status}: ${text}`);
  }
  if (res.status === 202 || res.headers.get("content-length") === "0") {
    return {} as T;
  }
  return (await res.json()) as T;
}
