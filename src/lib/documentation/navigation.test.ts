import { describe, expect, it } from "vitest";
import { collectProjectEndpoints, createDocumentationNavigation, folderPath } from "./navigation";
import type { Endpoint, Folder } from "@/lib/types";

const endpoint: Endpoint = {
  id: "endpoint", name: "账户列表", method: "GET", path: "/accounts", description: "", folderId: "child",
};

describe("documentation navigation", () => {
  it("finds nested folder ancestors even when only the nested shape records the parent", () => {
    const folders: Folder[] = [{
      id: "parent", name: "用户管理",
      children: [{ id: "child", name: "账户", endpoints: [endpoint] }],
    }];
    expect(folderPath("child", folders)).toEqual(["用户管理", "账户"]);
    const navigation = createDocumentationNavigation({ folders, endpoints: [] });
    expect(navigation.entries[0].folderPath).toBe("用户管理 / 账户");
    expect(navigation.entries[0].searchText).toContain("用户管理 / 账户");
    expect(navigation.endpointById.get(endpoint.id)).toBe(endpoint);
  });

  it("preserves endpoint order, deduplicates repeated records, and excludes deleted endpoints", () => {
    const updated = { ...endpoint, name: "最新名称" };
    const removed = { ...endpoint, id: "deleted", deletedAt: "2026-10-04" };
    const result = collectProjectEndpoints({
      endpoints: [endpoint, removed],
      folders: [{ id: "child", name: "账户", endpoints: [updated] }],
    });
    expect(result).toEqual([updated]);
  });

  it("reports cyclic parent relationships without blocking the rest of the navigation", () => {
    const folders = [
      { id: "parent", name: "用户管理", parentId: "child" },
      { id: "child", name: "账户", parentId: "parent" },
    ];
    expect(() => folderPath("child", folders)).toThrow("目录结构存在循环");
    const navigation = createDocumentationNavigation({ folders, endpoints: [endpoint] });
    expect(navigation.entries[0].folderPath).toBe("目录结构异常");
  });
});
