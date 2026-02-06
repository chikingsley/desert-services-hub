/**
 * API helpers for permit operations
 */

interface ApiResponse {
  success: boolean;
  error?: string;
}

async function apiRequest(
  endpoint: string,
  method: "GET" | "POST" = "POST",
  body?: unknown
): Promise<ApiResponse> {
  try {
    const response = await fetch(endpoint, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    return await response.json();
  } catch (error) {
    console.error(`API request failed: ${endpoint}`, error);
    return { success: false, error: String(error) };
  }
}

export async function startPermit(_id: string): Promise<boolean> {
  // Permit-level start is not implemented yet; start browser session for manual flow.
  const result = await apiRequest("/api/browser/start");
  return result.success;
}

export async function cancelPermit(_id: string): Promise<boolean> {
  // Permit-level cancel is not implemented yet; stop browser session.
  const result = await apiRequest("/api/browser/stop");
  return result.success;
}

export async function renewPermit(
  id: string,
  companyName: string
): Promise<boolean> {
  const result = await apiRequest(`/api/permits/${id}/renew`, "POST", {
    companyName,
  });
  return result.success;
}

export async function closePermit(
  id: string,
  reason?: string
): Promise<boolean> {
  const result = await apiRequest(`/api/permits/${id}/close`, "POST", {
    reason,
  });
  return result.success;
}

export async function revisePermit(
  id: string,
  revisionType: string,
  notes: string
): Promise<boolean> {
  const result = await apiRequest(`/api/permits/${id}/revise`, "POST", {
    revisionType,
    notes,
  });
  return result.success;
}
