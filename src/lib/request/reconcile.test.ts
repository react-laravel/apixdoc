import { describe, expect, it } from "vitest";
import { createRequestDraft, draftFromRequest } from "./prepare";
import { requestRow } from "./types";
import { reconcileDocumentDraft } from "./reconcile";
const input = {
  method: "POST",
  path: "/users",
  params: [],
  globalHeaders: [
    { key: "X-Mode", value: "old", description: "", enabled: true },
  ],
  globalParams: [
    {
      name: "page",
      value: "1",
      location: "query",
      description: "",
      enabled: true,
    },
  ],
  bodyExample: '{"old":true}',
};

describe("document defaults", () => {
  it("refreshes unchanged headers, parameters and bodies when the document changes", () => {
    const previous = createRequestDraft(input);
    const next = createRequestDraft({
      ...input,
      globalHeaders: [{ ...input.globalHeaders[0], value: "new" }],
      globalParams: [{ ...input.globalParams[0], value: "2" }],
      bodyExample: '{"new":true}',
    });
    const result = reconcileDocumentDraft(previous, previous, next);
    expect(result.headers[0].value).toBe("new");
    expect(result.query[0].value).toBe("2");
    expect(result.body).toBe('{"new":true}');
    expect(result.headers[0].id).toBe(previous.headers[0].id);
  });
  it("keeps edits, opt-outs and independent body configuration", () => {
    const previous = createRequestDraft(input);
    const edited = {
      ...previous,
      headers: [],
      query: [{ ...previous.query[0], value: "custom" }],
      body: "custom body",
    };
    const next = createRequestDraft({
      ...input,
      globalHeaders: [{ ...input.globalHeaders[0], value: "new" }],
      bodyExample: "new doc",
      bodyContentType: "text/plain",
    });
    const result = reconcileDocumentDraft(edited, previous, next);
    expect(result.headers).toEqual([]);
    expect(result.query[0].value).toBe("custom");
    expect(result.body).toBe("custom body");
    expect(result.contentType).toBe("application/json");
  });
  it("adds new defaults while preserving custom rows and removing obsolete inherited rows", () => {
    const previous = createRequestDraft(input);
    const edited = {
      ...previous,
      headers: [...previous.headers, requestRow("X-Custom", "keep")],
    };
    const next = createRequestDraft({
      ...input,
      globalHeaders: [
        { key: "X-New", value: "new", description: "", enabled: true },
      ],
    });
    expect(
      reconcileDocumentDraft(edited, previous, next).headers.map(
        (row) => row.key,
      ),
    ).toEqual(["X-Custom", "X-New"]);
  });
  it("never rebases requests imported from history or cURL", () => {
    const previous = createRequestDraft(input);
    const imported = draftFromRequest({
      url: "https://different.example.com",
      method: "POST",
      headers: {},
      body: "literal",
      timeoutMs: 15000,
    });
    expect(
      reconcileDocumentDraft(
        imported,
        previous,
        createRequestDraft({ ...input, bodyExample: "new" }),
      ),
    ).toBe(imported);
  });
});
