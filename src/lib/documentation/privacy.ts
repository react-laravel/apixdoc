import { parseDocumentJson, stringifyDocumentJson } from "./json";
import { record, parseSpecification } from "@/lib/specification/value";
import { inspectJson, inspectJsonTemplate } from "@/lib/json-document";
import { createScanner, type Node } from "jsonc-parser";
import type { Endpoint, EndpointDetailData, Folder } from "@/lib/types";

const secretNames = new Set([
  "authorization",
  "proxyauthorization",
  "cookie",
  "setcookie",
  "password",
  "passwd",
  "pwd",
  "secret",
  "clientsecret",
  "token",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "csrftoken",
  "bearertoken",
  "apikey",
  "xapikey",
  "privatekey",
  "secretkey",
  "accesskey",
  "sessionid",
  "session",
  "auth",
]);
export function isSensitiveName(name: string): boolean {
  const key = name.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return (
    secretNames.has(key) ||
    /^x.*(?:apikey|token|secret)$/.test(key) ||
    /^xamz(?:credential|signature|securitytoken)$/.test(key)
  );
}
export function documentationUrl(source: string): string {
  if (!source) return "";
  if (/^\{\{[^{}]+\}\}$/.test(source)) return source;
  try {
    const url = new URL(source);
    if (!["https:", "http:"].includes(url.protocol)) return "";
    url.username = "";
    url.password = "";
    url.hash = "";
    for (const key of [...url.searchParams.keys()])
      if (isSensitiveName(key) || key.toLowerCase() === "key")
        url.searchParams.delete(key);
    return url.toString();
  } catch {
    return "";
  }
}
export function documentationPath(source: string): string {
  if (/^https?:\/\//i.test(source)) return documentationUrl(source);
  const [path, query = ""] = source.split("#", 1)[0].split(/\?([\s\S]*)/);
  const params = new URLSearchParams(query);
  for (const key of [...params.keys()])
    if (isSensitiveName(key) || key.toLowerCase() === "key") params.delete(key);
  return path + (params.size ? `?${params}` : "");
}
export function documentationHeader(name: string, value: string): string {
  if (!isSensitiveName(name)) return value;
  if (name.toLowerCase() === "authorization") {
    const scheme = value.match(/^(Bearer|Basic)\s+/i)?.[1];
    if (scheme) return `${scheme} [REDACTED]`;
  }
  return "[REDACTED]";
}
export function sanitizeExample(source: string, schema = false): string {
  if (!source.trim()) return source;
  const ordinary = inspectJson(source);
  const document = ordinary.root
    ? ordinary
    : /\{\{[^{}]+\}\}/.test(source)
      ? inspectJsonTemplate(source)
      : ordinary;
  if (!document.root) {
    if (document.size > 2 * 1024 * 1024) return "";
    const scanner = createScanner(source, true);
    const tokens: {
      kind: number;
      offset: number;
      length: number;
      value: string;
    }[] = [];
    for (let kind = scanner.scan(); kind !== 17; kind = scanner.scan())
      tokens.push({
        kind,
        offset: scanner.getTokenOffset(),
        length: scanner.getTokenLength(),
        value: scanner.getTokenValue(),
      });
    const edits: { start: number; end: number; text: string }[] = [];
    for (let index = 0; index < tokens.length - 2; index++) {
      const key = tokens[index];
      const value = tokens[index + 2];
      if (
        key.kind !== 10 ||
        tokens[index + 1].kind !== 6 ||
        !isSensitiveName(key.value)
      )
        continue;
      let end = value.offset + value.length;
      if (value.kind === 1 || value.kind === 3) {
        let depth = 1;
        let next = index + 3;
        for (; next < tokens.length && depth; next++) {
          if ([1, 3].includes(tokens[next].kind)) depth++;
          if ([2, 4].includes(tokens[next].kind)) depth--;
          end = tokens[next].offset + tokens[next].length;
        }
        index = next - 1;
      } else index += 2;
      edits.push({
        start: value.offset,
        end,
        text:
          value.kind === 1
            ? "{}"
            : value.kind === 3
              ? "[]"
              : value.kind === 11
                ? "0"
                : '"[REDACTED]"',
      });
    }
    let safe = source;
    for (const edit of edits.reverse())
      safe = safe.slice(0, edit.start) + edit.text + safe.slice(edit.end);
    return safe.replace(
      /^(\s*([a-z0-9_-]+)\s*[:=])\s*.*$/gim,
      (line, prefix: string, name: string) =>
        isSensitiveName(name) ? `${prefix} [REDACTED]` : line,
    );
  }
  const edits: { offset: number; length: number; value: string }[] = [];
  const hide = (node: Node) =>
    edits.push({
      offset: node.offset,
      length: source.startsWith("{{", node.offset)
        ? source.indexOf("}}", node.offset) + 2 - node.offset
        : node.length,
      value:
        node.type === "string"
          ? '"[REDACTED]"'
          : node.type === "number"
            ? "0"
            : node.type === "boolean"
              ? "false"
              : node.type === "object"
                ? "{}"
                : node.type === "array"
                  ? "[]"
                  : "null",
    });
  const visit = (node: Node, schemaNode: boolean, secretSchema = false) => {
    if (node.type === "array") {
      node.children?.forEach((child) => visit(child, schemaNode, secretSchema));
      return;
    }
    if (node.type !== "object") return;
    for (const property of node.children ?? []) {
      const [keyNode, value] = property.children!;
      const key = String(keyNode.value);
      if (schemaNode) {
        if (["example", "default", "examples"].includes(key)) {
          if (secretSchema) hide(value);
          else visit(value, false);
        } else if (
          [
            "properties",
            "patternProperties",
            "$defs",
            "definitions",
            "dependentSchemas",
          ].includes(key) &&
          value.type === "object"
        ) {
          for (const child of value.children ?? [])
            visit(
              child.children![1],
              true,
              isSensitiveName(String(child.children![0].value)),
            );
        } else if (
          [
            "items",
            "allOf",
            "oneOf",
            "anyOf",
            "not",
            "additionalProperties",
            "$defs",
            "definitions",
          ].includes(key)
        )
          visit(value, true, secretSchema);
      } else if (isSensitiveName(key)) hide(value);
      else visit(value, false);
    }
  };
  visit(document.root, schema);
  let result = source;
  for (const edit of edits.sort((a, b) => b.offset - a.offset))
    result =
      result.slice(0, edit.offset) +
      edit.value +
      result.slice(edit.offset + edit.length);
  return result;
}

function safeMedia(content?: string): string | undefined {
  if (!content || content === "{}") return undefined;
  try {
    const result: Record<string, unknown> = Object.create(null);
    for (const [mime, value] of Object.entries(
      record(parseDocumentJson(content)),
    )) {
      const media = record(value);
      const safe: Record<string, unknown> = Object.create(null);
      if (media.schema !== undefined)
        safe.schema = parseDocumentJson(
          sanitizeExample(stringifyDocumentJson(media.schema), true),
        );
      if (media.example !== undefined)
        safe.example = parseDocumentJson(
          sanitizeExample(stringifyDocumentJson(media.example)),
        );
      if (media.examples) {
        safe.examples = Object.fromEntries(
          Object.entries(record(media.examples)).map(([name, example]) => [
            name,
            {
              value: parseDocumentJson(
                sanitizeExample(
                  stringifyDocumentJson(record(example).value ?? null),
                ),
              ),
            },
          ]),
        );
      }
      result[mime] = safe;
    }
    return stringifyDocumentJson(result);
  } catch {
    return undefined;
  }
}
function safeParameterSchema(name: string, schema: string): string {
  if (!isSensitiveName(name)) return sanitizeExample(schema, true);
  try {
    const wrapped = { properties: { [name]: parseDocumentJson(schema) } };
    return stringifyDocumentJson(
      record(
        record(
          parseDocumentJson(
            sanitizeExample(stringifyDocumentJson(wrapped), true),
          ),
        ).properties,
      )[name],
    );
  } catch {
    return "{}";
  }
}
export function sanitizeDocumentationEndpoint<T extends EndpointDetailData>(
  endpoint: T,
): Endpoint {
  return {
    id: endpoint.id,
    name: endpoint.name,
    method: endpoint.method,
    path: documentationPath(endpoint.path),
    ...(endpoint.serverUrl
      ? { serverUrl: documentationUrl(endpoint.serverUrl) }
      : {}),
    description: endpoint.description,
    folderId:
      "folderId" in endpoint && typeof endpoint.folderId === "string"
        ? endpoint.folderId
        : null,
    parameters: endpoint.parameters?.map((param) => ({
      name: param.name,
      type: param.type,
      location: param.location,
      required: param.required,
      description: param.description,
      ...(param.schema
        ? { schema: safeParameterSchema(param.name, param.schema) }
        : {}),
      example: isSensitiveName(param.name)
        ? param.location === "header"
          ? documentationHeader(param.name, param.example)
          : ""
        : sanitizeExample(param.example),
    })),
    headers: endpoint.headers?.map((header) => ({
      key: header.key,
      description: header.description,
      required: header.required,
      value: documentationHeader(header.key, header.value),
    })),
    requestBody: endpoint.requestBody
      ? {
          contentType: endpoint.requestBody.contentType,
          ...(safeMedia(endpoint.requestBody.content)
            ? { content: safeMedia(endpoint.requestBody.content) }
            : {}),
          schema: sanitizeExample(endpoint.requestBody.schema, true),
          example: sanitizeExample(endpoint.requestBody.example),
        }
      : null,
    responses: endpoint.responses?.map((response) => ({
      statusCode: response.statusCode,
      statusKey: response.statusKey,
      description: response.description,
      contentType: response.contentType,
      ...(response.schema
        ? { schema: sanitizeExample(response.schema, true) }
        : {}),
      example: sanitizeExample(response.example),
    })),
  };
}
export interface DocumentationProjectSource {
  specificationImports?: {
    format: string;
    document?: string;
    version?: string;
  }[];
  id: string;
  name: string;
  description: string;
  baseUrl: string;
  isPublic: boolean;
  folders: Folder[];
  endpoints: Endpoint[];
}
export function sanitizeDocumentationProject(
  project: DocumentationProjectSource,
) {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    baseUrl: documentationUrl(project.baseUrl),
    documentationSchemas: publicSchemas(project.specificationImports),
    documentationVersion:
      project.specificationImports?.find(
        (source) => source.format === "openapi",
      )?.version || "3.1.0",
    isPublic: project.isPublic,
    folders: project.folders.map((folder) => ({
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId,
      endpoints: folder.endpoints
        ?.filter((e) => !e.deletedAt)
        .map(sanitizeDocumentationEndpoint),
    })),
    endpoints: project.endpoints
      .filter((e) => !e.deletedAt)
      .map(sanitizeDocumentationEndpoint),
    environments: [],
    globalHeaders: [],
    globalParams: [],
  };
}

export function publicSchemas(
  sources: { format: string; document?: string }[] = [],
) {
  const schemas: Record<string, string> = Object.create(null);
  for (const source of sources) {
    if (source.format !== "openapi" || !source.document) continue;
    const root = record(parseSpecification(source.document));
    for (const [name, schema] of Object.entries(
      record(record(root.components).schemas),
    ))
      schemas[name] = sanitizeExample(stringifyDocumentJson(schema), true);
  }
  return Object.fromEntries(Object.entries(schemas));
}
