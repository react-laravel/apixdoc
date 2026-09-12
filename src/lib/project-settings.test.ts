import { describe, expect, it } from "vitest";
import { parseProjectSettings } from "./project-settings";

describe("project settings writes", () => {
  it("preserves omitted collections on partial updates", () => {
    expect(parseProjectSettings({ name: " Updated " })).toEqual({
      name: "Updated",
    });
  });
  it("persists every settings tab in one nested write and strips client IDs", () => {
    const result = parseProjectSettings({
      environments: [
        {
          id: "client-id",
          name: " Staging ",
          baseUrl: "https://example.com/api",
          variables: '{"region":"cn"}',
          isDefault: true,
        },
      ],
      globalHeaders: [
        { id: "client-id", key: "X-Region", value: "cn", enabled: false },
      ],
      globalParams: [{ name: "page", value: "1", location: "query" }],
    });
    expect(result.environments).toEqual({
      deleteMany: {},
      create: [
        {
          name: "Staging",
          baseUrl: "https://example.com/api",
          variables: '{"region":"cn"}',
          isDefault: true,
        },
      ],
    });
    expect(result.globalHeaders).toEqual({
      deleteMany: {},
      create: [
        { key: "X-Region", value: "cn", description: "", enabled: false },
      ],
    });
    expect(result.globalParams).toEqual({
      deleteMany: {},
      create: [
        {
          name: "page",
          value: "1",
          description: "",
          enabled: true,
          location: "query",
        },
      ],
    });
  });
  it("allows deliberately clearing every collection", () => {
    const result = parseProjectSettings({
      environments: [],
      globalHeaders: [],
      globalParams: [],
    });
    for (const value of Object.values(result))
      expect(value).toEqual({ deleteMany: {}, create: [] });
  });
  it.each([
    { name: " " },
    { baseUrl: "not a url" },
    { isPublic: "false" },
    { environments: null },
    { environments: [{ name: "test", baseUrl: "", variables: "[]" }] },
    { globalHeaders: [{ key: "" }] },
    { globalParams: [{ name: "id", location: "body" }] },
  ])("rejects invalid settings before writing: %j", (value) => {
    expect(() => parseProjectSettings(value)).toThrow();
  });
});
