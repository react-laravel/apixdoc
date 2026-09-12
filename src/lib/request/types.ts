import type { SendRequestResult } from "@/lib/types";

export const REQUEST_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
] as const;
export type RequestMethod = (typeof REQUEST_METHODS)[number];
export interface RequestRow {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}
export type RequestAuth =
  | { type: "none" }
  | { type: "bearer"; token: string }
  | { type: "basic"; username: string; password: string }
  | {
      type: "apiKey";
      key: string;
      value: string;
      location: "header" | "query";
    };
export interface RequestDraft {
  interpolate: boolean;
  documentLinked: boolean;
  method: string;
  address: string;
  headers: RequestRow[];
  query: RequestRow[];
  pathParams: RequestRow[];
  variables: RequestRow[];
  auth: RequestAuth;
  body: string;
  bodyMode: "raw" | "urlencoded" | "none";
  bodyFields: RequestRow[];
  contentType: string;
  timeoutMs: number;
}
export interface PreparedRequest {
  url: string;
  method: RequestMethod;
  headers: Record<string, string>;
  body?: string;
  timeoutMs: number;
}
export interface RequestHistoryEntry {
  id: string;
  at: string;
  environment: string;
  request: PreparedRequest;
  response?: SendRequestResult;
  responseTruncated?: boolean;
  error?: string;
}
let localSequence = 0;
/** UI/history identifiers only; never use this fallback for authentication or signing. */
export function localRequestId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `request-${Date.now().toString(36)}-${++localSequence}-${Math.random().toString(36).slice(2)}`
  );
}
export function requestRow(key = "", value = "", enabled = true): RequestRow {
  return { id: localRequestId(), key, value, enabled };
}
