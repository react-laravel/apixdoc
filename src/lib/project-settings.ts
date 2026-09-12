import type { Prisma } from "@prisma/client";
import { inspectJson } from "@/lib/json-document";

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("设置格式不正确");
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string, required = false): string {
  if (typeof value !== "string" || (required && !value.trim()))
    throw new Error(`请填写有效的${label}`);
  return value;
}

function boolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new Error("开关设置格式不正确");
  return value;
}

function baseUrl(value: unknown): string {
  const result = text(value, "基础 URL").trim();
  if (!result) return result;
  if (/^\{\{\s*[^{}]+\s*\}\}$/.test(result)) return result;
  try {
    if (
      !["http:", "https:"].includes(
        new URL(result.replace(/\{\{[^{}]+\}\}/g, "placeholder")).protocol,
      )
    )
      throw new Error();
  } catch {
    throw new Error("基础 URL 必须是有效的 http 或 https 地址");
  }
  return result;
}

function list<T>(
  value: unknown,
  parse: (item: Record<string, unknown>) => T,
): T[] {
  if (!Array.isArray(value)) throw new Error("设置列表格式不正确");
  return value.map((item) => parse(record(item)));
}

// Nested writes commit all tabs together; omitted fields preserve stored values.
export function parseProjectSettings(
  value: unknown,
): Prisma.ProjectUpdateInput {
  const body = record(value);
  const data: Prisma.ProjectUpdateInput = {};
  if (body.name !== undefined)
    data.name = text(body.name, "项目名称", true).trim();
  if (body.description !== undefined)
    data.description = text(body.description, "描述");
  if (body.baseUrl !== undefined) data.baseUrl = baseUrl(body.baseUrl);
  if (body.isPublic !== undefined)
    data.isPublic = boolean(body.isPublic, false);
  if (body.environments !== undefined) {
    const names = new Set<string>();
    let defaults = 0;
    data.environments = {
      deleteMany: {},
      create: list(body.environments, (item) => {
        const variables = text(item.variables ?? "{}", "环境变量");
        try {
          const document = inspectJson(variables);
          if (document.issue || document.root?.type !== "object")
            throw new Error();
        } catch {
          throw new Error("环境变量必须是有效的 JSON 对象");
        }
        const name = text(item.name, "环境名称", true).trim();
        if (names.has(name.toLowerCase())) throw new Error("环境名称不能重复");
        names.add(name.toLowerCase());
        if (item.isDefault === true && ++defaults > 1)
          throw new Error("只能选择一个默认环境");
        return {
          name,
          baseUrl: baseUrl(item.baseUrl),
          variables,
          isDefault: boolean(item.isDefault, false),
        };
      }),
    };
  }
  if (body.globalHeaders !== undefined) {
    data.globalHeaders = {
      deleteMany: {},
      create: list(body.globalHeaders, (item) => ({
        key: text(item.key, "请求头名称", true).trim(),
        value: text(item.value ?? "", "请求头值"),
        description: text(item.description ?? "", "描述"),
        enabled: boolean(item.enabled, true),
      })),
    };
  }
  if (body.globalParams !== undefined) {
    data.globalParams = {
      deleteMany: {},
      create: list(body.globalParams, (item) => {
        const location = text(item.location ?? "query", "参数位置");
        if (!["query", "header", "path"].includes(location))
          throw new Error("参数位置不正确");
        return {
          name: text(item.name, "参数名", true).trim(),
          value: text(item.value ?? "", "参数值"),
          description: text(item.description ?? "", "描述"),
          location,
          enabled: boolean(item.enabled, true),
        };
      }),
    };
  }
  return data;
}
