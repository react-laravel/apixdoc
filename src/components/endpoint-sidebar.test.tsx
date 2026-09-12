import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EndpointSidebar } from "./endpoint-sidebar";

function setup() {
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
    />,
  );
  const source = screen.getByRole("button", { name: /健康检查/ });
  const target = screen.getByRole("button", {
    name: "用户管理",
  }).parentElement!;
  const dataTransfer = {
    setData: vi.fn(),
    effectAllowed: "move",
    dropEffect: "move",
  };
  return { source, target, dataTransfer, onReorder, onSelectEndpoint, onRenameFolder };
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
});
