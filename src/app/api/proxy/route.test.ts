import { describe, expect, it, vi, afterEach } from "vitest";
import { POST } from "./route";
vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "test-user" } }),
}));
vi.mock("@/lib/security", () => ({
  isHttpRequestMethod: (method: string) =>
    ["GET", "POST", "DELETE"].includes(method),
  PROXY_TIMEOUT_MS: 15000,
  readLimitedResponseBody: async (response: Response) => response.text(),
  sanitizeProxyHeaders: (headers: unknown) => headers,
  validateExternalUrl: async (url: string) => new URL(url),
}));
afterEach(() => vi.unstubAllGlobals());

describe("request proxy lifecycle", () => {
  it("propagates client cancellation to the upstream request", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(
      (_url: unknown, options?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          options?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = POST(
      new Request("http://localhost/api/proxy", {
        method: "POST",
        signal: controller.signal,
        body: JSON.stringify({
          url: "https://example.com",
          method: "GET",
          headers: {},
        }),
      }),
    );
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    controller.abort();
    const response = await result;
    expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
    expect(response.status).toBe(499);
    expect(await response.json()).toMatchObject({
      success: false,
      error: "请求已取消",
    });
  });
  it("preserves the exact response body and allows a DELETE body", async () => {
    const raw = '{"id":9223372036854775807}';
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(raw, { headers: { "content-type": "application/json" } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(
      new Request("http://localhost/api/proxy", {
        method: "POST",
        body: JSON.stringify({
          url: "https://example.com",
          method: "DELETE",
          headers: {},
          body: '{"reason":"test"}',
        }),
      }),
    );
    expect(fetchMock.mock.calls[0][1].body).toBe('{"reason":"test"}');
    expect(await response.json()).toMatchObject({
      success: true,
      data: { body: raw },
    });
  });
});
