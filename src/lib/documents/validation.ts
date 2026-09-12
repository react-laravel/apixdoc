import { mergeMedia } from "@/lib/specification/media";
import { JsonNumber, parseDocumentJson } from "@/lib/documentation/json";
import { DocumentError } from "./http";
import type { DocumentSection } from "./model";
const string = (
  value: unknown,
  label: string,
  fallback = "",
  max = 2 * 1024 * 1024,
): string => {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || value.length > max)
    throw new DocumentError(`${label}格式不正确或内容过长`);
  return value;
};
function array(value: unknown, label: string): Record<string, unknown>[] {
  if (
    !Array.isArray(value) ||
    value.length > 2000 ||
    value.some((v) => !v || typeof v !== "object" || Array.isArray(v))
  )
    throw new DocumentError(`${label}必须是最多 2000 项的列表`);
  return value;
}
function schema(value: unknown, label: string) {
  const text =
    typeof value === "object" && value !== null
      ? JSON.stringify(value)
      : string(value, label, "{}");
  try {
    parseDocumentJson(text || "{}");
  } catch {
    throw new DocumentError(`${label}必须是有效 JSON`);
  }
  return text;
}
export function normalizeSection(
  section: DocumentSection,
  input: Record<string, unknown>,
): Record<string, unknown> {
  if (section === "basic") {
    const result: Record<string, unknown> = {};
    for (const key of ["name", "method", "path", "description"] as const)
      if (input[key] !== undefined) {
        let value = string(
          input[key],
          key,
          "",
          key === "description" ? 500000 : 4096,
        );
        if (key !== "description") value = value.trim();
        if (key === "method") value = value.toUpperCase();
        if (!value && key !== "description")
          throw new DocumentError("名称、方法与路径不能为空");
        if (
          key === "method" &&
          ![
            "GET",
            "POST",
            "PUT",
            "PATCH",
            "DELETE",
            "OPTIONS",
            "HEAD",
            "TRACE",
          ].includes(value)
        )
          throw new DocumentError("请求方法不正确");
        result[key] = value;
      }
    if (input.folderId !== undefined) {
      if (input.folderId !== null && typeof input.folderId !== "string")
        throw new DocumentError("目录不正确");
      result.folderId = input.folderId || null;
    }
    if (input.order !== undefined) {
      if (!Number.isSafeInteger(input.order) || Number(input.order) < 0)
        throw new DocumentError("排序值不正确");
      result.order = input.order;
    }
    return result;
  }
  if (section === "params")
    return {
      parameters: array(input.params ?? input.parameters, "请求参数").map(
        (p) => {
          const location = string(p.location, "参数位置", "query");
          if (!["query", "path", "header", "cookie"].includes(location))
            throw new DocumentError("参数位置不正确");
          const name = string(p.name, "参数名称", "", 4096);
          if (!name.trim()) throw new DocumentError("参数名称不能为空");
          return {
            name,
            location,
            type: string(p.type, "参数类型", "string"),
            required: p.required === true || location === "path",
            description: string(p.description, "参数描述"),
            example: string(p.example, "参数示例"),
            schema: schema(p.schema, "参数结构"),
          };
        },
      ),
    };
  if (section === "headers")
    return {
      headers: array(input.headers, "请求头").map((h) => {
        const key = string(h.key, "请求头名称", "", 4096);
        if (!key.trim()) throw new DocumentError("请求头名称不能为空");
        return {
          key,
          value: string(h.value, "请求头内容"),
          description: string(h.description, "请求头描述"),
          required: h.required === true,
        };
      }),
    };
  if (section === "body") {
    if (input.requestBody === null) return { requestBody: null };
    const body =
      input.requestBody && typeof input.requestBody === "object"
        ? (input.requestBody as Record<string, unknown>)
        : input;
    const content = string(body.content, "媒体结构", "{}");
    try {
      const media = parseDocumentJson(content);
      if (
        !media ||
        typeof media !== "object" ||
        Array.isArray(media) ||
        media instanceof JsonNumber
      )
        throw new Error();
    } catch {
      throw new DocumentError("媒体结构必须是 JSON 对象");
    }
    const contentType = string(
      body.contentType,
      "内容格式",
      "application/json",
      255,
    );
    const bodySchema = schema(body.schema, "请求结构");
    const example =
      typeof body.example === "object"
        ? JSON.stringify(body.example)
        : string(body.example, "请求示例");
    return {
      requestBody: {
        contentType,
        schema: bodySchema,
        example,
        content: mergeMedia(content, contentType, bodySchema, example),
      },
    };
  }
  return {
    responses: array(input.responses, "响应").map((r) => {
      const statusKey = string(r.statusKey, "响应码");
      const status = statusKey || String(r.statusCode);
      if (!/^(?:[1-5]\d\d|[1-5]XX|default)$/.test(status))
        throw new DocumentError("响应码应为 100–599、1XX–5XX 或 default");
      return {
        statusCode: /^\d{3}$/.test(status) ? Number(status) : 0,
        statusKey,
        description: string(r.description, "响应描述"),
        contentType: string(r.contentType, "响应格式", "application/json", 255),
        schema: schema(r.schema, "响应结构"),
        example:
          typeof r.example === "object"
            ? JSON.stringify(r.example)
            : string(r.example, "响应示例"),
      };
    }),
  };
}
