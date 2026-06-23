import { describe, it, expect } from "vitest";
import {
  isOrganizationMemberRole,
  isUserRole,
  isHttpRequestMethod,
  sanitizeProxyHeaders,
  validateExternalUrl,
  HTTP_REQUEST_METHODS,
  ORGANIZATION_MEMBER_ROLES,
  USER_ROLES,
  MIN_PASSWORD_LENGTH,
  MAX_PROXY_RESPONSE_BYTES,
  PROXY_TIMEOUT_MS,
} from "@/lib/security";

describe("security", () => {
  describe("isOrganizationMemberRole", () => {
    it("returns true for valid roles", () => {
      for (const role of ORGANIZATION_MEMBER_ROLES) {
        expect(isOrganizationMemberRole(role)).toBe(true);
      }
    });

    it("returns false for invalid values", () => {
      expect(isOrganizationMemberRole("admin2")).toBe(false);
      expect(isOrganizationMemberRole(123)).toBe(false);
      expect(isOrganizationMemberRole(null)).toBe(false);
      expect(isOrganizationMemberRole("")).toBe(false);
    });
  });

  describe("isUserRole", () => {
    it("returns true for valid roles", () => {
      for (const role of USER_ROLES) {
        expect(isUserRole(role)).toBe(true);
      }
    });

    it("returns false for invalid values", () => {
      expect(isUserRole("superadmin")).toBe(false);
      expect(isUserRole(true)).toBe(false);
      expect(isUserRole(undefined)).toBe(false);
    });
  });

  describe("isHttpRequestMethod", () => {
    it("returns true for valid HTTP methods", () => {
      for (const method of HTTP_REQUEST_METHODS) {
        expect(isHttpRequestMethod(method)).toBe(true);
      }
    });

    it("returns false for invalid values", () => {
      expect(isHttpRequestMethod("GETT")).toBe(false);
      expect(isHttpRequestMethod("get")).toBe(false);
      expect(isHttpRequestMethod(42)).toBe(false);
    });
  });

  describe("sanitizeProxyHeaders", () => {
    it("returns empty object for null/undefined", () => {
      expect(sanitizeProxyHeaders(null)).toEqual({});
      expect(sanitizeProxyHeaders(undefined)).toEqual({});
    });

    it("returns empty object for non-object", () => {
      expect(sanitizeProxyHeaders("string")).toEqual({});
      expect(sanitizeProxyHeaders(123)).toEqual({});
      expect(sanitizeProxyHeaders([])).toEqual({});
    });

    it("filters blocked headers", () => {
      const headers = {
        "Content-Type": "application/json",
        "Authorization": "Bearer token",
        "Host": "example.com",
        "Connection": "close",
      };
      const result = sanitizeProxyHeaders(headers);
      // Keys are normalized to lowercase
      expect(result["content-type"]).toBe("application/json");
      expect(result["authorization"]).toBe("Bearer token");
      expect(result["host"]).toBeUndefined();
      expect(result["connection"]).toBeUndefined();
    });

    it("normalizes header keys to lowercase", () => {
      const result = sanitizeProxyHeaders({ "X-Custom": "value" });
      expect(result["x-custom"]).toBe("value");
    });

    it("skips non-string values", () => {
      const result = sanitizeProxyHeaders({
        "X-Valid": "ok",
        "X-Number": 123,
        "X-Object": { nested: true },
      });
      expect(result["x-valid"]).toBe("ok");
      expect(result["x-number"]).toBeUndefined();
      expect(result["x-object"]).toBeUndefined();
    });

    it("skips empty keys after trimming", () => {
      const result = sanitizeProxyHeaders({
        "X-Valid": "ok",
        "   ": "spaces",
      });
      expect(result["x-valid"]).toBe("ok");
      expect(Object.keys(result).length).toBe(1);
    });
  });

  describe("validateExternalUrl", () => {
    it("throws for invalid URL", async () => {
      await expect(validateExternalUrl("not-a-url")).rejects.toThrow("Invalid URL");
    });

    it("throws for non-http protocols", async () => {
      await expect(validateExternalUrl("ftp://example.com")).rejects.toThrow(
        "Only http and https URLs are allowed",
      );
    });

    it("throws for URLs with embedded credentials", async () => {
      await expect(validateExternalUrl("https://user:pass@example.com")).rejects.toThrow(
        "URLs with embedded credentials are not allowed",
      );
    });

    it("throws for empty hostname", async () => {
      // "http://" fails at URL parsing level
      await expect(validateExternalUrl("http://")).rejects.toThrow("Invalid URL");
    });

    it("throws for loopback hosts", async () => {
      await expect(validateExternalUrl("http://localhost")).rejects.toThrow(
        "Loopback hosts are not allowed",
      );
      // localhost.test is a valid public TLD, not loopback
      await expect(validateExternalUrl("http://localhost.test")).resolves.toBeDefined();
    });
  });

  describe("constants", () => {
    it("MIN_PASSWORD_LENGTH is 8", () => {
      expect(MIN_PASSWORD_LENGTH).toBe(8);
    });

    it("MAX_PROXY_RESPONSE_BYTES is 1MB", () => {
      expect(MAX_PROXY_RESPONSE_BYTES).toBe(1024 * 1024);
    });

    it("PROXY_TIMEOUT_MS is 15 seconds", () => {
      expect(PROXY_TIMEOUT_MS).toBe(15000);
    });
  });
});
