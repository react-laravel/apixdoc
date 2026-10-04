import { describe, expect, it } from "vitest";
import { createSidebarIndex, hasFolderAncestor } from "./endpoint-sidebar-model";

describe("sidebar directory indexes", () => {
  it("keeps project order, normalizes root folders, and indexes ancestor paths", () => {
    const folders = [
      { id: "root", name: "用户管理" },
      { id: "child", name: "账户", parentId: "root" },
      { id: "other", name: "认证", parentId: null },
    ];
    const endpoints = [
      { id: "a", name: "列表", method: "GET", path: "/accounts", folderId: "child" },
      { id: "b", name: "创建", method: "POST", path: "/accounts", folderId: "child" },
      { id: "c", name: "健康检查", method: "GET", path: "/health", folderId: null },
    ];
    const index = createSidebarIndex(folders, endpoints);
    expect(index.foldersByParent.get(null)).toEqual([folders[0], folders[2]]);
    expect(index.foldersByParent.get("root")).toEqual([folders[1]]);
    expect(index.endpointsByFolder.get("child")).toEqual(endpoints.slice(0, 2));
    expect(index.endpointById.get("c")).toBe(endpoints[2]);
    expect(index.folderPathById.get("child")).toBe("用户管理 / 账户");
    expect(index.searchEntries[0].searchText).toBe("列表 /accounts get 用户管理 / 账户");
    expect(hasFolderAncestor("child", "root", index.folderById)).toBe(true);
    expect(hasFolderAncestor("root", "child", index.folderById)).toBe(false);
  });

  it("bounds ancestor traversal when malformed folder relationships form a cycle", () => {
    const index = createSidebarIndex([
      { id: "a", name: "A", parentId: "b" },
      { id: "b", name: "B", parentId: "a" },
    ], []);
    expect(hasFolderAncestor("a", "missing", index.folderById)).toBe(false);
    expect(hasFolderAncestor("a", "b", index.folderById)).toBe(true);
  });
});
