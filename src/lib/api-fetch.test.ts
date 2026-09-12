import { describe, it, expect, vi, beforeEach } from "vitest";
import { apiFetch } from "@/lib/api-fetch";

describe("apiFetch", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns data on success", async () => {
    const mockData = { id: "1", name: "Test" };
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: mockData }),
        } as Response),
      ),
    );

    const result = await apiFetch<{ id: string; name: string }>("/api/test");
    expect(result).toEqual(mockData);
  });

  it("throws on HTTP error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 500,
          json: () =>
            Promise.resolve({ success: false, error: "Server error" }),
        } as Response),
      ),
    );

    await expect(apiFetch("/api/test")).rejects.toThrow("Server error");
  });

  it("throws when success is false", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: false, error: "Not found" }),
        } as Response),
      ),
    );

    await expect(apiFetch("/api/test")).rejects.toThrow("Not found");
  });

  it("throws on network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("Network"))),
    );

    await expect(apiFetch("/api/test")).rejects.toThrow("Network");
  });

  it("sends JSON body with correct headers", async () => {
    let capturedOptions: RequestInit | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, options?: RequestInit) => {
        capturedOptions = options;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: {} }),
        } as Response);
      }) as unknown as typeof fetch,
    );

    await apiFetch("/api/test", {
      method: "POST",
      body: JSON.stringify({ key: "value" }),
    });

    expect(capturedOptions?.method).toBe("POST");
    expect(new Headers(capturedOptions?.headers).get("Content-Type")).toBe(
      "application/json",
    );
    expect(capturedOptions?.body).toBe(JSON.stringify({ key: "value" }));
  });

  it("uses default Content-Type header", async () => {
    let capturedHeaders: HeadersInit | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, options?: RequestInit) => {
        capturedHeaders = options?.headers;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: {} }),
        } as Response);
      }) as unknown as typeof fetch,
    );

    await apiFetch("/api/test");
    expect(new Headers(capturedHeaders).get("Content-Type")).toBe(
      "application/json",
    );
  });
});

it("preserves structured conflicts for the editor and merges custom headers", async () => {
  const details = { version: 4, conflicts: [{ path: "/name" }] };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options: RequestInit) => {
      expect(new Headers(options.headers).get("Content-Type")).toBe(
        "application/json",
      );
      expect(new Headers(options.headers).get("X-Test")).toBe("value");
      return {
        ok: false,
        status: 409,
        json: async () => ({
          success: false,
          error: "Conflict",
          code: "DOCUMENT_CONFLICT",
          data: details,
        }),
      };
    }),
  );
  await expect(
    apiFetch("/api/test", { headers: { "X-Test": "value" } }),
  ).rejects.toMatchObject({
    status: 409,
    code: "DOCUMENT_CONFLICT",
    data: details,
  });
});
