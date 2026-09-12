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

it("returns to invitation and organization pages without reflecting tokens or external destinations", () => {
  expect(loginDestination("/join")).toBe("/join");
  expect(loginDestination("/dashboard/organizations/org-1")).toBe(
    "/dashboard/organizations/org-1",
  );
  expect(loginDestination("/join#invite=secret")).toBe("/dashboard");
  expect(loginDestination("/dashboard/organizations/../../evil")).toBe(
    "/dashboard",
  );
});
