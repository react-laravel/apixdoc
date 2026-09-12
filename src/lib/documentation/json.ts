import { inspectJson } from "@/lib/json-document";
import type { Node } from "jsonc-parser";

export class JsonNumber {
  constructor(readonly source: string) {}
}
export function parseDocumentJson(source: string): unknown {
  const document = inspectJson(source);
  if (!document.root || document.issue)
    throw new Error(document.issue?.message || "JSON 内容为空");
  const convert = (node: Node): unknown => {
    if (node.type === "number")
      return new JsonNumber(
        source.slice(node.offset, node.offset + node.length),
      );
    if (node.type === "object") {
      const result: Record<string, unknown> = Object.create(null);
      for (const property of node.children ?? []) {
        const [key, value] = property.children!;
        if (Object.prototype.hasOwnProperty.call(result, String(key.value)))
          throw new Error(`JSON 存在重复字段：${key.value}`);
        result[String(key.value)] = convert(value);
      }
      return result;
    }
    if (node.type === "array") return (node.children ?? []).map(convert);
    return node.value;
  };
  return convert(document.root);
}
export function stringifyDocumentJson(value: unknown): string {
  const ancestors = new Set<object>();
  const visit = (input: unknown, depth: number): string => {
    if (depth > 200) throw new Error("文档结构超过 200 层");
    if (input instanceof JsonNumber) return input.source;
    if (input === null || typeof input !== "object")
      return JSON.stringify(input) ?? "null";
    if (ancestors.has(input)) throw new Error("文档含有循环引用");
    ancestors.add(input);
    const indent = "  ".repeat(depth);
    const childIndent = indent + "  ";
    let result: string;
    if (Array.isArray(input))
      result = input.length
        ? `[\n${input.map((item) => childIndent + visit(item, depth + 1)).join(",\n")}\n${indent}]`
        : "[]";
    else {
      const entries = Object.entries(input).filter(
        ([, item]) => item !== undefined,
      );
      result = entries.length
        ? `{\n${entries.map(([key, item]) => `${childIndent}${JSON.stringify(key)}: ${visit(item, depth + 1)}`).join(",\n")}\n${indent}}`
        : "{}";
    }
    ancestors.delete(input);
    return result;
  };
  return visit(value, 0);
}
