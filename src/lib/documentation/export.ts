import {
  parseDocumentJson as parse,
  stringifyDocumentJson,
  JsonNumber,
} from "./json";
import { stringify as stringifyYaml, type ScalarTag } from "yaml";
import { mergeMedia } from "@/lib/specification/media";
import { collectProjectEndpoints, folderPath } from "./navigation";
import type { Folder, Project } from "@/lib/types";
import { REQUEST_METHODS } from "@/lib/request/types";

function object(value: unknown): Record<string, unknown> {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !(value instanceof JsonNumber)
    ? (value as Record<string, unknown>)
    : {};
}
function json(source: string | undefined, label: string): unknown {
  if (!source?.trim()) return {};
  try {
    return parse(source);
  } catch {
    throw new Error(`${label} 不是有效 JSON，请修正后导出`);
  }
}
function example(source: string, type: string): unknown {
  if (type === "string") return source;
  try {
    return parse(source);
  } catch {
    return source;
  }
}
export function exportOpenApi(project: Project): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = Object.create(null);
  const securitySchemes: Record<string, unknown> = Object.create(null);
  for (const endpoint of collectProjectEndpoints(project)) {
    const method = endpoint.method.toLowerCase();
    if (
      endpoint.method !== "TRACE" &&
      !REQUEST_METHODS.includes(endpoint.method.toUpperCase() as never)
    )
      throw new Error(`接口 ${endpoint.name} 使用了不支持的方法`);
    if (!endpoint.path.startsWith("/") || /[?#]/.test(endpoint.path))
      throw new Error(
        `接口 ${endpoint.name || endpoint.path} 的路径必须以 / 开头且不含查询参数；查询参数请配置在参数表中`,
      );
    if (paths[endpoint.path]?.[method])
      throw new Error(`存在重复接口：${endpoint.method} ${endpoint.path}`);
    const operation: Record<string, unknown> = {
      summary: endpoint.name || endpoint.path,
      description: endpoint.description || "",
      operationId: endpoint.id,
    };
    if (endpoint.serverUrl)
      operation.servers = [
        { url: endpoint.serverUrl.replace(/\{\{([^{}]+)\}\}/g, "{$1}") },
      ];
    const tags = folderPath(endpoint.folderId, project.folders);
    if (tags.length) operation.tags = [tags.join(" / ")];
    const parameters = (endpoint.parameters ?? []).map((parameter) => ({
      name: parameter.name,
      in: parameter.location,
      required: parameter.location === "path" || parameter.required,
      description: parameter.description,
      schema:
        parameter.schema && parameter.schema !== "{}"
          ? json(parameter.schema, `${endpoint.name} 参数结构`)
          : { type: parameter.type || "string" },
      ...(parameter.example
        ? { example: example(parameter.example, parameter.type) }
        : {}),
    }));
    for (const header of endpoint.headers ?? [])
      if (
        !parameters.some(
          (item) =>
            item.in === "header" &&
            item.name.toLowerCase() === header.key.toLowerCase(),
        )
      )
        parameters.push({
          name: header.key,
          in: "header",
          required: !!header.required,
          description: header.description || "",
          schema: { type: "string" },
          ...(header.value ? { example: header.value } : {}),
        });
    const requiredAuth: Record<string, unknown> = Object.create(null);
    const optionalAuth: string[] = [];
    const documented = parameters.filter((parameter) => {
      const name = parameter.name.toLowerCase();
      if (parameter.in !== "header") return true;
      if (["accept", "content-type"].includes(name)) return false;
      if (name !== "authorization" && !/(?:api[-_]?key|token)$/.test(name))
        return true;
      const value =
        typeof parameter.example === "string" ? parameter.example : "";
      const scheme = /^Basic\s/i.test(value)
        ? "basic"
        : /^Bearer\s/i.test(value)
          ? "bearer"
          : "";
      const key = scheme
        ? `${scheme}Auth`
        : `header_${Array.from(name)
            .map((char) => char.charCodeAt(0).toString(16))
            .join("_")}`;
      securitySchemes[key] = scheme
        ? { type: "http", scheme }
        : { type: "apiKey", in: "header", name: parameter.name };
      if (parameter.required) requiredAuth[key] = [];
      else if (!optionalAuth.includes(key)) optionalAuth.push(key);
      return false;
    });
    if (documented.length) operation.parameters = documented;
    if (Object.keys(requiredAuth).length || optionalAuth.length) {
      if (optionalAuth.length > 6)
        throw new Error("可选认证头过多，请简化认证定义后导出");
      let alternatives = [requiredAuth];
      for (const key of optionalAuth)
        alternatives = [
          ...alternatives,
          ...alternatives.map((item) => ({ ...item, [key]: [] })),
        ];
      operation.security = alternatives;
    }
    if (endpoint.requestBody) {
      const body = endpoint.requestBody;
      const type = body.contentType || "application/json";
      const media: Record<string, unknown> = {
        schema: json(body.schema, `${endpoint.name} 请求结构`),
      };
      if (body.example)
        media.example = /json/i.test(type)
          ? example(body.example, "json")
          : body.example;
      operation.requestBody = {
        content:
          body.content && body.content !== "{}"
            ? json(
                mergeMedia(body.content, type, body.schema, body.example),
                `${endpoint.name} 请求内容`,
              )
            : { [type]: media },
      };
    }
    const responses: Record<string, unknown> = Object.create(null);
    for (const response of endpoint.responses ?? []) {
      if (
        !/^(?:[1-5]\d\d|[1-5]XX|default)$/.test(
          response.statusKey || String(response.statusCode),
        )
      )
        throw new Error(`${endpoint.name} 的响应状态码不正确`);
      const key = response.statusKey || String(response.statusCode);
      const previous = object(responses[key]);
      const content = object(previous.content);
      const type = response.contentType;
      if (!type) {
        responses[key] = {
          ...previous,
          description: response.description || `HTTP ${key}`,
        };
        continue;
      }
      if (content[type])
        throw new Error(`${endpoint.name} 存在重复的 ${key} ${type} 响应`);
      content[type] = {
        schema: json(response.schema, `${endpoint.name} 响应结构`),
        ...(response.example
          ? {
              example: /json/i.test(type)
                ? example(response.example, "json")
                : response.example,
            }
          : {}),
      };
      responses[key] = {
        description: response.description || `HTTP ${key}`,
        content,
      };
    }
    operation.responses = Object.keys(responses).length
      ? responses
      : { default: { description: "响应尚未定义" } };
    (paths[endpoint.path] ??= Object.create(null))[method] = operation;
  }
  if (project.documentationSchemas) {
    const schemas = Object.fromEntries(
      Object.entries(project.documentationSchemas).map(([name, value]) => [
        name,
        json(value, `模型 ${name}`),
      ]),
    );
    return {
      openapi: project.documentationVersion || "3.1.0",
      info: {
        title: project.name,
        description: project.description || "",
        version: "1.0.0",
      },
      ...(project.baseUrl ? { servers: [{ url: project.baseUrl }] } : {}),
      paths,
      components: {
        schemas,
        ...(Object.keys(securitySchemes).length ? { securitySchemes } : {}),
      },
    };
  }
  return {
    openapi: project.documentationVersion || "3.1.0",
    info: {
      title: project.name,
      description: project.description || "",
      version: "1.0.0",
    },
    ...(project.baseUrl ? { servers: [{ url: project.baseUrl }] } : {}),
    paths,
    ...(Object.keys(securitySchemes).length
      ? { components: { securitySchemes } }
      : {}),
  };
}
export function exportPostman(project: Project): Record<string, unknown> {
  const items: Record<string, unknown>[] = [];
  const folderItems = new Map<string, Record<string, unknown>>();
  const ensureFolder = (folder: Folder): Record<string, unknown> => {
    const found = folderItems.get(folder.id);
    if (found) return found;
    folderPath(folder.id, project.folders);
    const item = { name: folder.name, item: [] as Record<string, unknown>[] };
    folderItems.set(folder.id, item);
    const parent = project.folders.find(
      (candidate) => candidate.id === folder.parentId,
    );
    if (parent)
      (ensureFolder(parent).item as Record<string, unknown>[]).push(item);
    else items.push(item);
    return item;
  };
  for (const folder of project.folders) ensureFolder(folder);
  for (const endpoint of collectProjectEndpoints(project)) {
    const query = (endpoint.parameters ?? [])
      .filter((p) => p.location === "query")
      .map((p) => ({
        key: p.name,
        value: p.example,
        description: p.description,
      }));
    const headers = [
      ...(endpoint.headers ?? []).map((h) => ({
        key: h.key,
        value: h.value,
        description: h.description || "",
      })),
      ...(endpoint.parameters ?? [])
        .filter((p) => p.location === "header")
        .map((p) => ({
          key: p.name,
          value: p.example,
          description: p.description,
        })),
    ];
    const postmanPath = endpoint.path.replace(
      /\{\{[^{}]*\}\}|\{([^{}]+)\}/g,
      (whole, single: string | undefined) => (single ? `:${single}` : whole),
    );
    const rawUrl = /^https?:\/\//i.test(postmanPath)
      ? postmanPath
      : `${(endpoint.serverUrl || "{{baseUrl}}").replace(/\/+$/, "")}${postmanPath.startsWith("/") ? "" : "/"}${postmanPath}`;
    const address = rawUrl.match(/^(https?):\/\/([^/]+)(.*)$/i);
    const authority = address?.[2];
    const port = authority?.match(/:(\d+)$/)?.[1];
    const host = authority
      ? authority.replace(/:\d+$/, "")
      : rawUrl.split("/")[0];
    const urlPath = address ? address[3] : rawUrl.slice(host.length);
    const request: Record<string, unknown> = {
      method: endpoint.method,
      description: endpoint.description,
      header: headers,
      url: {
        raw:
          rawUrl +
          (query.length
            ? `?${query.map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join("&")}`
            : ""),
        ...(address ? { protocol: address[1] } : {}),
        ...(port ? { port } : {}),
        host: [host],
        path: urlPath.replace(/^\//, "").split("/"),
        query,
        variable: (endpoint.parameters ?? [])
          .filter((p) => p.location === "path")
          .map((p) => ({ key: p.name, value: p.example })),
      },
    };
    if (endpoint.auth) {
      const auth = object(json(endpoint.auth, "认证配置"));
      if (auth.type === "bearer")
        request.auth = {
          type: "bearer",
          bearer: [{ key: "token", value: auth.token, type: "string" }],
        };
      else if (auth.type === "basic")
        request.auth = {
          type: "basic",
          basic: ["username", "password"].map((key) => ({
            key,
            value: auth[key],
            type: "string",
          })),
        };
      else if (auth.type === "apiKey")
        request.auth = {
          type: "apikey",
          apikey: [
            { key: "key", value: auth.key },
            { key: "value", value: auth.value },
            { key: "in", value: auth.location },
          ],
        };
      else request.auth = { type: "noauth" };
    }
    if (endpoint.requestBody) {
      request.body = {
        mode: "raw",
        raw: endpoint.requestBody.example,
        options: {
          raw: {
            language: /json/i.test(endpoint.requestBody.contentType)
              ? "json"
              : "text",
          },
        },
      };
      if (!headers.some((h) => h.key.toLowerCase() === "content-type"))
        headers.push({
          key: "Content-Type",
          value: endpoint.requestBody.contentType,
          description: "",
        });
    }
    const item = {
      name: endpoint.name || endpoint.path,
      request,
      response: (endpoint.responses ?? [])
        .filter((r) => r.statusCode >= 100 && r.statusCode <= 599)
        .map((r) => ({
          name: r.description || `${r.statusCode}`,
          originalRequest: request,
          status: r.description || `${r.statusCode}`,
          code: r.statusCode,
          header: [{ key: "Content-Type", value: r.contentType }],
          body: r.example,
        })),
    };
    const folder = endpoint.folderId && folderItems.get(endpoint.folderId);
    if (folder) (folder.item as Record<string, unknown>[]).push(item);
    else items.push(item);
  }
  return {
    info: {
      name: project.name,
      description: project.description,
      schema:
        "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
    },
    variable: [{ key: "baseUrl", value: project.baseUrl, type: "string" }],
    item: items,
  };
}
const losslessTag: ScalarTag = {
  tag: "tag:yaml.org,2002:float",
  default: true,
  identify: (value) => value instanceof JsonNumber,
  resolve: (text) => text,
  stringify: (item) => String((item.value as JsonNumber).source),
};
export function serializeSpecification(
  value: unknown,
  format: "json" | "yaml",
): string {
  return format === "yaml"
    ? stringifyYaml(value, { customTags: [losslessTag], lineWidth: 0 })
    : stringifyDocumentJson(value);
}
