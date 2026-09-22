import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { apiFetch } from "@/lib/api-fetch";
import ProjectsPage from "./page";
vi.mock("@/lib/api-fetch", () => ({ apiFetch: vi.fn() }));
const orgs = [
  { id: "one", name: "核心团队" },
  { id: "two", name: "营销团队" },
];
const project = {
  id: "p",
  name: "订单服务",
  description: "订单与支付",
  createdAt: "2026-09-22",
  isPublic: false,
  _count: { endpoints: 7, folders: 2 },
};
beforeEach(() => { vi.mocked(apiFetch).mockReset(); });
describe("project discovery", () => {
  it("preserves accessible projects when one organization fails and retries the missing group", async () => {
    let failed = true;
    vi.mocked(apiFetch).mockImplementation(async (url) => {
      if (url === "/api/organizations") return orgs;
      if (url.includes("one")) return [project];
      if (failed) throw new Error("offline");
      return [{ ...project, id: "other", name: "活动服务", isPublic: true }];
    });
    render(<ProjectsPage />);
    expect(await screen.findByText("订单服务")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("营销团队");
    failed = false;
    fireEvent.click(screen.getByRole("button", { name: "重新加载" }));
    expect(await screen.findByText("活动服务")).toBeVisible();
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.change(screen.getByRole("combobox", { name: "访问范围" }), {
      target: { value: "private" },
    });
    expect(screen.queryByText("活动服务")).toBeNull();
    expect(screen.getByText("订单服务")).toBeVisible();
    fireEvent.change(screen.getByRole("searchbox", { name: "搜索项目" }), {
      target: { value: "does not exist" },
    });
    expect(screen.getByText("没有找到匹配的项目")).toBeVisible();
    fireEvent.click(screen.getAllByRole("button", { name: "清空筛选" })[0]);
    expect(screen.getByText("活动服务")).toBeVisible();
  });
  it("shows a retry instead of a false empty-state when the organization list fails", async () => {
    vi.mocked(apiFetch).mockRejectedValue(new Error("组织读取失败"));
    render(<ProjectsPage />);
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("组织读取失败"),
    );
    expect(screen.queryByText("还没有项目")).toBeNull();
  });
});
