import { describe, it, expect } from "vitest";
import { cn, HTTP_METHODS, METHOD_COLORS } from "@/lib/utils";

describe("utils", () => {
  describe("cn", () => {
    it("merges class names", () => {
      expect(cn("foo", "bar")).toBe("foo bar");
    });

    it("handles conditional classes with clsx", () => {
      expect(cn("base", true && "active", false && "inactive")).toBe("base active");
    });

    it("handles undefined and null", () => {
      expect(cn("base", undefined, null, "extra")).toBe("base extra");
    });

    it("merges conflicting tailwind classes with tailwind-merge", () => {
      expect(cn("p-4", "p-2")).toBe("p-2");
    });

    it("handles empty input", () => {
      expect(cn()).toBe("");
    });

    it("handles array input", () => {
      expect(cn(["a", "b"], "c")).toBe("a b c");
    });
  });

  describe("HTTP_METHODS", () => {
    it("contains all standard HTTP methods", () => {
      expect(HTTP_METHODS).toEqual([
        "GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS",
      ]);
    });

    it("has length of 7", () => {
      expect(HTTP_METHODS.length).toBe(7);
    });
  });

  describe("METHOD_COLORS", () => {
    it("has color mapping for each HTTP method", () => {
      for (const method of HTTP_METHODS) {
        expect(METHOD_COLORS[method]).toBeDefined();
        expect(typeof METHOD_COLORS[method]).toBe("string");
      }
    });

    it("includes dark mode variants", () => {
      expect(METHOD_COLORS.GET).toContain("dark:");
      expect(METHOD_COLORS.POST).toContain("dark:");
    });

    it("has background and text classes for GET", () => {
      expect(METHOD_COLORS.GET).toContain("bg-green");
      expect(METHOD_COLORS.GET).toContain("text-green");
    });
  });
});
