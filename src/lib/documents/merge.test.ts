import { describe, expect, it } from "vitest";
import { mergeDocuments, chooseConflict, differences } from "./merge";
import { expandBodyMerge, finishBodyMerge } from "./body-merge";
import { documentBody } from "./http";
describe("document conflict merging", () => {
  it("combines independent fields while detecting edits to the same field", () => {
    const base = { name: "Before", description: "old" };
    expect(
      mergeDocuments(
        base,
        { ...base, name: "mine" },
        { ...base, description: "remote" },
      ),
    ).toEqual({
      value: { name: "mine", description: "remote" },
      conflicts: [],
    });
    const result = mergeDocuments(
      base,
      { ...base, name: "mine" },
      { ...base, name: "theirs" },
    );
    expect(result.conflicts).toEqual([
      { path: "/name", base: "Before", mine: "mine", current: "theirs" },
    ]);
    expect(chooseConflict(result.value, "/name", "mine")).toEqual({
      ...base,
      name: "mine",
    });
  });
  it("never merges array positions or resurrects removed rows", () => {
    const base = { parameters: [{ name: "a" }, { name: "b" }] };
    const result = mergeDocuments(
      base,
      { parameters: [{ name: "b" }] },
      { parameters: [{ name: "a", example: "changed" }, { name: "b" }] },
    );
    expect(result.conflicts.map((c) => c.path)).toEqual(["/parameters"]);
  });
  it("treats repeated identical saves as no conflict and avoids prototype mutation", () => {
    const value = JSON.parse('{"__proto__":{"safe":true}}');
    expect(mergeDocuments({}, value, value).conflicts).toHaveLength(0);
    const result = chooseConflict({}, "/__proto__/polluted", true) as Record<
      string,
      unknown
    >;
    expect(Object.hasOwn(result, "__proto__")).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(differences({ a: 1 }, { a: 1 })).toEqual([]);
  });
  it("merges selected MIME schema and example changes without losing other media or numeric precision", () => {
    const base = {
      requestBody: {
        contentType: "application/json",
        schema: '{"type":"object"}',
        example: '{"id":9007199254740993123}',
        content:
          '{"application/json":{"schema":{"type":"object"},"example":{"id":9007199254740993123}},"text/plain":{"example":"keep"}}',
      },
    };
    const mine = {
      requestBody: {
        ...base.requestBody,
        schema: '{"type":"object","title":"Mine"}',
      },
    };
    const current = {
      requestBody: {
        ...base.requestBody,
        example: '{"id":9007199254740993124}',
      },
    };
    const expanded = expandBodyMerge(base, mine, current);
    const merged = mergeDocuments(
      expanded.base,
      expanded.mine,
      expanded.current,
    );
    expect(merged.conflicts).toHaveLength(0);
    const result = finishBodyMerge(
      merged.value as Record<string, unknown>,
      expanded.expanded,
    ) as typeof base;
    expect(result.requestBody.schema).toContain('"Mine"');
    expect(result.requestBody.example).toContain("9007199254740993124");
    expect(result.requestBody.content).toContain('"keep"');
    expect(result.requestBody.content).toContain("9007199254740993124");
  });
  it("keeps raw JSON supplied as schema/example objects without rounding it", async () => {
    const request = new Request("http://localhost", {
      method: "POST",
      body: '{"version":1,"schema":{"default":9007199254740993123},"example":{"id":9007199254740993124},"responses":[{"statusCode":200,"example":{"n":9007199254740993125}}]}',
    });
    const value = await documentBody(request);
    expect(value.schema).toBe('{"default":9007199254740993123}');
    expect(value.example).toBe('{"id":9007199254740993124}');
    expect((value.responses as { example: string }[])[0].example).toContain(
      "9007199254740993125",
    );
  });
});
