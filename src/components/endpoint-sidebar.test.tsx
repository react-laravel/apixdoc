import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { EndpointSidebar } from "./endpoint-sidebar";

function renderSidebar(overrides: Partial<ComponentProps<typeof EndpointSidebar>> = {}) {
  const onReorder = vi.fn();
  const onSelectEndpoint = vi.fn();
  const onRenameFolder = vi.fn();
  render(
    <EndpointSidebar
      folders={[{ id: "folder", name: "用户管理", parentId: null }]}
      endpoints={[
        {
          id: "endpoint",
          name: "健康检查",
          method: "GET",
          path: "/health",
          folderId: null,
        },
      ]}
      selectedEndpointId={null}
      onSelectEndpoint={onSelectEndpoint}
      onCreateFolder={vi.fn()}
      onCreateEndpoint={vi.fn()}
      onDeleteFolder={vi.fn()}
      onRenameFolder={onRenameFolder}
      onReorder={onReorder}
      {...overrides}
    />,
  );
  return { onReorder, onSelectEndpoint, onRenameFolder };
}

function setup() {
  const callbacks = renderSidebar();
  const source = screen.getByRole("button", { name: /健康检查/ });
  const target = screen.getByRole("button", {
    name: "用户管理",
  }).parentElement!;
  const dataTransfer = {
    setData: vi.fn(),
    effectAllowed: "move",
    dropEffect: "move",
  };
  return { source, target, dataTransfer, ...callbacks };
}

describe("endpoint directory", () => {
  it("keeps the rename input focused after closing the menu", async () => {
    const user = userEvent.setup();
    const { onRenameFolder } = setup();
    await user.click(screen.getByRole("button", { name: "用户管理 的更多操作" }));
    await user.click(screen.getByRole("menuitem", { name: "重命名" }));
    const input = await screen.findByRole("textbox", { name: "文件夹名称" });
    await waitFor(() => expect(input).toHaveFocus());
    await user.clear(input);
    await user.type(input, "用户接口{Enter}");
    expect(onRenameFolder).toHaveBeenCalledExactlyOnceWith("folder", "用户接口");
  });
  it("does not reorder when a drag is cancelled", () => {
    const { source, target, dataTransfer, onReorder } = setup();
    fireEvent.dragStart(source, { dataTransfer });
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.dragEnd(source, { dataTransfer });
    expect(onReorder).not.toHaveBeenCalled();
  });
  it("commits an actual drop exactly once", () => {
    const { source, target, dataTransfer, onReorder } = setup();
    fireEvent.dragStart(source, { dataTransfer });
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });
    fireEvent.dragEnd(source, { dataTransfer });
    expect(onReorder).toHaveBeenCalledExactlyOnceWith(
      [],
      [{ id: "endpoint", order: 0, folderId: "folder" }],
    );
  });
  it("supports searching by path and clearing with Escape", () => {
    setup();
    const search = screen.getByRole("textbox", { name: "搜索接口" });
    fireEvent.change(search, { target: { value: "missing" } });
    expect(screen.getByText("没有匹配的接口")).toBeInTheDocument();
    fireEvent.keyDown(search, { key: "Escape" });
    expect(
      screen.getByRole("button", { name: /健康检查/ }),
    ).toBeInTheDocument();
  });

  it("keeps IME Enter in the folder name input and cancels with Escape", async () => {
    const user = userEvent.setup();
    const { onRenameFolder } = setup();
    await user.click(screen.getByRole("button", { name: "用户管理 的更多操作" }));
    await user.click(screen.getByRole("menuitem", { name: "重命名" }));
    const input = await screen.findByRole("textbox", { name: "文件夹名称" });
    await waitFor(() => expect(input).toHaveFocus());
    fireEvent.change(input, { target: { value: "新名称" } });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(input).toHaveFocus();
    expect(onRenameFolder).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("textbox", { name: "文件夹名称" })).not.toBeInTheDocument();
    expect(onRenameFolder).not.toHaveBeenCalled();
  });

  it("does not save an unchanged folder name", async () => {
    const user = userEvent.setup();
    const { onRenameFolder } = setup();
    await user.click(screen.getByRole("button", { name: "用户管理 的更多操作" }));
    await user.click(screen.getByRole("menuitem", { name: "重命名" }));
    const input = await screen.findByRole("textbox", { name: "文件夹名称" });
    await waitFor(() => expect(input).toHaveFocus());
    await user.type(input, "{Enter}");
    expect(onRenameFolder).not.toHaveBeenCalled();
  });

  it("reveals selected search results inside previously collapsed ancestor folders", async () => {
    const user = userEvent.setup();
    const { onSelectEndpoint } = renderSidebar({
      folders: [
        { id: "parent", name: "用户管理", parentId: null },
        { id: "child", name: "账户", parentId: "parent" },
      ],
      endpoints: [
        { id: "nested", name: "账户列表", method: "GET", path: "/accounts", folderId: "child" },
      ],
    });
    await user.click(screen.getByRole("button", { name: "全部收缩" }));
    expect(screen.queryByRole("button", { name: /账户列表/ })).not.toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "搜索接口" }), "用户管理");
    expect(screen.getByText("用户管理 / 账户")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /账户列表/ }));
    expect(onSelectEndpoint).toHaveBeenCalledExactlyOnceWith("nested");
    await user.click(screen.getByRole("button", { name: "清空搜索" }));
    expect(screen.getByRole("button", { name: /账户列表/ })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "搜索接口" })).toHaveFocus();
  });

  it("selects search results with Enter and focuses them with ArrowDown", () => {
    const { onSelectEndpoint } = setup();
    const input = screen.getByRole("textbox", { name: "搜索接口" });
    fireEvent.change(input, { target: { value: "/health" } });
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(onSelectEndpoint).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSelectEndpoint).toHaveBeenCalledExactlyOnceWith("endpoint");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(screen.getByRole("button", { name: /健康检查/ })).toHaveFocus();
  });

  it("reorders root folders whose parentId is omitted", () => {
    const { onReorder } = renderSidebar({
      folders: [
        { id: "folder", name: "用户管理" },
        { id: "source", name: "认证" },
      ],
    });
    const source = screen.getByRole("button", { name: "认证" }).parentElement!;
    const target = screen.getByRole("button", { name: "用户管理" }).parentElement!;
    const dataTransfer = { setData: vi.fn(), effectAllowed: "move", dropEffect: "move" };
    fireEvent.dragStart(source, { dataTransfer });
    fireEvent(target, Object.assign(new Event("dragover", { bubbles: true, cancelable: true }), {
      dataTransfer,
      clientY: -1,
    }));
    fireEvent.drop(target, { dataTransfer });
    fireEvent.dragEnd(source, { dataTransfer });
    expect(onReorder).toHaveBeenCalledExactlyOnceWith(
      [
        { id: "source", order: 0, parentId: null },
        { id: "folder", order: 1, parentId: null },
      ],
      [],
    );
  });
});
