import {
  REQUEST_METHODS,
  localRequestId,
  type PreparedRequest,
  type RequestHistoryEntry,
} from "./types";
import type { SendRequestResult } from "@/lib/types";

export const HISTORY_LIMIT = 20;
const STORAGE_LIMIT = 1024 * 1024;
const RESPONSE_LIMIT = 64 * 1024;
export function createHistoryEntry(
  request: PreparedRequest,
  environment: string,
  result: { response?: SendRequestResult; error?: string },
): RequestHistoryEntry {
  const response = result.response;
  const responseBytes = response
    ? new TextEncoder().encode(response.body)
    : undefined;
  const truncated = !!responseBytes && responseBytes.length > RESPONSE_LIMIT;
  return {
    id: localRequestId(),
    at: new Date().toISOString(),
    environment,
    request: { ...request, headers: { ...request.headers } },
    ...result,
    ...(response
      ? {
          response: {
            ...response,
            headers: { ...response.headers },
            body: truncated
              ? new TextDecoder().decode(
                  responseBytes!.subarray(0, RESPONSE_LIMIT),
                  { stream: true },
                )
              : response.body,
          },
          responseTruncated: truncated,
        }
      : {}),
  };
}
export function historyStorageKey(
  userId: string,
  projectId: string,
  endpointId: string,
): string {
  return `apixdoc.history.v1:${encodeURIComponent(userId)}:${encodeURIComponent(projectId)}:${encodeURIComponent(endpointId)}`;
}
export function serializeHistory(entries: RequestHistoryEntry[]): string {
  const bounded = entries.slice(0, HISTORY_LIMIT);
  let serialized = JSON.stringify(bounded);
  while (
    new TextEncoder().encode(serialized).length > STORAGE_LIMIT &&
    bounded.length
  ) {
    bounded.pop();
    serialized = JSON.stringify(bounded);
  }
  return serialized;
}
function validRequest(value: unknown): value is PreparedRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as PreparedRequest;
  return (
    typeof request.url === "string" &&
    /^https?:\/\//i.test(request.url) &&
    REQUEST_METHODS.includes(request.method) &&
    !!request.headers &&
    typeof request.headers === "object" &&
    !Array.isArray(request.headers) &&
    Object.values(request.headers).every((v) => typeof v === "string") &&
    (request.body === undefined || typeof request.body === "string") &&
    Number.isFinite(request.timeoutMs) &&
    request.timeoutMs >= 1000 &&
    request.timeoutMs <= 60000
  );
}
export function parseHistory(source: string | null): RequestHistoryEntry[] {
  if (!source || source.length > STORAGE_LIMIT) return [];
  try {
    const parsed: unknown = JSON.parse(source);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is RequestHistoryEntry => {
        if (!item || typeof item !== "object") return false;
        return (
          typeof item.id === "string" &&
          typeof item.at === "string" &&
          !Number.isNaN(Date.parse(item.at)) &&
          typeof item.environment === "string" &&
          validRequest(item.request) &&
          (item.error === undefined || typeof item.error === "string") &&
          (item.response === undefined ||
            (typeof item.response === "object" &&
              item.response &&
              typeof item.response.body === "string" &&
              typeof item.response.status === "number" &&
              typeof item.response.duration === "number" &&
              item.response.headers &&
              typeof item.response.headers === "object" &&
              !Array.isArray(item.response.headers) &&
              Object.values(item.response.headers).every(
                (value) => typeof value === "string",
              )))
        );
      })
      .slice(0, HISTORY_LIMIT);
  } catch {
    return [];
  }
}
export function displayRequestUrl(source: string): string {
  try {
    const url = new URL(source);
    for (const key of [...url.searchParams.keys()])
      if (/token|secret|password|api.?key|signature|auth/i.test(key))
        url.searchParams.set(key, "***");
    return url.toString();
  } catch {
    return source;
  }
}
