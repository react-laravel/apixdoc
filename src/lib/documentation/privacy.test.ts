import { describe, expect, it } from "vitest";
import {
  documentationUrl,
  documentationPath,
  sanitizeExample,
  sanitizeDocumentationProject,
} from "./privacy";
describe("documentation projection", () => {
  it("removes URL credentials and sensitive queries while keeping useful route information", () => {
    expect(
      documentationUrl(
        "https://user:password@example.com/api?version=2&token=secret",
      ),
    ).toBe("https://example.com/api?version=2");
    expect(documentationPath("/users/{id}?api_key=secret&page=1")).toBe(
      "/users/{id}?page=1",
    );
  });
  it("redacts structured credentials without rounding nonsecret values", () => {
    const safe = sanitizeExample(
      '{"id":9223372036854775807,"token":"sensitive","nested":{"password":"hidden"},"token_count":12}',
    );
    expect(safe).toContain("9223372036854775807");
    expect(safe).toContain('"token_count":12');
    expect(safe).not.toContain("sensitive");
    expect(safe).not.toContain("hidden");
  });
  it("does not expose secrets in valid templates or malformed JSON examples", () => {
    for (const source of [
      '{"password":"secret","id":{{id}}}',
      '{"password":"secret", broken}',
      '{"token":{{token}},"name":"user"}',
      "password: secret",
    ])
      expect(sanitizeExample(source)).not.toContain("secret");
    expect(sanitizeExample('{"token":{{token}},"id":{{id}}}')).toContain(
      '"id":{{id}}',
    );
  });
  it("keeps schema structure and hides sensitive field defaults", () => {
    const safe = sanitizeExample(
      '{"type":"object","properties":{"password":{"type":"string","default":"real-password"},"name":{"type":"string","example":"Alice"}}}',
      true,
    );
    expect(safe).toContain('"password":{"type":"string"');
    expect(safe).not.toContain("real-password");
    expect(safe).toContain("Alice");
  });
  it("uses an explicit document shape and strips runtime settings", () => {
    const project = {
      id: "p",
      name: "API",
      description: "docs",
      baseUrl: "https://example.com",
      isPublic: true,
      folders: [],
      endpoints: [],
      environments: [{ variables: "secret" }],
      globalHeaders: [{ value: "secret" }],
      createdById: "private-id",
    };
    const safe = sanitizeDocumentationProject(project);
    expect(safe).not.toHaveProperty("createdById");
    expect(safe.environments).toEqual([]);
    expect(safe.globalHeaders).toEqual([]);
  });
});
