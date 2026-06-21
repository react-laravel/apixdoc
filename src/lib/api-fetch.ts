export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Shared API fetch wrapper.
 *
 * - Always sends/receives JSON
 * - Throws on network errors
 * - Throws with the server's error message on `success: false`
 * - Returns `response.data` on success
 */
export async function apiFetch<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
    ...options,
  });

  const json = (await res.json()) as ApiResponse<T>;

  if (!res.ok) {
    throw new Error(json.error ?? `HTTP ${res.status}`);
  }

  if (!json.success) {
    throw new Error(json.error ?? "请求失败");
  }

  return json.data as T;
}
