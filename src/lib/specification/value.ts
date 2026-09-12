import { isAlias, isMap, isScalar, isSeq, parseDocument } from "yaml";
import type { Node as YamlNode } from "yaml";
import {
  JsonNumber,
  parseDocumentJson,
  stringifyDocumentJson,
} from "@/lib/documentation/json";
export type RecordValue = Record<string, unknown>;
export function record(value: unknown): RecordValue {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !(value instanceof JsonNumber)
    ? (value as RecordValue)
    : Object.create(null);
}
export function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
export function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}
export function wireText(value: unknown): string {
  return value === undefined
    ? ""
    : typeof value === "string"
      ? value
      : stringifyDocumentJson(value);
}
export function clone<T>(value: T): T {
  return parseDocumentJson(stringifyDocumentJson(value)) as T;
}
export function pointerPart(value: string): string {
  return value.replace(/~/g, "~0").replace(/\//g, "~1");
}
export function getPointer(root: unknown, pointer: string): unknown {
  if (pointer === "" || pointer === "#") return root;
  let path = pointer.startsWith("#") ? pointer.slice(1) : pointer;
  try {
    if (pointer.startsWith("#")) path = decodeURIComponent(path);
  } catch {
    throw new Error("引用地址编码不正确");
  }
  if (!path.startsWith("/")) return undefined;
  let current = root;
  for (const part of path
    .slice(1)
    .split("/")
    .map((item) => item.replace(/~1/g, "/").replace(/~0/g, "~"))) {
    if (
      !current ||
      typeof current !== "object" ||
      !Object.prototype.hasOwnProperty.call(current, part)
    )
      return undefined;
    current = (current as RecordValue)[part];
  }
  return current;
}
export function dereference(
  value: unknown,
  root: unknown,
  warnings: Set<string>,
  seen = new Set<string>(),
): RecordValue {
  const object = record(value);
  const ref = text(object.$ref);
  if (!ref) return object;
  if (!ref.startsWith("#")) {
    warnings.add(`外部引用已保留，未自动加载：${ref}`);
    return object;
  }
  if (seen.has(ref) || seen.size > 40)
    throw new Error(`容器引用存在循环：${ref}`);
  const target = getPointer(root, ref);
  if (target === undefined) throw new Error(`引用不存在：${ref}`);
  const next = new Set(seen);
  next.add(ref);
  const result = { ...dereference(target, root, warnings, next), ...object };
  delete result.$ref;
  return result;
}
export function parseSpecification(source: string): unknown {
  if (new TextEncoder().encode(source).length > 2 * 1024 * 1024)
    throw new Error("规范文件不能超过 2 MB");
  if (/^\s*[\[{]/.test(source)) return parseDocumentJson(source);
  const doc = parseDocument(source, { intAsBigInt: true, uniqueKeys: true });
  if (doc.errors.length) throw new Error(doc.errors[0].message);
  doc.toJS({ maxAliasCount: 40 });
  let count = 0;
  const walk = (
    node: YamlNode | null | undefined,
    ancestors: Set<object>,
    depth: number,
  ): unknown => {
    if (++count > 100000 || depth > 100)
      throw new Error("YAML 结构过大或嵌套过深");
    if (node === null || node === undefined) return null;
    if (ancestors.has(node)) throw new Error("YAML 不支持循环别名");
    if (
      node.tag &&
      !/^tag:yaml.org,2002:(?:map|seq|str|int|float|bool|null)$/.test(node.tag)
    )
      throw new Error(`不支持 YAML 标签：${node.tag}`);
    const next = new Set(ancestors);
    next.add(node);
    if (isAlias(node)) return walk(node.resolve(doc), next, depth + 1);
    if (isSeq(node))
      return node.items.map((item) => walk(item as YamlNode, next, depth + 1));
    if (isMap(node)) {
      const result: RecordValue = Object.create(null);
      const explicit: [string, unknown][] = [];
      for (const item of node.items) {
        const key = walk(item.key as YamlNode, next, depth + 1);
        if (typeof key !== "string" && !(key instanceof JsonNumber))
          throw new Error("规范对象的键必须是字符串");
        const name = key instanceof JsonNumber ? key.source : key;
        const value = walk(item.value as YamlNode, next, depth + 1);
        if (name === "<<" && isScalar(item.key) && item.key.type === "PLAIN")
          for (const merged of Array.isArray(value)
            ? value.slice().reverse()
            : [value])
            Object.assign(result, record(merged));
        else explicit.push([name, value]);
      }
      for (const [key, value] of explicit) result[key] = value;
      return result;
    }
    if (isScalar(node)) {
      if (typeof node.value === "bigint")
        return new JsonNumber(node.value.toString());
      if (typeof node.value === "number") {
        if (!Number.isFinite(node.value))
          throw new Error("规范不能包含 NaN 或 Infinity");
        let raw =
          node.source?.replace(/_/g, "").replace(/^\+/, "") ||
          String(node.value);
        raw = raw
          .replace(/^(-?)\./, (_, sign: string) => `${sign}0.`)
          .replace(/\.(?=[eE]|$)/, ".0");
        return new JsonNumber(
          /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(raw)
            ? raw
            : String(node.value),
        );
      }
      return node.value;
    }
    throw new Error("不支持的 YAML 节点");
  };
  return walk(doc.contents as YamlNode, new Set(), 0);
}
