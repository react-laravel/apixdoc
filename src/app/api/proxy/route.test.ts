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
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

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

it("honors the configured request deadline", async () => {
  vi.useFakeTimers();
  const fetchMock = vi.fn(
    (_url: unknown, options?: RequestInit) =>
      new Promise<Response>((_, reject) =>
        options?.signal?.addEventListener("abort", () =>
          reject(new DOMException("deadline", "AbortError")),
        ),
      ),
  );
  vi.stubGlobal("fetch", fetchMock);
  const pending = POST(
    new Request("http://localhost/api/proxy", {
      method: "POST",
      body: JSON.stringify({
        url: "https://example.com",
        method: "GET",
        timeoutMs: 1000,
        headers: {},
      }),
    }),
  );
  await vi.advanceTimersByTimeAsync(0);
  expect(fetchMock).toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1001);
  const response = await pending;
  expect(response.status).toBe(504);
  expect(await response.json()).toMatchObject({ error: "请求超时" });
});

it.each([0, 999, 60001, "15000"])(
  "rejects invalid timeout %s before contacting the target",
  async (timeoutMs) => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(
      new Request("http://localhost/api/proxy", {
        method: "POST",
        body: JSON.stringify({
          url: "https://example.com",
          method: "GET",
          timeoutMs,
        }),
      }),
    );
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  },
);
