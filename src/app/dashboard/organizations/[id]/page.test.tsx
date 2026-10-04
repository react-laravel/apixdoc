import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { apiFetch, ApiError } from "@/lib/api-fetch";
import type { Organization } from "@/lib/types";
import OrganizationDetailPage from "./page";

const navigation = vi.hoisted(() => ({ id: "one" }));
vi.mock("next/navigation", () => ({ useParams: () => ({ id: navigation.id }) }));
vi.mock("@/lib/api-fetch", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/api-fetch")>(),
  apiFetch: vi.fn(),
}));
vi.mock("@/components/team-management", () => ({
  TeamManagement: ({ organization, onReload }: {
    organization: Organization;
    onReload: () => Promise<void>;
  }) => (
    <div>
      <p>团队版本 {organization.teamVersion}</p>
      <button onClick={() => void onReload().catch(() => {})}>刷新团队信息</button>
    </div>
  ),
}));

const org = {
  id: "one", name: "核心团队", description: "接口维护工作空间", members: [],
  permissions: { canEdit: true }, teamVersion: 1,
};
const project = {
  id: "order", name: "订单服务", description: "订单与支付", isPublic: false,
  _count: { endpoints: 7, folders: 2 },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function serveWorkspace() {
  vi.mocked(apiFetch).mockImplementation(async (url) =>
    url.startsWith("/api/organizations/") ? org : [project],
  );
}

beforeEach(() => {
  navigation.id = "one";
  vi.mocked(apiFetch).mockReset();
  window.history.replaceState(null, "", "/dashboard/organizations/one");
});

describe("organization workspace", () => {
  it("keeps projects visible during refresh and prevents repeated refresh clicks", async () => {
    serveWorkspace();
    render(<OrganizationDetailPage />);
    expect(await screen.findByText("订单服务")).toBeVisible();
    const organizationRead = deferred<unknown>();
    const projectRead = deferred<unknown>();
    vi.mocked(apiFetch)
      .mockImplementationOnce(() => organizationRead.promise)
      .mockImplementationOnce(() => projectRead.promise);
    const refresh = screen.getByRole("button", { name: "刷新组织项目" });
    fireEvent.click(refresh);
    expect(refresh).toBeDisabled();
    expect(screen.getByText("正在刷新 · 1 个项目")).toBeVisible();
    expect(screen.getByText("订单服务")).toBeVisible();
    fireEvent.click(refresh);
    expect(apiFetch).toHaveBeenCalledTimes(4);
    await act(async () => {
      organizationRead.resolve({ ...org, name: "更新的团队" });
      projectRead.resolve([{ ...project, name: "新版订单服务" }]);
    });
    expect(await screen.findByText("新版订单服务")).toBeVisible();
    expect(screen.getByRole("heading", { name: "更新的团队" })).toBeVisible();
    expect(screen.queryByText("订单服务")).toBeNull();
    expect(refresh).toBeEnabled();
  });

  it("allows team access when the first project-list request fails", async () => {
    vi.mocked(apiFetch).mockImplementation(async (url) => {
      if (url.startsWith("/api/organizations/")) return org;
      throw new Error("列表读取失败");
    });
    render(<OrganizationDetailPage />);
    expect(await screen.findByRole("heading", { name: "核心团队" })).toBeVisible();
    expect(screen.getByText("项目暂时无法显示")).toBeVisible();
    expect(screen.getByText("项目尚未加载")).toBeVisible();
    expect(screen.queryByText("这里还没有项目")).toBeNull();
    fireEvent.mouseDown(screen.getByRole("tab", { name: /成员与设置/ }), { button: 0, ctrlKey: false });
    expect(await screen.findByText("团队版本 1")).toBeVisible();
  });

  it("preserves the last project snapshot on a failed refresh and recovers with an empty list", async () => {
    let issue = false;
    let items = [project];
    vi.mocked(apiFetch).mockImplementation(async (url) => {
      if (url.startsWith("/api/organizations/")) return org;
      if (issue) throw new Error("Offline");
      return items;
    });
    render(<OrganizationDetailPage />);
    await screen.findByText("订单服务");
    issue = true;
    fireEvent.click(screen.getByRole("button", { name: "刷新组织项目" }));
    expect(await screen.findByText("刷新失败 · 显示上次加载的内容")).toBeVisible();
    expect(screen.getByText("订单服务")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("内容可能不是最新");
    issue = false;
    items = [];
    fireEvent.click(screen.getByRole("button", { name: "重新加载" }));
    expect(await screen.findByText("这里还没有项目")).toBeVisible();
    expect(screen.queryByText("订单服务")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it.each([401, 403, 404])("clears cached organization data when access ends with status %s", async (status) => {
    let denied = false;
    vi.mocked(apiFetch).mockImplementation(async (url) => {
      if (url.startsWith("/api/organizations/")) {
        if (denied) throw new ApiError("组织无法访问", status);
        return org;
      }
      return [project];
    });
    render(<OrganizationDetailPage />);
    await screen.findByText("订单服务");
    denied = true;
    fireEvent.click(screen.getByRole("button", { name: "刷新组织项目" }));
    expect(await screen.findByText("暂时无法打开组织")).toBeVisible();
    expect(screen.queryByText("订单服务")).toBeNull();
    expect(screen.queryByRole("tab", { name: /成员与设置/ })).toBeNull();
  });

  it("updates team data even when the accompanying project read fails", async () => {
    let refreshing = false;
    vi.mocked(apiFetch).mockImplementation(async (url) => {
      if (url.startsWith("/api/organizations/")) return { ...org, teamVersion: refreshing ? 2 : 1 };
      if (refreshing) throw new Error("项目列表读取失败");
      return [project];
    });
    render(<OrganizationDetailPage />);
    await screen.findByText("订单服务");
    fireEvent.mouseDown(screen.getByRole("tab", { name: /成员与设置/ }), { button: 0, ctrlKey: false });
    await screen.findByText("团队版本 1");
    refreshing = true;
    fireEvent.click(screen.getByRole("button", { name: "刷新团队信息" }));
    expect(await screen.findByText("团队版本 2")).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent("项目列表读取失败");
  });

  it("aborts both reads on route changes and ignores a late old response", async () => {
    const oldOrganization = deferred<unknown>();
    const oldProjects = deferred<unknown>();
    vi.mocked(apiFetch).mockImplementation((url) => {
      if (url === "/api/organizations/one") return oldOrganization.promise;
      if (url.endsWith("organizationId=one")) return oldProjects.promise;
      return Promise.resolve(url.startsWith("/api/organizations/")
        ? { ...org, id: "two", name: "营销团队" }
        : [{ ...project, id: "marketing", name: "活动服务" }]);
    });
    const view = render(<OrganizationDetailPage />);
    const originalSignals = vi.mocked(apiFetch).mock.calls.slice(0, 2).map((call) => call[1]?.signal);
    navigation.id = "two";
    view.rerender(<OrganizationDetailPage />);
    expect(originalSignals.every((signal) => signal?.aborted)).toBe(true);
    await screen.findByText("活动服务");
    await act(async () => {
      oldOrganization.resolve(org);
      oldProjects.resolve([project]);
    });
    expect(screen.getByRole("heading", { name: "营销团队" })).toBeVisible();
    expect(screen.queryByText("订单服务")).toBeNull();
  });

  it("cancels unfinished reads when the workspace unmounts", () => {
    const pending = deferred<unknown>();
    vi.mocked(apiFetch).mockImplementation(() => pending.promise);
    const view = render(<OrganizationDetailPage />);
    const signals = vi.mocked(apiFetch).mock.calls.map((call) => call[1]?.signal);
    view.unmount();
    expect(signals).toHaveLength(2);
    expect(signals.every((signal) => signal?.aborted)).toBe(true);
  });

  it("keeps a confirmed creation after an older list response and releases refresh controls", async () => {
    serveWorkspace();
    render(<OrganizationDetailPage />);
    await screen.findByText("订单服务");
    const oldOrganization = deferred<unknown>();
    const oldProjects = deferred<unknown>();
    const creation = deferred<unknown>();
    vi.mocked(apiFetch).mockImplementation((url, options) => {
      if (options?.method === "POST") return creation.promise;
      return url.startsWith("/api/organizations/") ? oldOrganization.promise : oldProjects.promise;
    });
    fireEvent.click(screen.getByRole("button", { name: "刷新组织项目" }));
    const readSignals = vi.mocked(apiFetch).mock.calls.slice(2, 4).map((call) => call[1]?.signal);
    fireEvent.change(screen.getByRole("searchbox", { name: "搜索组织内项目" }), { target: { value: "does not exist" } });
    fireEvent.click(screen.getAllByRole("button", { name: "创建项目" })[0]);
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByRole("textbox", { name: /项目名称/ }), { target: { value: " 新项目 " } });
    fireEvent.submit(dialog.querySelector("form")!);
    fireEvent.submit(dialog.querySelector("form")!);
    expect(vi.mocked(apiFetch).mock.calls.filter((call) => call[1]?.method === "POST")).toHaveLength(1);
    expect(within(dialog).getByRole("button", { name: "创建中…" })).toBeDisabled();
    await act(async () => creation.resolve({ id: "new", name: "新项目", description: "", isPublic: false }));
    expect(await screen.findByText("新项目")).toBeVisible();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("searchbox", { name: "搜索组织内项目" })).toHaveValue("");
    expect(screen.getByRole("button", { name: "刷新组织项目" })).toBeEnabled();
    expect(readSignals.every((signal) => signal?.aborted)).toBe(true);
    await act(async () => {
      oldOrganization.resolve(org);
      oldProjects.resolve([project]);
    });
    expect(screen.getByText("新项目")).toBeVisible();
    expect(screen.getByText("已创建「新项目」")).toBeVisible();
    expect(screen.getByText("2 个项目")).toBeVisible();
  });

  it("keeps the creation form and its input when the server rejects creation", async () => {
    serveWorkspace();
    render(<OrganizationDetailPage />);
    await screen.findByText("订单服务");
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error("项目名称已存在"));
    fireEvent.click(screen.getByRole("button", { name: "创建项目" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByRole("textbox", { name: /项目名称/ }), { target: { value: "订单服务" } });
    fireEvent.submit(dialog.querySelector("form")!);
    await waitFor(() => expect(within(dialog).getByRole("alert")).toHaveTextContent("项目名称已存在"));
    expect(within(dialog).getByRole("textbox", { name: /项目名称/ })).toHaveValue("订单服务");
    expect(within(dialog).getByRole("button", { name: "创建项目" })).toBeEnabled();
    expect(screen.queryByText("已创建「订单服务」")).toBeNull();
  });

  it("synchronizes the members tab with the URL hash and preserves the search string", async () => {
    window.history.replaceState(null, "", "/dashboard/organizations/one?source=team#members");
    serveWorkspace();
    render(<OrganizationDetailPage />);
    await screen.findByText("团队版本 1");
    fireEvent.mouseDown(screen.getByRole("tab", { name: /项目/ }), { button: 0, ctrlKey: false });
    expect(window.location.hash).toBe("");
    expect(window.location.search).toBe("?source=team");
    expect(screen.getByText("订单服务")).toBeVisible();
    act(() => {
      window.history.replaceState(null, "", "#members");
      window.dispatchEvent(new Event("hashchange"));
    });
    expect(await screen.findByText("团队版本 1")).toBeVisible();
  });
});
