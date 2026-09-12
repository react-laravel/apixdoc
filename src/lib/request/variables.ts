import { inspectJson } from "@/lib/json-document";
import type { RequestRow } from "./types";

export function environmentVariables(source: string): Map<string, string> {
  if (!source.trim()) return new Map();
  const document = inspectJson(source);
  if (document.issue || document.root?.type !== "object")
    throw new Error("环境变量必须是有效的 JSON 对象");
  const result = new Map<string, string>();
  for (const property of document.root.children ?? []) {
    const [key, value] = property.children!;
    result.set(
      String(key.value),
      value.type === "string"
        ? String(value.value)
        : source.slice(value.offset, value.offset + value.length),
    );
  }
  return result;
}

export function variableResolver(source: string, overrides: RequestRow[] = []) {
  const values = environmentVariables(source);
  for (const row of overrides)
    if (row.enabled && row.key.trim()) values.set(row.key.trim(), row.value);
  const resolved = new Map<string, string>();
  const resolveValue = (key: string, ancestors: string[] = []): string => {
    if (resolved.has(key)) return resolved.get(key)!;
    if (!values.has(key)) throw new Error(`未定义变量：${key}`);
    if (ancestors.includes(key))
      throw new Error(`变量循环引用：${[...ancestors, key].join(" → ")}`);
    if (ancestors.length > 20) throw new Error("变量嵌套超过 20 层");
    const result = values
      .get(key)!
      .replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, nested: string) =>
        resolveValue(nested.trim(), [...ancestors, key]),
      );
    if (result.length > 2 * 1024 * 1024)
      throw new Error("变量展开后的内容超过 2 MB");
    resolved.set(key, result);
    return result;
  };
  const resolve = (template: string): string =>
    template.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, key: string) =>
      resolveValue(key.trim()),
    );
  const resolveJson = (template: string): string => {
    let output = "";
    let quoted = false;
    let escaped = false;
    for (let index = 0; index < template.length; index++) {
      if (!escaped && template.startsWith("{{", index)) {
        const end = template.indexOf("}}", index + 2);
        if (end !== -1) {
          const value = resolveValue(template.slice(index + 2, end).trim());
          output += quoted ? JSON.stringify(value).slice(1, -1) : value;
          index = end + 1;
          continue;
        }
      }
      const char = template[index];
      output += char;
      if (char === '"' && !escaped) quoted = !quoted;
      escaped = char === "\\" && !escaped;
    }
    return output;
  };
  return { resolve, resolveJson, keys: [...values.keys()] };
}
