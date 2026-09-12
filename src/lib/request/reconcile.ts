import type { RequestDraft, RequestRow } from "./types";

function reconcileRows(
  current: RequestRow[],
  previous: RequestRow[],
  next: RequestRow[],
  ignoreCase = false,
): RequestRow[] {
  const key = (row: RequestRow) =>
    ignoreCase ? row.key.toLowerCase() : row.key;
  const previousByKey = new Map(previous.map((row) => [key(row), row]));
  const nextByKey = new Map(next.map((row) => [key(row), row]));
  const result: RequestRow[] = [];
  for (const row of current) {
    const before = previousByKey.get(key(row));
    if (
      before &&
      row.value === before.value &&
      row.enabled === before.enabled
    ) {
      const after = nextByKey.get(key(row));
      if (after) result.push({ ...after, id: row.id });
    } else result.push(row);
  }
  const present = new Set(result.map(key));
  for (const row of next)
    if (!previousByKey.has(key(row)) && !present.has(key(row)))
      result.push(row);
  return result;
}
function bodySignature(draft: RequestDraft) {
  return JSON.stringify({
    mode: draft.bodyMode,
    body: draft.body,
    contentType: draft.contentType,
    fields: draft.bodyFields.map(({ key, value, enabled }) => ({
      key,
      value,
      enabled,
    })),
  });
}

/** Update inherited defaults without overwriting request-specific edits or imported wire snapshots. */
export function reconcileDocumentDraft(
  current: RequestDraft,
  previous: RequestDraft,
  next: RequestDraft,
): RequestDraft {
  if (!current.documentLinked) return current;
  const addressUnchanged = current.address === previous.address;
  const bodyUnchanged = bodySignature(current) === bodySignature(previous);
  return {
    ...current,
    method: current.method === previous.method ? next.method : current.method,
    address: addressUnchanged ? next.address : current.address,
    headers: reconcileRows(
      current.headers,
      previous.headers,
      next.headers,
      true,
    ),
    query: reconcileRows(current.query, previous.query, next.query),
    pathParams: addressUnchanged
      ? reconcileRows(current.pathParams, previous.pathParams, next.pathParams)
      : current.pathParams,
    ...(bodyUnchanged
      ? {
          body: next.body,
          bodyMode: next.bodyMode,
          contentType: next.contentType,
          bodyFields: next.bodyFields,
        }
      : {}),
  };
}
