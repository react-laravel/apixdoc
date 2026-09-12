import { describe, expect, it } from "vitest";
import { retentionOptions } from "./retention";
import { auditMetadata } from "./write";
import { auditCsv } from "./read";
import type { AuditRow } from "./model";
describe("audit data boundaries", () => {
  it("retains only approved change metadata", () => {
    const value = JSON.parse(
      auditMetadata({
        fields: ["name", "baseUrl", "password", "requestBody"],
        version: 3,
        affectedCount: 2,
        role: "admin",
        token: "private-token",
        headers: { authorization: "private-header" },
        schema: { password: "secret" },
        snapshot: "private-document",
      }),
    );
    expect(value).toEqual({
      fields: ["name", "baseUrl", "requestBody"],
      version: 3,
      affectedCount: 2,
      role: "admin",
    });
    expect(JSON.stringify(value)).not.toContain("private");
  });
  it("ignores invalid roles, counts, and arbitrary metadata keys", () => {
    expect(
      auditMetadata({
        version: -1,
        affectedCount: Infinity,
        role: "root",
        format: "shell",
        fields: [{}, "secret"],
      }),
    ).toBe('{"fields":[]}');
  });
  it("escapes CSV quotes and formula-like labels", () => {
    const row: AuditRow = {
      id: "r",
      organizationId: "o",
      organizationName: '=HYPERLINK("https://example.test")',
      projectId: null,
      projectName: "",
      actorId: "u",
      actorName: "+command",
      action: "project.created",
      targetId: "p",
      targetName: "line,\nvalue",
      metadata: '{"version":1}',
      createdAt: "2026-09-12T00:00:00.000Z",
    };
    const csv = auditCsv([row]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'+command");
    expect(csv).toContain('"line,\nvalue"');
    expect(csv).toContain('""https://example.test""');
  });
});

it("keeps audit cleanup in preview mode unless explicitly applied", () => {
  const preview = retentionOptions([], new Date("2026-09-12T00:00:00Z"));
  expect(preview.apply).toBe(false);
  expect(preview.days).toBe(180);
  expect(
    retentionOptions(["--days=30", "--apply", "--organization=org-1"])
      .organizationId,
  ).toBe("org-1");
  expect(() => retentionOptions(["--days=0"])).toThrow();
  expect(() => retentionOptions(["--unknown"])).toThrow();
});
