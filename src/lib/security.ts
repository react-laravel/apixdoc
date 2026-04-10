import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export const HTTP_REQUEST_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
] as const;

export const ORGANIZATION_MEMBER_ROLES = [
  "owner",
  "admin",
  "member",
  "viewer",
] as const;

export const USER_ROLES = ["admin", "user"] as const;

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PROXY_RESPONSE_BYTES = 1024 * 1024;
export const PROXY_TIMEOUT_MS = 15_000;

const BLOCKED_PROXY_HEADERS = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

export function isOrganizationMemberRole(
  value: unknown,
): value is (typeof ORGANIZATION_MEMBER_ROLES)[number] {
  return (
    typeof value === "string" &&
    ORGANIZATION_MEMBER_ROLES.includes(
      value as (typeof ORGANIZATION_MEMBER_ROLES)[number],
    )
  );
}

export function isUserRole(
  value: unknown,
): value is (typeof USER_ROLES)[number] {
  return (
    typeof value === "string" &&
    USER_ROLES.includes(value as (typeof USER_ROLES)[number])
  );
}

export function isHttpRequestMethod(
  value: unknown,
): value is (typeof HTTP_REQUEST_METHODS)[number] {
  return (
    typeof value === "string" &&
    HTTP_REQUEST_METHODS.includes(
      value as (typeof HTTP_REQUEST_METHODS)[number],
    )
  );
}

export function sanitizeProxyHeaders(
  headers: unknown,
): Record<string, string> {
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) {
    return {};
  }

  const sanitized: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (typeof value !== "string") {
      continue;
    }

    const normalizedKey = key.trim().toLowerCase();
    if (!normalizedKey || BLOCKED_PROXY_HEADERS.has(normalizedKey)) {
      continue;
    }

    sanitized[normalizedKey] = value;
  }

  return sanitized;
}

export async function validateExternalUrl(rawUrl: string): Promise<URL> {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    throw new Error("Invalid URL");
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new Error("Only http and https URLs are allowed");
  }

  if (parsedUrl.username || parsedUrl.password) {
    throw new Error("URLs with embedded credentials are not allowed");
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  if (!hostname) {
    throw new Error("Invalid URL hostname");
  }

  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new Error("Loopback hosts are not allowed");
  }

  const normalizedHostname = normalizeIp(hostname);
  if (
    isIP(normalizedHostname) &&
    isPrivateOrLocalAddress(normalizedHostname)
  ) {
    throw new Error("Private network addresses are not allowed");
  }

  let resolvedAddresses: string[];
  try {
    resolvedAddresses = (
      await lookup(hostname, { all: true, verbatim: true })
    ).map((record) => normalizeIp(record.address));
  } catch {
    throw new Error("Could not resolve target host");
  }

  if (resolvedAddresses.some(isPrivateOrLocalAddress)) {
    throw new Error("Private network addresses are not allowed");
  }

  return parsedUrl;
}

export async function readLimitedResponseBody(
  response: Response,
): Promise<string> {
  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let body = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    totalBytes += value.byteLength;
    if (totalBytes > MAX_PROXY_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error("Response body exceeds 1MB limit");
    }

    body += decoder.decode(value, { stream: true });
  }

  body += decoder.decode();
  return body;
}

function normalizeIp(address: string): string {
  return address.toLowerCase().startsWith("::ffff:")
    ? address.slice(7)
    : address;
}

function isPrivateOrLocalAddress(address: string): boolean {
  const normalizedAddress = normalizeIp(address).toLowerCase();
  const version = isIP(normalizedAddress);

  if (version === 4) {
    const octets = normalizedAddress.split(".").map(Number);
    if (octets.length !== 4 || octets.some(Number.isNaN)) {
      return true;
    }

    const [a, b] = octets;

    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }

  if (version === 6) {
    return (
      normalizedAddress === "::1" ||
      normalizedAddress.startsWith("fc") ||
      normalizedAddress.startsWith("fd") ||
      normalizedAddress.startsWith("fe8") ||
      normalizedAddress.startsWith("fe9") ||
      normalizedAddress.startsWith("fea") ||
      normalizedAddress.startsWith("feb")
    );
  }

  return true;
}
