import { isJsonContentType } from "@/lib/json-document";
import { buildRequestUrl } from "@/lib/request-url";
import type {
  EndpointParam,
  Environment,
  GlobalHeader,
  GlobalParam,
  EndpointHeader,
} from "@/lib/types";
import {
  REQUEST_METHODS,
  requestRow,
  type RequestDraft,
  type RequestRow,
  type PreparedRequest,
  type RequestMethod,
} from "./types";
import { variableResolver } from "./variables";

const forbiddenHeaders = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);
export function extractPathParameters(address: string): string[] {
  const route = address.split(/[?#]/, 1)[0].replace(/\{\{[^{}]*\}\}/g, "");
  const names = [
    ...route.matchAll(/\{([^{}]+)\}|(?:^|\/)\:([A-Za-z_][\w-]*)(?=\/|$)/g),
  ].map((match) => match[1] || match[2]);
  return [...new Set(names)];
}
export function mergeRows(
  groups: RequestRow[][],
  ignoreCase = false,
): RequestRow[] {
  const map = new Map<string, RequestRow>();
  for (const rows of groups)
    for (const row of rows)
      map.set(ignoreCase ? row.key.toLowerCase() : row.key, row);
  return [...map.values()];
}
export function createRequestDraft(input: {
  method: string;
  path: string;
  params: EndpointParam[];
  globalParams: GlobalParam[];
  globalHeaders: GlobalHeader[];
  endpointHeaders?: EndpointHeader[];
  bodyExample: string;
  bodyContentType?: string;
}): RequestDraft {
  const global = (location: string) =>
    input.globalParams
      .filter((p) => p.location === location)
      .map((p) => requestRow(p.name, p.value, p.enabled));
  const local = (location: string) =>
    input.params
      .filter((p) => p.location === location)
      .map((p) => requestRow(p.name, p.example));
  return {
    interpolate: true,
    documentLinked: true,
    method: input.method,
    address: input.path,
    headers: mergeRows(
      [
        input.globalHeaders.map((h) => requestRow(h.key, h.value, h.enabled)),
        global("header"),
        local("header"),
        (input.endpointHeaders ?? []).map((h) => requestRow(h.key, h.value)),
      ],
      true,
    ),
    query: mergeRows([global("query"), local("query")]),
    pathParams: mergeRows([
      extractPathParameters(input.path).map((name) => requestRow(name)),
      global("path").filter((row) => row.enabled),
      local("path"),
    ]),
    variables: [],
    auth: { type: "none" },
    body: input.bodyExample,
    bodyMode: input.bodyContentType?.startsWith(
      "application/x-www-form-urlencoded",
    )
      ? "urlencoded"
      : "raw",
    bodyFields: [
      ...new URLSearchParams(
        input.bodyContentType?.startsWith("application/x-www-form-urlencoded")
          ? input.bodyExample
          : "",
      ),
    ].map(([key, value]) => requestRow(key, value)),
    contentType: input.bodyContentType || "application/json",
    timeoutMs: 15000,
  };
}

function encodeBasic(username: string, password: string): string {
  if (username.includes(":")) throw new Error("Basic 用户名不能包含冒号");
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function prepareRequest(
  draft: RequestDraft,
  projectBaseUrl: string,
  environment?: Environment,
): PreparedRequest {
  const resolver = draft.interpolate
    ? variableResolver(environment?.variables || "{}", draft.variables)
    : {
        resolve: (value: string) => value,
        resolveJson: (value: string) => value,
      };
  const method = draft.method.toUpperCase();
  if (!REQUEST_METHODS.includes(method as RequestMethod))
    throw new Error("不支持的请求方法");
  if (
    !Number.isFinite(draft.timeoutMs) ||
    draft.timeoutMs < 1000 ||
    draft.timeoutMs > 60000
  )
    throw new Error("超时必须介于 1 秒和 60 秒之间");
  const sourceAddress = draft.address.trim().split("#", 1)[0];
  const [addressTemplate, searchTemplate = ""] = draft.interpolate
    ? sourceAddress.split(/\?([\s\S]*)/)
    : [sourceAddress, ""];
  let address = resolver.resolve(addressTemplate).trim();
  if (!address) throw new Error("请填写请求地址");
  const missing: string[] = [];
  const resolvePath = (name: string) => {
    const row = draft.pathParams.find((p) => p.enabled && p.key === name);
    if (!row || !row.value.trim()) {
      missing.push(name);
      return "";
    }
    return encodeURIComponent(resolver.resolve(row.value));
  };
  const queryIndex = address.search(/[?#]/);
  let path = queryIndex < 0 ? address : address.slice(0, queryIndex);
  const suffix = queryIndex < 0 ? "" : address.slice(queryIndex);
  if (draft.interpolate)
    path = path.replace(/\{([^{}]+)\}/g, (_, name: string) =>
      resolvePath(name),
    );
  if (draft.interpolate)
    path = path.replace(
      /(^|\/)\:([A-Za-z_][\w-]*)(?=\/|$)/g,
      (_, prefix: string, name: string) => prefix + resolvePath(name),
    );
  if (missing.length)
    throw new Error(`请填写路径参数：${[...new Set(missing)].join("、")}`);
  address = path + suffix;
  if (/^[a-z][a-z0-9+.-]*:/i.test(address) && !/^https?:\/\//i.test(address))
    throw new Error("请求地址只支持 http/https，相对路径请以 / 开头");
  const addressQuery = [...new URLSearchParams(searchTemplate)].map(
    ([key, value]) => ({
      key: resolver.resolve(key),
      value: resolver.resolve(value),
    }),
  );
  const query = [
    ...addressQuery,
    ...draft.query
      .filter((p) => p.enabled && p.key.trim())
      .map((p) => ({
        key: resolver.resolve(p.key),
        value: resolver.resolve(p.value),
      })),
  ];
  const headers: Record<string, string> = Object.create(null);
  const putHeader = (key: string, value: string) => {
    key = resolver.resolve(key).trim().toLowerCase();
    value = resolver.resolve(value);
    if (!/^[!#$%&'*+.^_`|~0-9a-z-]+$/.test(key))
      throw new Error(`请求头名称不正确：${key}`);
    if (/[^\t\x20-\x7e\x80-\xff]/.test(value))
      throw new Error(`请求头 ${key} 包含不支持的字符`);
    if (forbiddenHeaders.has(key))
      throw new Error(`请求头 ${key} 由发送服务自动管理，请移除该行`);
    headers[key] = value;
  };
  for (const row of draft.headers)
    if (row.enabled && row.key.trim()) putHeader(row.key, row.value);
  if (draft.auth.type === "bearer") {
    const token = resolver
      .resolve(draft.auth.token)
      .trim()
      .replace(/^Bearer\s+/i, "");
    if (!token) throw new Error("请填写 Bearer Token");
    putHeader("authorization", `Bearer ${token}`);
  } else if (draft.auth.type === "basic") {
    putHeader(
      "authorization",
      `Basic ${encodeBasic(resolver.resolve(draft.auth.username), resolver.resolve(draft.auth.password))}`,
    );
  } else if (draft.auth.type === "apiKey") {
    const key = resolver.resolve(draft.auth.key).trim();
    const value = resolver.resolve(draft.auth.value);
    if (!key || !value) throw new Error("请填写 API Key 名称和值");
    if (draft.auth.location === "header") putHeader(key, value);
    else {
      for (let i = query.length - 1; i >= 0; i--)
        if (query[i].key === key) query.splice(i, 1);
      query.push({ key, value });
    }
  }
  let url: URL;
  if (/^https?:\/\//i.test(address)) {
    url = new URL(address);
    url.hash = "";
    for (const entry of query) url.searchParams.append(entry.key, entry.value);
  } else {
    url = new URL(
      buildRequestUrl(
        resolver.resolve(environment?.baseUrl || projectBaseUrl),
        address,
        query,
      ),
    );
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("请求地址需要使用 http/https，认证信息请放入认证配置");
  const request: PreparedRequest = {
    url: url.toString(),
    method: method as RequestMethod,
    headers,
    timeoutMs: draft.timeoutMs,
  };
  if (!["GET", "HEAD"].includes(method) && draft.bodyMode !== "none") {
    if (draft.bodyMode === "urlencoded") {
      const form = new URLSearchParams();
      for (const field of draft.bodyFields)
        if (field.enabled && field.key.trim())
          form.append(
            resolver.resolve(field.key),
            resolver.resolve(field.value),
          );
      request.body = form.toString();
      headers["content-type"] = "application/x-www-form-urlencoded";
    } else {
      const contentType =
        headers["content-type"] || resolver.resolve(draft.contentType);
      if (contentType) putHeader("content-type", contentType);
      request.body = isJsonContentType(contentType)
        ? resolver.resolveJson(draft.body)
        : resolver.resolve(draft.body);
    }
  }
  return request;
}

export function draftFromRequest(request: PreparedRequest): RequestDraft {
  return {
    interpolate: false,
    documentLinked: false,
    method: request.method,
    address: request.url,
    headers: Object.entries(request.headers).map(([key, value]) =>
      requestRow(key, value),
    ),
    query: [],
    pathParams: [],
    variables: [],
    auth: { type: "none" },
    body: request.body ?? "",
    bodyMode: request.body === undefined ? "none" : "raw",
    bodyFields: [],
    contentType: request.headers["content-type"] || "",
    timeoutMs: request.timeoutMs,
  };
}
