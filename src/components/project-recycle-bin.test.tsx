import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api-fetch";
import { ProjectRecycleBin } from "./project-recycle-bin";

vi.mock("@/lib/api-fetch", () => ({ apiFetch: vi.fn() }));

const oldItem = {
  id: "old",
  name: "旧查询接口",
  method: "GET",
  path: "/old",
  version: 2,
  deletedAt: "2026-10-04T08:00:00Z",
  actorName: "Sam",
  action: "deleted",
};
const newItem = { ...oldItem, id: "new", name: "新查询接口", path: "/new" };
const page = (items = [oldItem], next: string | null = null) => ({ items, total: items.length, next });
const setup = () => render(<ProjectRecycleBin projectId="project" beforeRestore={() => true} onRestored={vi.fn()} />);

beforeEach(() => { vi.mocked(apiFetch).mockReset(); });

describe("recycle bin reads", () => {
  it("discards a late pagination response after changing the search", async () => {
    const user = userEvent.setup();
    let finishPage!: (value: ReturnType<typeof page>) => void;
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(page([oldItem], "older-page"))
      .mockImplementationOnce(() => new Promise((resolve) => { finishPage = resolve; }))
      .mockResolvedValueOnce(page([newItem]));
    setup();
    await user.click(screen.getByRole("button", { name: "回收站" }));
    await screen.findByText("旧查询接口");
    await user.click(screen.getByRole("button", { name: "加载更多" }));
    const paginationSignal = vi.mocked(apiFetch).mock.calls[1][1]?.signal;
    fireEvent.change(screen.getByRole("textbox", { name: "搜索已删除接口" }), { target: { value: "new" } });
    await screen.findByText("新查询接口");
    await act(async () => finishPage(page([{ ...oldItem, id: "late", name: "迟到的旧接口" }])));
    expect(screen.queryByText("迟到的旧接口")).toBeNull();
    expect(paginationSignal?.aborted).toBe(true);
    expect(screen.getByText("共 1 个接口")).toBeVisible();
  });

  it("allows closing and cancels a pending list read", async () => {
    const user = userEvent.setup();
    vi.mocked(apiFetch).mockImplementation(() => new Promise(() => {}));
    setup();
    await user.click(screen.getByRole("button", { name: "回收站" }));
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1));
    expect(screen.queryByText("回收站中没有匹配的接口")).toBeNull();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(vi.mocked(apiFetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it("shows a retryable loading failure without claiming the recycle bin is empty", async () => {
    const user = userEvent.setup();
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error("网络暂不可用")).mockResolvedValueOnce(page([newItem]));
    setup();
    await user.click(screen.getByRole("button", { name: "回收站" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("网络暂不可用");
    expect(screen.queryByText("回收站中没有匹配的接口")).toBeNull();
    expect(screen.queryByText("共 0 个接口")).toBeNull();
    await user.click(screen.getByRole("button", { name: "重试" }));
    expect(await screen.findByText("新查询接口")).toBeVisible();
  });

  it("retains confirmed results when a refresh fails", async () => {
    const user = userEvent.setup();
    vi.mocked(apiFetch).mockResolvedValueOnce(page([oldItem])).mockRejectedValueOnce(new Error("刷新失败"));
    setup();
    await user.click(screen.getByRole("button", { name: "回收站" }));
    await screen.findByText("旧查询接口");
    await user.click(screen.getByRole("button", { name: "刷新" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("刷新失败");
    expect(screen.getByText("旧查询接口")).toBeVisible();
    expect(screen.getByText("共 1 个接口")).toBeVisible();
  });
});
