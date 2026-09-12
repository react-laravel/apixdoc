import { describe, expect, it } from "vitest";
import {
  formatJson,
  minifyJson,
  inspectJson,
  jsonPath,
  jsonPointer,
  isJsonContentType,
  MAX_STRUCTURED_JSON_SIZE,
} from "./json-document";

describe("lossless JSON tools", () => {
  const source =
    '{"id":9223372036854775807,"decimal":0.12345678901234567890,"exponent":1e+300,"negativeZero":-0,"escaped":"\\u4f60\\n\\\"","duplicate":1,"duplicate":2}';
  it("formats and compresses without changing numerical tokens, escapes, or duplicate keys", () => {
    const formatted = formatJson(source);
    expect(formatted).toContain('\n  "id": 9223372036854775807');
    expect(minifyJson(formatted)).toBe(source);
    expect(formatJson(source, 4)).toContain('\n    "id"');
  });
  it.each(["null", "false", "0", "-0", '"hello"', "[]", "{}"])(
    "accepts a JSON root primitive or container: %s",
    (source) => {
      expect(inspectJson(source).issue).toBeUndefined();
      expect(minifyJson(formatJson(source))).toBe(source);
    },
  );
  it("does not strip spaces inside string literals", () => {
    expect(minifyJson(' { "a" : " a  b " } ')).toBe('{"a":" a  b "}');
  });
  it.each([
    '{"x":}',
    '{"a":1,}',
    "[1,]",
    '{/*comment*/"a":1}',
    '{"a":NaN}',
    "true false",
    '{"a":"unterminated}',
    '{"a":"line\nbreak"}',
  ])("rejects invalid JSON without changing content: %s", (source) => {
    expect(inspectJson(source).issue).toBeDefined();
    expect(() => formatJson(source)).toThrow();
    expect(() => minifyJson(source)).toThrow();
  });
  it("reports the correct row and column for missing values", () => {
    expect(inspectJson('{\n  "name":\n}').issue).toMatchObject({
      line: 3,
      column: 1,
    });
  });
  it("handles empty content separately from an invalid document", () => {
    expect(inspectJson("  ")).toMatchObject({ empty: true });
    expect(formatJson("  ")).toBe("  ");
  });
  it("limits pathological nesting before recursive parsing", () => {
    expect(
      inspectJson("[".repeat(10000) + "]".repeat(10000)).issue?.message,
    ).toContain("200");
  });
  it("keeps oversized data available without parsing its structure", () => {
    expect(
      inspectJson('"' + "x".repeat(MAX_STRUCTURED_JSON_SIZE) + '"').issue
        ?.message,
    ).toContain("2 MB");
  });
  it("counts UTF-8 bytes", () => {
    expect(inspectJson('"你好"').size).toBe(8);
  });
  it("produces escaped JSON Pointers and readable paths", () => {
    expect(jsonPointer(["a/b", "~field", 0, ""])).toBe("/a~1b/~0field/0/");
    expect(jsonPath(["users", 0, "a.b"])).toBe('$.users[0]["a.b"]');
    expect(jsonPointer([])).toBe("");
  });
  it("recognizes vendor JSON media types", () => {
    expect(isJsonContentType("application/problem+json; charset=utf-8")).toBe(
      true,
    );
    expect(isJsonContentType("application/json")).toBe(true);
    expect(isJsonContentType("application/jsonp")).toBe(false);
    expect(isJsonContentType("text/html")).toBe(false);
  });
});
