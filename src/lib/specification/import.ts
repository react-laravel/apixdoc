import { stringifyDocumentJson, JsonNumber } from "@/lib/documentation/json";
import {
  record,
  list,
  text,
  parseSpecification,
  pointerPart,
  dereference,
} from "./value";
import { endpointSnapshot } from "./snapshot";
import { readExample } from "./media";
import type { ImportPlan, ImportedEndpoint } from "./types";
import type {
  Endpoint,
  EndpointParam,
  EndpointResponse,
  Environment,
} from "@/lib/types";
import type { RequestAuth } from "@/lib/request/types";

const methods = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
  "trace",
];
const stringValue = (value: unknown) =>
  value instanceof JsonNumber
    ? value.source
    : typeof value === "string"
      ? value
      : value === undefined
        ? ""
        : stringifyDocumentJson(value);
const jsonText = (value: unknown) => stringifyDocumentJson(value ?? {});
function description(value: unknown): string {
  return typeof value === "string" ? value : text(record(value).content);
}
function schemaType(
  value: unknown,
  root: unknown,
  seen = new Set<string>(),
): string {
  const schema = record(value);
  const type = schema.type;
  if (typeof type === "string") return type;
  if (Array.isArray(type))
    return (
      (type.find(
        (item) => typeof item === "string" && item !== "null",
      ) as string) || "object"
    );
  const ref = text(schema.$ref);
  if (ref.startsWith("#") && !seen.has(ref)) {
    const next = new Set(seen);
    next.add(ref);
    try {
      return schemaType(dereference(schema, root, new Set()), root, next);
    } catch {
      return "object";
    }
  }
  return schema.properties ? "object" : schema.items ? "array" : "object";
}
function finish(endpoint: ImportedEndpoint): ImportedEndpoint {
  endpoint.sourceBaseline = JSON.stringify(
    endpointSnapshot({ ...endpoint, id: "", folderId: null } as Endpoint),
  );
  return endpoint;
}
function mergeParameters(path: unknown, operation: unknown): unknown[] {
  const map = new Map<string, unknown>();
  for (const parameter of [...list(path), ...list(operation)]) {
    const p = record(parameter);
    map.set(p.$ref ? `ref:${p.$ref}` : `${p.in}:${p.name}`, parameter);
  }
  return [...map.values()];
}
export function effectiveOperation(
  pathValue: unknown,
  method: string,
  root: unknown,
  warnings = new Set<string>(),
) {
  const path = dereference(pathValue, root, warnings);
  const operation = { ...record(path[method]) };
  const parameters = [
    ...list(path.parameters),
    ...list(operation.parameters),
  ].map((parameter) => dereference(parameter, root, warnings));
  operation.parameters = mergeParameters([], parameters);
  if (operation.requestBody)
    operation.requestBody = dereference(operation.requestBody, root, warnings);
  const responses = record(operation.responses);
  const resolved = record(undefined);
  for (const [key, response] of Object.entries(responses))
    resolved[key] = dereference(response, root, warnings);
  operation.responses = resolved;
  if (operation.servers === undefined)
    operation.servers = path.servers ?? record(root).servers;
  if (operation.security === undefined)
    operation.security = record(root).security;
  return operation;
}
function normalizeOpenApi(
  root: Record<string, unknown>,
  source: string,
): ImportPlan {
  const version = text(root.openapi);
  if (!/^3\.(?:0|1)\.\d+$/.test(version))
    throw new Error("当前支持 OpenAPI 3.0 / 3.1，请先转换规范版本");
  const info = record(root.info);
  if (!text(info.title) || !text(info.version))
    throw new Error("OpenAPI 需要 info.title 和字符串形式的 info.version");
  const warnings = new Set<string>();
  const endpoints: ImportedEndpoint[] = [];
  const environments: Environment[] = [];
  const servers = list(root.servers);
  const normalizeServer = (value: unknown): string => {
    const server = record(value);
    const url = text(server.url);
    const variables = record(server.variables);
    const defaults: Record<string, string> = Object.create(null);
    for (const [name, item] of Object.entries(variables))
      defaults[name] = stringValue(record(item).default);
    const template = url.replace(/\{([^{}]+)\}/g, "{{$1}}");
    if (/^https?:\/\//i.test(template)) {
      if (!environments.some((env) => env.baseUrl === template))
        environments.push({
          name: text(server.description) || `服务器 ${environments.length + 1}`,
          baseUrl: template,
          variables: JSON.stringify(defaults),
          isDefault: environments.length === 0,
        });
      return template;
    }
    if (url)
      warnings.add(`相对服务器地址 ${url} 已保留，请在环境设置中配置完整地址`);
    return "";
  };
  servers.forEach(normalizeServer);
  for (const [path, pathValue] of Object.entries(record(root.paths))) {
    if (!path.startsWith("/"))
      throw new Error(`OpenAPI 路径必须以 / 开头：${path}`);
    const pathItem = dereference(pathValue, root, warnings);
    for (const method of methods) {
      if (!Object.prototype.hasOwnProperty.call(pathItem, method)) continue;
      const operation = effectiveOperation(pathValue, method, root, warnings);
      const parameters: EndpointParam[] = [];
      for (const value of list(operation.parameters)) {
        const parameter = record(value);
        if (parameter.$ref) {
          warnings.add(`未解析的参数引用已保留：${parameter.$ref}`);
          continue;
        }
        const location = text(parameter.in);
        const name = text(parameter.name);
        if (!name || !["query", "path", "header", "cookie"].includes(location))
          throw new Error(`${method.toUpperCase()} ${path} 参数定义不完整`);
        const media = record(Object.values(record(parameter.content))[0]);
        const schema = parameter.schema ?? media.schema ?? {};
        const examples = record(parameter.examples);
        const sample =
          parameter.example ??
          record(Object.values(examples)[0]).value ??
          media.example ??
          record(schema).default;
        if (
          location === "cookie" ||
          parameter.style === "deepObject" ||
          parameter.content
        )
          warnings.add(
            "复杂参数序列化与 Cookie 参数已保留，调试时请检查实际请求配置",
          );
        parameters.push({
          name,
          location,
          type: schemaType(schema, root),
          required: location === "path" || parameter.required === true,
          description: text(parameter.description),
          example: stringValue(sample),
          schema: jsonText(schema),
        });
      }
      const body = record(operation.requestBody);
      const content = record(body.content);
      const contentType =
        Object.keys(content).find((key) => /json/i.test(key)) ||
        Object.keys(content)[0] ||
        "";
      const media = record(content[contentType]);
      const responses: EndpointResponse[] = [];
      for (const [statusKey, rawResponse] of Object.entries(
        record(operation.responses),
      )) {
        if (!/^(?:[1-5]\d\d|[1-5]XX|default)$/.test(statusKey))
          throw new Error(`响应码不正确：${statusKey}`);
        const response = record(rawResponse);
        if (response.$ref)
          warnings.add(`未解析的响应引用已保留：${response.$ref}`);
        const responseContent = record(response.content);
        const types = Object.keys(responseContent);
        for (const mime of types.length ? types : [""]) {
          const item = record(responseContent[mime]);
          responses.push({
            statusCode: /^\d{3}$/.test(statusKey) ? Number(statusKey) : 0,
            statusKey,
            description: text(response.description),
            contentType: mime,
            schema: jsonText(item.schema),
            example: readExample(item),
          });
        }
      }
      if (list(operation.security).length)
        warnings.add("认证方案已保留，请在在线测试中配置认证信息");
      const serverUrl = normalizeServer(list(operation.servers)[0]);
      if (operation.callbacks)
        warnings.add("回调定义已完整保留，当前不会生成独立回调接口");
      endpoints.push(
        finish({
          name:
            text(operation.summary) ||
            text(operation.operationId) ||
            `${method.toUpperCase()} ${path}`,
          method: method.toUpperCase(),
          path,
          description: text(operation.description),
          folderPath: list(operation.tags)
            .filter((tag): tag is string => typeof tag === "string")
            .slice(0, 1),
          parameters,
          headers: [],
          requestBody: contentType
            ? {
                contentType,
                schema: jsonText(media.schema),
                example: readExample(media),
                content: jsonText(content),
              }
            : null,
          responses,
          serverUrl,
          auth: "{}",
          sourcePointer: `/paths/${pointerPart(path)}/${method}`,
          sourceDefinition: jsonText({
            kind: "openapi",
            variables: Object.fromEntries(
              Object.entries(
                record(record(list(operation.servers)[0]).variables),
              ).map(([name, value]) => [
                name,
                stringValue(record(value).default),
              ]),
            ),
            operation,
            folderPath: list(operation.tags)
              .filter((tag) => typeof tag === "string")
              .slice(0, 1),
          }),
          sourceBaseline: "",
        }),
      );
      if (endpoints.length > 2000) throw new Error("每次最多导入 2000 个接口");
    }
  }
  if (root.webhooks) warnings.add("Webhooks 已完整保留在原始规范中");
  if (
    !endpoints.length &&
    !Object.keys(record(root.components)).length &&
    !root.webhooks
  )
    throw new Error("规范中未找到可导入的接口或模型定义");
  const scanRefs = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    const ref = text(record(value).$ref);
    if (ref && !ref.startsWith("#"))
      warnings.add(`外部引用已保留，未自动加载：${ref}`);
    if (Array.isArray(value)) value.forEach(scanRefs);
    else Object.values(value).forEach(scanRefs);
  };
  scanRefs(root);
  if (endpoints.some((e) => e.method === "TRACE"))
    warnings.add("TRACE 接口已保留，在线调试暂不支持此方法");
  return {
    format: "openapi",
    version,
    name: text(info.title),
    description: text(info.description),
    document: source,
    endpoints,
    environments,
    warnings: [...warnings],
  };
}
function postmanAuth(value: unknown, warnings: Set<string>): RequestAuth {
  const auth = record(value);
  const kind = text(auth.type);
  const values = new Map(
    list(auth[kind]).map((item) => [
      text(record(item).key),
      stringValue(record(item).value),
    ]),
  );
  if (!kind || kind === "noauth") return { type: "none" };
  if (kind === "bearer")
    return { type: "bearer", token: values.get("token") || "" };
  if (kind === "basic")
    return {
      type: "basic",
      username: values.get("username") || "",
      password: values.get("password") || "",
    };
  if (kind === "apikey")
    return {
      type: "apiKey",
      key: values.get("key") || "",
      value: values.get("value") || "",
      location: values.get("in") === "query" ? "query" : "header",
    };
  warnings.add(`认证方式 ${kind} 已保留，在线调试暂需手动配置`);
  return { type: "none" };
}
function normalizePostman(
  root: Record<string, unknown>,
  source: string,
): ImportPlan {
  const info = record(root.info);
  if (!/\/collection\/v2\.1\.0\//.test(text(info.schema)))
    throw new Error("当前支持 Postman Collection 2.1");
  if (!Array.isArray(root.item)) throw new Error("Postman 集合缺少 item 列表");
  const warnings = new Set<string>();
  const endpoints: ImportedEndpoint[] = [];
  const variables: Record<string, string> = Object.create(null);
  for (const item of list(root.variable)) {
    const variable = record(item);
    if (text(variable.key) && !variable.disabled)
      variables[text(variable.key)] = stringValue(variable.value);
  }
  const environments: Environment[] = [];
  const walk = (
    items: unknown[],
    folders: string[],
    pointer: string,
    inheritedAuth: unknown,
    depth: number,
  ) => {
    if (depth > 50) throw new Error("集合目录超过 50 层");
    items.forEach((value, index) => {
      const item = record(value);
      const at = `${pointer}/${index}`;
      if (item.event)
        warnings.add("集合脚本已保留，导入和调试不会执行这些脚本");
      if (Array.isArray(item.item)) {
        walk(
          item.item,
          [...folders, text(item.name, "未命名目录")],
          `${at}/item`,
          item.auth ?? inheritedAuth,
          depth + 1,
        );
        return;
      }
      const request =
        typeof item.request === "string"
          ? { method: "GET", url: item.request }
          : record(item.request);
      if (!request.url) throw new Error(`集合请求 ${text(item.name)} 缺少 URL`);
      const urlObject = record(request.url);
      const rawUrl =
        typeof request.url === "string" ? request.url : text(urlObject.raw);
      if (!rawUrl) throw new Error(`集合请求 ${text(item.name)} 缺少 url.raw`);
      const method = text(request.method, "GET").toUpperCase();
      if (!methods.includes(method.toLowerCase()))
        throw new Error(`不支持的请求方法：${method}`);
      let serverUrl = "";
      let path = rawUrl;
      const prefix = rawUrl.match(/^\{\{([^{}]+)\}\}(?=\/|$)/);
      if (prefix) {
        serverUrl = `{{${prefix[1]}}}`;
        path = rawUrl.slice(prefix[0].length) || "/";
      } else {
        try {
          const parsed = new URL(rawUrl);
          serverUrl = parsed.origin;
          path = parsed.pathname + parsed.search;
        } catch {
          warnings.add(`地址 ${rawUrl} 需要配置变量后才能调试`);
        }
      }
      const [route, rawQuery = ""] = path.split("#", 1)[0].split(/\?([\s\S]*)/);
      path = route.replace(/(^|\/)\:([\w-]+)(?=\/|$)/g, "$1{$2}");
      if (!path.startsWith("/")) path = `/${path}`;
      const query = Array.isArray(urlObject.query)
        ? urlObject.query
        : [...new URLSearchParams(rawQuery)].map(([key, value]) => ({
            key,
            value,
          }));
      const parameters: EndpointParam[] = query
        .filter((value) => !record(value).disabled)
        .map((value) => {
          const p = record(value);
          return {
            name: text(p.key),
            type: "string",
            location: "query",
            required: false,
            description: description(p.description),
            example: stringValue(p.value),
            schema: '{"type":"string"}',
          };
        });
      for (const value of list(urlObject.variable)) {
        const p = record(value);
        parameters.push({
          name: text(p.key),
          type: "string",
          location: "path",
          required: true,
          description: description(p.description),
          example: stringValue(p.value),
          schema: '{"type":"string"}',
        });
      }
      const headerList = list(request.header)
        .filter((value) => !record(value).disabled)
        .map((value) => {
          const h = record(value);
          return {
            key: text(h.key),
            value: stringValue(h.value),
            description: description(h.description),
            required: false,
          };
        });
      const body = record(request.body);
      let requestBody = null;
      if (body.mode === "raw") {
        const contentType =
          headerList.find((h) => h.key.toLowerCase() === "content-type")
            ?.value ||
          (text(record(record(body.options).raw).language) === "json"
            ? "application/json"
            : "text/plain");
        requestBody = {
          contentType,
          schema: "{}",
          example: text(body.raw),
          content: "{}",
        };
      } else if (body.mode === "urlencoded") {
        const form = new URLSearchParams();
        for (const value of list(body.urlencoded)) {
          const item = record(value);
          if (!item.disabled)
            form.append(text(item.key), stringValue(item.value));
        }
        requestBody = {
          contentType: "application/x-www-form-urlencoded",
          schema: "{}",
          example: form.toString(),
          content: "{}",
        };
      } else if (body.mode)
        warnings.add(
          `请求体 ${text(body.mode)} 已保留，当前表单暂不编辑此模式`,
        );
      const responses: EndpointResponse[] = list(item.response).map((value) => {
        const r = record(value);
        const code = Number(stringValue(r.code));
        if (!Number.isInteger(code) || code < 100 || code > 599)
          throw new Error("集合响应码不正确");
        return {
          statusCode: code,
          statusKey: String(code),
          description: text(r.name) || text(r.status),
          contentType: text(
            record(
              list(r.header).find(
                (h) => text(record(h).key).toLowerCase() === "content-type",
              ),
            ).value,
            "application/json",
          ),
          schema: "{}",
          example: text(r.body),
        };
      });
      const auth = request.auth ?? inheritedAuth ?? { type: "noauth" };
      const endpoint = finish({
        name: text(item.name) || `${method} ${path}`,
        method,
        path,
        description: description(request.description),
        folderPath: folders,
        parameters,
        headers: headerList,
        requestBody,
        responses,
        serverUrl,
        auth: JSON.stringify(postmanAuth(auth, warnings)),
        sourcePointer: at,
        sourceDefinition: jsonText({
          kind: "postman",
          variables,
          folderPath: folders,
          item: { ...item, request: { ...request, auth } },
        }),
        sourceBaseline: "",
      });
      endpoints.push(endpoint);
      if (endpoints.length > 2000) throw new Error("每次最多导入 2000 个接口");
      const resolvedServer = serverUrl.replace(
        /\{\{([^{}]+)\}\}/g,
        (whole, key: string) => variables[key] ?? whole,
      );
      if (
        /^https?:\/\//i.test(resolvedServer) &&
        !environments.some((env) => env.baseUrl === resolvedServer)
      )
        environments.push({
          name: `集合环境 ${environments.length + 1}`,
          baseUrl: resolvedServer,
          variables: JSON.stringify(variables),
          isDefault: environments.length === 0,
        });
    });
  };
  if (root.event) warnings.add("集合脚本已保留，导入和调试不会执行这些脚本");
  walk(root.item, [], "/item", root.auth, 0);
  return {
    format: "postman",
    version: "2.1.0",
    name: text(info.name, "Postman Collection"),
    description: description(info.description),
    document: source,
    endpoints,
    environments,
    warnings: [...warnings],
  };
}
export function createImportPlan(source: string): ImportPlan {
  const root = record(parseSpecification(source));
  const plan = root.openapi
    ? normalizeOpenApi(root, source)
    : record(root.info).schema
      ? normalizePostman(root, source)
      : (() => {
          throw new Error("未识别为 OpenAPI 3.0/3.1 或 Postman Collection 2.1");
        })();
  if (
    new TextEncoder().encode(JSON.stringify(plan.endpoints)).length >
    8 * 1024 * 1024
  )
    throw new Error("规范展开后的内容超过 8 MB，请拆分文件");
  return plan;
}
