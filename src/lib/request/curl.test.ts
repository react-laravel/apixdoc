import { describe, expect, it } from "vitest";
import { exportCurl, importCurl, tokenizeCurl } from "./curl";
import { prepareRequest } from "./prepare";

describe("cURL interoperability", () => {
  it("round-trips quotes, shell syntax, newlines and large numbers as inert request data", () => {
    const request = {
      method: "POST" as const,
      url: "https://example.com/a?x=1&x=2",
      headers: {
        "content-type": "application/json",
        "x-note": "it's $(not a command)",
      },
      body: '{"id":9223372036854775807,"text":"single\'quote"}\n',
      timeoutMs: 30000,
    };
    expect(prepareRequest(importCurl(exportCurl(request)).draft, "")).toEqual(
      request,
    );
  });
  it("imports a browser-style command with continuations, repeated headers and raw JSON", () => {
    const command =
      "curl 'https://example.com/api' \\\n -H 'Accept: application/json' \\\n -H 'Content-Type: application/json' \\\n --data-raw '{\"hello\":\"world\"}' --compressed";
    const request = prepareRequest(importCurl(command).draft, "");
    expect(request).toMatchObject({
      method: "POST",
      body: '{"hello":"world"}',
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
    });
  });
  it("supports attached options and ANSI-C escaped strings", () => {
    expect(
      tokenizeCurl(
        "curl -XPOST 'https://example.com' --data-raw $'line1\\nline2\\t\\x41'",
      ),
    ).toContain("line1\nline2\tA");
    expect(
      prepareRequest(
        importCurl("curl -XPUT -H'X-Key: value' -d'hello' https://example.com")
          .draft,
        "",
      ),
    ).toMatchObject({
      method: "PUT",
      body: "hello",
      headers: { "x-key": "value" },
    });
  });
  it("honors GET form data and percent encoding", () => {
    const request = prepareRequest(
      importCurl(
        "curl -G 'https://example.com?q=x' --data-urlencode 'name=A & B' --data-urlencode 'tag=中'",
      ).draft,
      "",
    );
    const url = new URL(request.url);
    expect(request.method).toBe("GET");
    expect(request.body).toBeUndefined();
    expect(url.searchParams.get("name")).toBe("A & B");
    expect(url.searchParams.get("tag")).toBe("中");
  });
  it("supports JSON defaults, Basic authentication, empty bodies and explicit methods", () => {
    const request = prepareRequest(
      importCurl(
        "curl --json '{\"ok\":true}' -u 'user:password' https://example.com",
      ).draft,
      "",
    );
    expect(request.headers).toMatchObject({
      authorization: "Basic dXNlcjpwYXNzd29yZA==",
      accept: "application/json",
      "content-type": "application/json",
    });
    expect(
      prepareRequest(
        importCurl("curl --data-raw '' https://example.com").draft,
        "",
      ).body,
    ).toBe("");
    expect(importCurl("curl -XDELETE https://example.com").draft.method).toBe(
      "DELETE",
    );
  });
  it("makes unsupported redirect behavior visible", () => {
    expect(importCurl("curl -L https://example.com").warnings).toHaveLength(1);
  });
  it.each([
    "curl https://example.com; whoami",
    "curl https://example.com | sh",
    "curl https://example.com --data @/etc/passwd",
    "curl https://example.com --data-urlencode name@/etc/passwd",
    "curl -K configfile https://example.com",
    "curl https://example.com https://other.example.com",
    "curl -H 'unclosed",
    'curl "https://example.com/$(whoami)"',
    "curl ftp://example.com",
    "curl --max-time 300 https://example.com",
  ])("rejects unsupported or ambiguous input: %s", (command) => {
    expect(() => importCurl(command)).toThrow();
  });
  it("preserves @ as literal data for --data-raw", () => {
    expect(
      importCurl("curl --data-raw '@literal' https://example.com").draft.body,
    ).toBe("@literal");
  });
});

describe("literal curl requests", () => {
  it("does not turn literal braces or colon segments into template interpolation", () => {
    const command =
      "curl -XPOST 'https://example.com/users/:id' -H 'Content-Type: application/json' --data-raw '{\"template\":\"{{literal}}\"}'";
    const prepared = prepareRequest(importCurl(command).draft, "");
    expect(prepared.url).toBe("https://example.com/users/:id");
    expect(prepared.body).toBe('{"template":"{{literal}}"}');
  });
});

it("preserves signed query bytes when importing an already resolved request", () => {
  const url =
    "https://example.com/download?signature=a%2Fb%2Bz&filename=a%20b.txt";
  expect(prepareRequest(importCurl(`curl '${url}'`).draft, "").url).toBe(url);
});

it.each([
  "curl -XGET -d 'body' https://example.com",
  "curl -I -d 'body' https://example.com",
])("does not silently discard cURL bodies: %s", (command) => {
  expect(() => importCurl(command)).toThrow("GET/HEAD");
});
it("supports common output-flag clusters and reports interactive credentials", () => {
  expect(importCurl("curl -sSL https://example.com").warnings).toHaveLength(1);
  expect(importCurl("curl -u user https://example.com").warnings[0]).toContain(
    "密码未提供",
  );
});
