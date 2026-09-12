import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ ready: false }));
vi.mock("@/lib/operations/health", () => ({
  checkReadiness: async () => ({
    ready: state.ready,
    database: "private-host",
    requestId: "private-diagnostic",
  }),
}));
import { GET } from "./route";
beforeEach(() => {
  state.ready = false;
});
it("returns an unavailable status without operational details", async () => {
  const result = await GET();
  expect(result.status).toBe(503);
  expect(result.headers.get("Retry-After")).toBe("5");
  expect(await result.json()).toEqual({ status: "unavailable" });
});
it("reports readiness and prevents response caching", async () => {
  state.ready = true;
  const result = await GET();
  expect(result.status).toBe(200);
  expect(await result.json()).toEqual({ status: "ready" });
  expect(result.headers.get("Cache-Control")).toBe("no-store");
});
