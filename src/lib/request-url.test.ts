import { describe, expect, it } from "vitest";
import { buildRequestUrl } from "./request-url";

describe("request URL", () => {
  it("joins base paths without duplicate slashes", () => {
    expect(buildRequestUrl("https://example.com/v1/", "/users")).toBe(
      "https://example.com/v1/users",
    );
    expect(buildRequestUrl("https://example.com/v1", "users")).toBe(
      "https://example.com/v1/users",
    );
  });
  it("preserves existing queries and repeated values without double question marks", () => {
    expect(
      buildRequestUrl("https://example.com/v1?key=1", "/users?tag=a#local", [
        { key: "tag", value: "b c" },
        { key: "", value: "ignored" },
      ]),
    ).toBe("https://example.com/v1/users?key=1&tag=a&tag=b+c");
  });
  it("preserves percent-encoded route segments", () => {
    expect(buildRequestUrl("https://example.com", "/users/a%2Fb")).toBe(
      "https://example.com/users/a%2Fb",
    );
  });
  it("rejects missing or unsupported base URLs", () => {
    expect(() => buildRequestUrl("", "/users")).toThrow("基础 URL");
    expect(() => buildRequestUrl("ftp://example.com", "/users")).toThrow(
      "http",
    );
  });
});
