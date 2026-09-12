import { describe, expect, it } from "vitest";
import {
  createRequestDraft,
  draftFromRequest,
  extractPathParameters,
  prepareRequest,
} from "./prepare";
import { requestRow } from "./types";
import { environmentVariables, variableResolver } from "./variables";
const defaults = {
  method: "POST",
  path: "/users/{id}",
  params: [],
  globalParams: [],
  globalHeaders: [],
  bodyExample: '{"name":"{{name}}","id":{{id}}}',
  bodyContentType: "application/json",
};

describe("request composition", () => {
  it("resolves environments, paths, JSON strings and large numbers without rounding", () => {
    const draft = createRequestDraft(defaults);
    draft.pathParams = [requestRow("id", "a/b ?")];
    draft.auth = { type: "bearer", token: "{{token}}" };
    const env = {
      name: "Staging",
      baseUrl: "https://staging.example.com/v1/",
      variables: JSON.stringify({
        name: 'A "quote"\nline',
        token: "abc",
      }).replace('"token":"abc"', '"token":"abc","id":9223372036854775807'),
    };
    const result = prepareRequest(draft, "https://prod.example.com", env);
    expect(result.url).toBe("https://staging.example.com/v1/users/a%2Fb%20%3F");
    expect(result.headers.authorization).toBe("Bearer abc");
    expect(result.body).toBe(
      '{"name":"A \\"quote\\"\\nline","id":9223372036854775807}'.replace(
        '\\"',
        '\\"',
      ),
    );
  });
  it("encodes variables in query strings and keeps repeated query values", () => {
    const draft = createRequestDraft({
      ...defaults,
      method: "GET",
      path: "/search?q={{term}}",
    });
    draft.variables = [requestRow("term", "a&admin=true")];
    draft.query = [
      requestRow("tag", "a"),
      requestRow("tag", "b"),
      requestRow("ignored", "x", false),
    ];
    expect(prepareRequest(draft, "https://example.com").url).toBe(
      "https://example.com/search?q=a%26admin%3Dtrue&tag=a&tag=b",
    );
  });
  it("inherits headers and parameters with endpoint values taking precedence", () => {
    const draft = createRequestDraft({
      ...defaults,
      path: "/x",
      globalHeaders: [
        { key: "X-Mode", value: "global", description: "", enabled: true },
      ],
      globalParams: [
        {
          name: "page",
          value: "1",
          location: "query",
          description: "",
          enabled: true,
        },
        {
          name: "X-Locale",
          value: "en",
          location: "header",
          description: "",
          enabled: true,
        },
      ],
      params: [
        {
          name: "x-mode",
          example: "local",
          location: "header",
          type: "string",
          description: "",
          required: false,
        },
        {
          name: "page",
          example: "2",
          location: "query",
          type: "integer",
          description: "",
          required: false,
        },
      ],
      bodyExample: "",
    });
    const result = prepareRequest(draft, "https://example.com");
    expect(result.headers).toMatchObject({
      "x-mode": "local",
      "x-locale": "en",
    });
    expect(result.url).toBe("https://example.com/x?page=2");
  });
  it("supports colon and OpenAPI paths without interpreting the port as a parameter", () => {
    expect(
      extractPathParameters("https://example.com:8443/users/:id/{item}?q=x"),
    ).toEqual(["id", "item"]);
    expect(extractPathParameters("{{base}}/users/{id}")).toEqual(["id"]);
  });
  it("rejects missing path values, invalid headers, and missing variables before sending", () => {
    const draft = createRequestDraft({ ...defaults, bodyExample: "" });
    expect(() => prepareRequest(draft, "https://example.com")).toThrow(
      "路径参数",
    );
    draft.address = "/users";
    draft.headers = [requestRow("X-Test", "line\nbreak")];
    expect(() => prepareRequest(draft, "https://example.com")).toThrow(
      "请求头",
    );
    draft.headers = [requestRow("Host", "example.com")];
    expect(() => prepareRequest(draft, "https://example.com")).toThrow(
      "自动管理",
    );
    draft.headers = [];
    draft.query = [requestRow("q", "{{missing}}")];
    expect(() => prepareRequest(draft, "https://example.com")).toThrow(
      "missing",
    );
  });
  it("supports Basic and API Key auth with explicit auth winning over manual headers", () => {
    const draft = createRequestDraft({
      ...defaults,
      path: "/x",
      bodyExample: "",
    });
    draft.headers = [requestRow("Authorization", "old")];
    draft.auth = { type: "basic", username: "user", password: "p:ass" };
    expect(
      prepareRequest(draft, "https://example.com").headers.authorization,
    ).toBe("Basic dXNlcjpwOmFzcw==");
    draft.auth = {
      type: "apiKey",
      key: "api_key",
      value: "abc&def",
      location: "query",
    };
    draft.query = [requestRow("api_key", "old")];
    expect(prepareRequest(draft, "https://example.com").url).toBe(
      "https://example.com/x?api_key=abc%26def",
    );
  });
  it("encodes form fields and never sends GET or HEAD bodies", () => {
    const draft = createRequestDraft({
      ...defaults,
      path: "/x",
      bodyExample: "",
    });
    draft.bodyMode = "urlencoded";
    draft.bodyFields = [requestRow("name", "A & B"), requestRow("tag", "中")];
    const result = prepareRequest(draft, "https://example.com");
    expect(result.body).toBe("name=A+%26+B&tag=%E4%B8%AD");
    expect(result.headers["content-type"]).toBe(
      "application/x-www-form-urlencoded",
    );
    draft.method = "GET";
    expect(prepareRequest(draft, "https://example.com").body).toBeUndefined();
  });
  it("restores an exact prepared request independently of the current environment", () => {
    const request = {
      url: "https://old.example.com/a?x=1&x=2",
      method: "POST" as const,
      headers: { "content-type": "text/plain", authorization: "Bearer x" },
      body: "",
      timeoutMs: 30000,
    };
    expect(
      prepareRequest(draftFromRequest(request), "https://new.example.com"),
    ).toEqual(request);
  });
});

describe("environment variables", () => {
  it("preserves large numeric variables and supports nested references and overrides", () => {
    expect(environmentVariables('{"id":9223372036854775807}').get("id")).toBe(
      "9223372036854775807",
    );
    const resolver = variableResolver(
      '{"base":"{{host}}/v1","host":"https://example.com","flag":false}',
      [requestRow("host", "https://staging.example.com")],
    );
    expect(resolver.resolve("{{base}}?flag={{flag}}")).toBe(
      "https://staging.example.com/v1?flag=false",
    );
  });
  it("rejects cycles, missing names and non-object environments", () => {
    expect(() =>
      variableResolver('{"a":"{{b}}","b":"{{a}}"}').resolve("{{a}}"),
    ).toThrow("循环");
    expect(() => environmentVariables("[]")).toThrow("JSON 对象");
    expect(() => variableResolver("{}").resolve("{{__proto__}}")).toThrow(
      "未定义",
    );
  });
});
