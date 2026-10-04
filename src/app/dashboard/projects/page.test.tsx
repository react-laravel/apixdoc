import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { apiFetch, ApiError } from "@/lib/api-fetch";
import ProjectsPage from "./page";
vi.mock("@/lib/api-fetch", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/api-fetch")>(),
  apiFetch: vi.fn(),
}));
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
  it("keeps a failed organization's last snapshot and replaces it after a successful retry", async () => {
    let issue: Error | null = null;
    let items = [project];
    vi.mocked(apiFetch).mockImplementation(async (url) => {
      if (url === "/api/organizations") return [orgs[0]];
      if (issue) throw issue;
      return items;
    });
    render(<ProjectsPage />);
    expect(await screen.findByText("订单服务")).toBeVisible();
    await waitFor(() => expect(screen.getByLabelText("刷新项目列表")).toBeEnabled());
    issue = new Error("offline");
    fireEvent.click(screen.getByLabelText("刷新项目列表"));
    expect(await screen.findByText("刷新失败 · 显示上次加载的内容")).toBeVisible();
    expect(screen.getByText("订单服务")).toBeVisible();
    issue = null;
    items = [];
    fireEvent.click(screen.getByRole("button", { name: "重新加载" }));
    expect(await screen.findByText("还没有项目")).toBeVisible();
    expect(screen.queryByText("订单服务")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("drops cached projects when access is denied or membership disappears", async () => {
    let denied = false;
    let memberships = orgs;
    vi.mocked(apiFetch).mockImplementation(async (url) => {
      if (url === "/api/organizations") return memberships;
      if (url.includes("one")) {
        if (denied) throw new ApiError("Forbidden", 403);
        return [project];
      }
      return [{ ...project, id: "other", name: "活动服务" }];
    });
    render(<ProjectsPage />);
    expect(await screen.findByText("订单服务")).toBeVisible();
    await waitFor(() => expect(screen.getByLabelText("刷新项目列表")).toBeEnabled());
    denied = true;
    memberships = [orgs[0]];
    fireEvent.click(screen.getByLabelText("刷新项目列表"));
    await screen.findByRole("alert");
    expect(screen.queryByText("订单服务")).toBeNull();
    expect(screen.queryByText("活动服务")).toBeNull();
  });
  it("shows a failure state rather than an empty catalog after authentication expires", async () => {
    let expired = false;
    vi.mocked(apiFetch).mockImplementation(async (url) => {
      if (url === "/api/organizations") {
        if (expired) throw new ApiError("登录已失效", 401);
        return [orgs[0]];
      }
      return [project];
    });
    render(<ProjectsPage />);
    expect(await screen.findByText("订单服务")).toBeVisible();
    await waitFor(() => expect(screen.getByLabelText("刷新项目列表")).toBeEnabled());
    expired = true;
    fireEvent.click(screen.getByLabelText("刷新项目列表"));
    expect(await screen.findByText("项目暂时无法显示")).toBeVisible();
    expect(screen.queryByText("还没有项目")).toBeNull();
    expect(screen.queryByText("订单服务")).toBeNull();
  });
  it("limits organization requests to four concurrent loads and cancels queued work on unmount", async () => {
    const many = Array.from({ length: 9 }, (_, id) => ({ id: String(id), name: `组织 ${id}` }));
    const pending: (() => void)[] = [];
    let active = 0;
    let peak = 0;
    vi.mocked(apiFetch).mockImplementation(async (url) => {
      if (url === "/api/organizations") return many;
      active++;
      peak = Math.max(peak, active);
      return new Promise((resolve) => pending.push(() => {
        active--;
        resolve([]);
      }));
    });
    const view = render(<ProjectsPage />);
    await waitFor(() => expect(pending).toHaveLength(4));
    await act(async () => pending[0]());
    await waitFor(() => expect(pending).toHaveLength(5));
    expect(peak).toBe(4);
    view.unmount();
    await act(async () => pending.slice(1).forEach((resolve) => resolve()));
    expect(apiFetch).toHaveBeenCalledTimes(6);
  });
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
