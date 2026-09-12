import { describe, it, expect } from "vitest";
import {
  accountName,
  accountEmail,
  accountPassword,
  accountVersion,
} from "./validation";
describe("account input boundaries", () => {
  it("normalizes identity but preserves password whitespace", () => {
    expect(accountName("  Name  ")).toBe("Name");
    expect(accountEmail(" User@Example.com ")).toBe("user@example.com");
    expect(accountPassword(" password ")).toBe(" password ");
  });
  it("rejects invalid names, emails and short or silently truncated passwords", () => {
    for (const name of [null, " ", "x".repeat(81)])
      expect(() => accountName(name)).toThrow();
    for (const email of [
      null,
      "user",
      "user@",
      "x".repeat(255) + "@example.com",
    ])
      expect(() => accountEmail(email)).toThrow();
    for (const password of [
      null,
      12345678,
      "short",
      "中".repeat(25),
      "x".repeat(73),
    ])
      expect(() => accountPassword(password)).toThrow();
    expect(accountPassword("中".repeat(24))).toHaveLength(24);
  });
  it("rejects stale or missing mutation versions", () => {
    for (const version of [undefined, "2", 1, 2.1])
      expect(() => accountVersion(2, version)).toThrow("已变化");
    expect(() => accountVersion(2, 2)).not.toThrow();
  });
});
