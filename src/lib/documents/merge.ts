export interface FieldConflict {
  path: string;
  base?: unknown;
  mine?: unknown;
  current?: unknown;
}
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b))
    return (
      a.length === b.length &&
      a.every((value, index) => sameValue(value, b[index]))
    );
  if (object(a) && object(b)) {
    const keys = Object.keys(a);
    return (
      keys.length === Object.keys(b).length &&
      keys.every((key) => Object.hasOwn(b, key) && sameValue(a[key], b[key]))
    );
  }
  return false;
}
const pointer = (key: string) => key.replace(/~/g, "~0").replace(/\//g, "~1");
/** Arrays stay atomic: reordering or deleting a row must not silently resurrect or misidentify it. */
export function mergeDocuments(
  base: unknown,
  mine: unknown,
  current: unknown,
  path = "",
  conflicts: FieldConflict[] = [],
): { value: unknown; conflicts: FieldConflict[] } {
  if (sameValue(mine, base) || sameValue(mine, current))
    return { value: current, conflicts };
  if (sameValue(current, base)) return { value: mine, conflicts };
  if (object(base) && object(mine) && object(current)) {
    const entries: [string, unknown][] = [];
    for (const key of new Set([
      ...Object.keys(base),
      ...Object.keys(mine),
      ...Object.keys(current),
    ])) {
      const merged = mergeDocuments(
        base[key],
        mine[key],
        current[key],
        `${path}/${pointer(key)}`,
        conflicts,
      );
      if (merged.value !== undefined) entries.push([key, merged.value]);
    }
    return { value: Object.fromEntries(entries), conflicts };
  }
  conflicts.push({ path, base, mine, current });
  return { value: current, conflicts };
}
export function differences(
  before: unknown,
  after: unknown,
  path = "",
  result: FieldConflict[] = [],
): FieldConflict[] {
  if (sameValue(before, after) || result.length >= 200) return result;
  if (object(before) && object(after))
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)]))
      differences(before[key], after[key], `${path}/${pointer(key)}`, result);
  else result.push({ path, base: before, current: after });
  return result;
}
export function chooseConflict(
  value: unknown,
  path: string,
  choice: unknown,
): unknown {
  if (!path) return choice;
  const parts = path
    .slice(1)
    .split("/")
    .map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
  const visit = (node: unknown, index: number): unknown => {
    const result = object(node) ? { ...node } : {};
    const key = parts[index];
    const next =
      index === parts.length - 1 ? choice : visit(result[key], index + 1);
    if (next === undefined) delete result[key];
    else
      Object.defineProperty(result, key, {
        value: next,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    return result;
  };
  return visit(value, 0);
}
