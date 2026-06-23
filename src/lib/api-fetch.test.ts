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
          json: () =>
            Promise.resolve({ success: false, error: "Not found" }),
        } as Response),
      ),
    );

    await expect(apiFetch("/api/test")).rejects.toThrow("Not found");
  });

  it("throws on network error", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("Network"))));

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
    expect(capturedOptions?.headers).toEqual({
      "Content-Type": "application/json",
    });
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
    expect(capturedHeaders).toEqual({ "Content-Type": "application/json" });
  });
});
