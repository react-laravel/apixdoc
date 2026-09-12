import { describe, expect, it } from "vitest";
import {
  createHistoryEntry,
  displayRequestUrl,
  historyStorageKey,
  parseHistory,
  serializeHistory,
} from "./history";
const request = {
  url: "https://example.com",
  method: "POST" as const,
  headers: { authorization: "Bearer test" },
  body: '{"id":9223372036854775807}',
  timeoutMs: 15000,
};

describe("request history", () => {
  it("stores immutable request and response snapshots", () => {
    const input = { ...request, headers: { ...request.headers } };
    const response = {
      status: 200,
      headers: { "content-type": "application/json" },
      body: request.body,
      duration: 1,
    };
    const entry = createHistoryEntry(input, "Staging", { response });
    input.headers.authorization = "changed";
    response.headers["content-type"] = "changed";
    expect(entry.request.headers.authorization).toBe("Bearer test");
    expect(entry.response?.headers["content-type"]).toBe("application/json");
    expect(parseHistory(serializeHistory([entry]))[0]).toEqual(entry);
  });
  it("bounds count, total storage and response previews without changing the original response", () => {
    const response = {
      status: 200,
      headers: {},
      body: "中".repeat(50000),
      duration: 1,
    };
    const entry = createHistoryEntry(request, "Default", { response });
    expect(entry.responseTruncated).toBe(true);
    expect(
      new TextEncoder().encode(entry.response!.body).length,
    ).toBeLessThanOrEqual(65536);
    expect(entry.response!.body).not.toContain("\ufffd");
    expect(response.body).toHaveLength(50000);
    const entries = Array.from({ length: 30 }, () =>
      createHistoryEntry(request, "Default", { response }),
    );
    const serialized = serializeHistory(entries);
    expect(new TextEncoder().encode(serialized).length).toBeLessThanOrEqual(
      1024 * 1024,
    );
    expect(parseHistory(serialized).length).toBeLessThanOrEqual(20);
  });
  it("rejects corrupted or incompatible storage", () => {
    expect(parseHistory("not json")).toEqual([]);
    expect(
      parseHistory(
        JSON.stringify([
          {
            id: "1",
            at: new Date().toISOString(),
            environment: "x",
            request: { url: "javascript:alert(1)" },
          },
        ]),
      ),
    ).toEqual([]);
    expect(parseHistory("{}")).toEqual([]);
  });
  it("isolates accounts, projects and endpoints and masks URL credentials in lists", () => {
    expect(historyStorageKey("a", "p", "e")).not.toBe(
      historyStorageKey("b", "p", "e"),
    );
    expect(historyStorageKey("a", "p", "e")).not.toBe(
      historyStorageKey("a", "p2", "e"),
    );
    expect(historyStorageKey("a", "p", "e")).not.toBe(
      historyStorageKey("a", "p", "e2"),
    );
    const displayed = displayRequestUrl(
      "https://example.com?q=normal&api_key=topsecret&token=secret",
    );
    expect(displayed).not.toContain("topsecret");
    expect(displayed).not.toContain("token=secret");
    expect(displayed).toContain("q=normal");
  });
});
