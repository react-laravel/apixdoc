import { afterEach, describe, expect, it, vi } from "vitest";
import { createReadinessCheck, type Readiness } from "./health";
import { logFailure } from "./failures";
import { bootstrapCredentials } from "./bootstrap";
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe("operational checks", () => {
  it("coalesces concurrent probes and bounds cached results", async () => {
    vi.useFakeTimers();
    let complete!: (value: Readiness) => void;
    const probe = vi.fn(
      () =>
        new Promise<Readiness>((resolve) => {
          complete = resolve;
        }),
    );
    const check = createReadinessCheck(probe);
    const first = check(),
      second = check();
    expect(probe).toHaveBeenCalledTimes(1);
    const ready: Readiness = {
      ready: true,
      checkedAt: new Date().toISOString(),
      database: "ok",
      migrations: "ok",
      pendingCount: 0,
      failedCount: 0,
    };
    complete(ready);
    await expect(Promise.all([first, second])).resolves.toEqual([ready, ready]);
    await check();
    expect(probe).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5001);
    const next = check();
    expect(probe).toHaveBeenCalledTimes(2);
    complete(ready);
    await next;
  });
  it("allows a later probe after a rejected call", async () => {
    const probe = vi
      .fn()
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValue({ ready: true });
    const check = createReadinessCheck(probe);
    await expect(check()).rejects.toThrow();
    await expect(check()).resolves.toMatchObject({ ready: true });
  });
  it("produces a correlation identifier without logging secret-bearing errors", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const id = logFailure(
      new Error("postgres://user:secret@host/db token=private"),
      "test",
    );
    const text = spy.mock.calls[0][0] as string;
    expect(JSON.parse(text).requestId).toBe(id);
    expect(text).not.toContain("secret");
    expect(text).not.toContain("private");
    expect(id).toMatch(/^[a-f0-9-]{36}$/);
  });
  it("requires explicitly configured bootstrap credentials", () => {
    expect(() => bootstrapCredentials(undefined, undefined)).toThrow(
      "ADMIN_EMAIL",
    );
    expect(() =>
      bootstrapCredentials("admin@example.test", "admin123"),
    ).toThrow("ADMIN_PASSWORD");
    expect(
      bootstrapCredentials(" ADMIN@example.test ", "a-long-unique-password")
        .email,
    ).toBe("admin@example.test");
    expect(() =>
      bootstrapCredentials("admin@example.test", "密".repeat(25)),
    ).toThrow();
  });
});
