import { afterEach, expect, it, vi } from "vitest";
import { localRequestId, requestRow } from "./types";
import { createHistoryEntry } from "./history";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("can create request rows and history on origins without randomUUID", () => {
  vi.stubGlobal("crypto", {});
  vi.spyOn(Date, "now").mockReturnValue(1);
  vi.spyOn(Math, "random").mockReturnValue(0);
  const row = requestRow("id", "1");
  const entry = createHistoryEntry(
    {
      url: "https://example.com",
      method: "GET",
      headers: {},
      timeoutMs: 15000,
    },
    "Default",
    {},
  );
  expect(row.id).toMatch(/^request-/);
  expect(entry.id).toMatch(/^request-/);
  expect(new Set([row.id, entry.id, localRequestId()]).size).toBe(3);
});
