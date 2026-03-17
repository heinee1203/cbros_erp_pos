import { ApiError } from "./query-provider";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

interface FetchOptions extends RequestInit {
  token?: string;
  locationId?: string;
}

/**
 * Enterprise-grade API fetch wrapper.
 *
 * Error handling hierarchy:
 *  - 409 Conflict → Already Processed (idempotency duplicate)
 *  - 423 Locked   → Temporary Contention (row locked, retry with same key)
 *  - 4xx          → Business logic error (validation, insufficient stock, etc.)
 *  - 5xx/timeout  → Unknown state, needs reconciliation
 *
 * Throws `ApiError` with status code preserved for mutation hooks to handle.
 */
export async function apiFetch<T>(
  path: string,
  options: FetchOptions = {},
): Promise<T> {
  const { token, locationId, headers: customHeaders, ...rest } = options;

  const headers: Record<string, string> = {
    ...((customHeaders as Record<string, string>) || {}),
  };

  // Only set Content-Type when there is a body to send
  if (rest.body) {
    headers["Content-Type"] = "application/json";
  }

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (locationId && locationId !== "ALL") {
    headers["X-Location-ID"] = locationId;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers,
      ...rest,
    });
  } catch {
    // Network error or timeout → unknown state
    throw new ApiError(
      "Network error — please check your connection",
      0,
    );
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(
      body.error || `API error: ${res.status}`,
      res.status,
      body,
    );
  }

  // 204 No Content — return undefined (typed as T for convenience)
  if (res.status === 204) {
    return undefined as unknown as T;
  }

  // Safety: handle empty response bodies gracefully
  const text = await res.text();
  if (!text) {
    return undefined as unknown as T;
  }
  return JSON.parse(text);
}
