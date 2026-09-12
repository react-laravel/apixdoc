export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  requestId?: string;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public data?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export async function apiFetch<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const headers = new Headers(options?.headers);
  if (!headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  const response = await fetch(url, { ...options, headers });
  let body: ApiResponse<T>;
  try {
    body = await response.json();
  } catch {
    throw new ApiError(
      "服务器返回了无法读取的内容，请稍后重试",
      response.status,
    );
  }
  if (!response.ok || !body.success)
    throw new ApiError(
      (body.error || `请求失败（${response.status}）`) +
        (response.status >= 500 &&
        body.requestId &&
        /^[a-f0-9-]{36}$/.test(body.requestId)
          ? `（问题编号 ${body.requestId}）`
          : ""),
      response.status,
      body.code,
      body.data,
    );
  return body.data as T;
}
