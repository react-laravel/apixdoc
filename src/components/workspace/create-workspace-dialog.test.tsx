import { describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { CreateWorkspaceDialog } from "./create-workspace-dialog";
describe("workspace creation feedback", () => {
  it("keeps input and the dialog available after a failed request, then allows retry", async () => {
    const create = vi
        .fn()
        .mockRejectedValueOnce(new Error("网络暂时不可用"))
        .mockResolvedValueOnce(undefined),
      close = vi.fn();
    render(
      <CreateWorkspaceDialog
        kind="组织"
        open
        onOpenChange={close}
        onCreate={create}
      />,
    );
    fireEvent.change(screen.getByLabelText("组织名称", { exact: false }), {
      target: { value: "  Design API  " },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "创建组织" }).closest("form")!,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "网络暂时不可用",
    );
    expect(screen.getByLabelText("组织名称", { exact: false })).toHaveValue(
      "  Design API  ",
    );
    expect(close).not.toHaveBeenCalled();
    fireEvent.submit(
      screen.getByRole("button", { name: "创建组织" }).closest("form")!,
    );
    await waitFor(() => expect(close).toHaveBeenCalledWith(false));
    expect(create).toHaveBeenLastCalledWith({
      name: "Design API",
      description: "",
    });
  });
  it("serializes rapid submissions and prevents dismissing pending work", async () => {
    let finish: () => void = () => {};
    const create = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      ),
      close = vi.fn();
    render(
      <CreateWorkspaceDialog
        kind="项目"
        open
        onOpenChange={close}
        onCreate={create}
      />,
    );
    fireEvent.change(screen.getByLabelText("项目名称", { exact: false }), {
      target: { value: "Project" },
    });
    const form = screen
      .getByRole("button", { name: "创建项目" })
      .closest("form")!;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(create).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "取消" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "关闭" })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(close).not.toHaveBeenCalled();
    await act(async () => finish());
    await waitFor(() => expect(close).toHaveBeenCalledWith(false));
  });
});
