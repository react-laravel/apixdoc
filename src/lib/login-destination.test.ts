import { expect, it } from "vitest";
import { loginDestination } from "./login-destination";
it("returns to document links without accepting external redirects", () => {
  expect(loginDestination("/docs/project?endpoint=example")).toBe(
    "/docs/project?endpoint=example",
  );
  for (const value of [
    null,
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "/dashboard?next=evil",
  ])
    expect(loginDestination(value)).toBe("/dashboard");
});
