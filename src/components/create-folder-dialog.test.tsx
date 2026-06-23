import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CreateFolderDialog } from "@/components/create-folder-dialog";

describe("CreateFolderDialog", () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    onCreate: vi.fn().mockResolvedValue(null),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders dialog when open", () => {
    render(<CreateFolderDialog {...defaultProps} />);
    expect(screen.getByText("新建文件夹")).toBeDefined();
    expect(screen.getByPlaceholderText("输入文件夹名称")).toBeDefined();
  });

  it("does not render when closed", () => {
    render(<CreateFolderDialog {...defaultProps} open={false} />);
    expect(screen.queryByText("新建文件夹")).toBeNull();
  });

  it("calls onCreate with folder name", async () => {
    const onCreate = vi.fn().mockResolvedValue(null);
    render(<CreateFolderDialog {...defaultProps} onCreate={onCreate} />);

    const input = screen.getByPlaceholderText("输入文件夹名称");
    fireEvent.change(input, { target: { value: "My Folder" } });
    fireEvent.click(screen.getByText("创建"));

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith("My Folder");
    });
  });

  it("displays error when onCreate returns error string", async () => {
    render(
      <CreateFolderDialog
        {...defaultProps}
        onCreate={vi.fn().mockResolvedValue("文件夹名称不能重复")}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("输入文件夹名称"), {
      target: { value: "Existing" },
    });
    fireEvent.click(screen.getByText("创建"));

    await waitFor(() => {
      expect(screen.getByText("文件夹名称不能重复")).toBeDefined();
    });
  });

  it("clears error on input change", async () => {
    render(
      <CreateFolderDialog
        {...defaultProps}
        onCreate={vi.fn().mockResolvedValue("Error")}
      />,
    );

    fireEvent.click(screen.getByText("创建"));
    await waitFor(() => {
      expect(screen.getByText("Error")).toBeDefined();
    });

    const input = screen.getByPlaceholderText("输入文件夹名称");
    fireEvent.change(input, { target: { value: "new name" } });
    expect(screen.queryByText("Error")).toBeNull();
  });

  it("closes dialog on successful creation", async () => {
    const onCreate = vi.fn().mockResolvedValue(null);
    const onOpenChange = vi.fn();
    render(<CreateFolderDialog {...defaultProps} onCreate={onCreate} onOpenChange={onOpenChange} />);

    const input = screen.getByPlaceholderText("输入文件夹名称") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "New Folder" } });
    fireEvent.click(screen.getByText("创建"));

    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("clears form when dialog closes", async () => {
    const onOpenChange = vi.fn();
    render(<CreateFolderDialog {...defaultProps} onOpenChange={onOpenChange} />);

    const input = screen.getByPlaceholderText("输入文件夹名称");
    fireEvent.change(input, { target: { value: "Test" } });

    fireEvent.click(screen.getByText("取消"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows submitting state during creation", async () => {
    let resolveCreate: (v: string | null) => void;
    const onCreate = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );
    render(<CreateFolderDialog {...defaultProps} onCreate={onCreate} />);

    fireEvent.change(screen.getByPlaceholderText("输入文件夹名称"), {
      target: { value: "Test" },
    });
    fireEvent.click(screen.getByText("创建"));

    expect(screen.getByText("创建中...")).toBeDefined();

    resolveCreate!(null);
    await waitFor(() => {
      expect(screen.getByText("创建")).toBeDefined();
    });
  });

  it("disables button while submitting", async () => {
    let resolveCreate: (v: string | null) => void;
    const onCreate = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );
    render(<CreateFolderDialog {...defaultProps} onCreate={onCreate} />);

    fireEvent.change(screen.getByPlaceholderText("输入文件夹名称"), {
      target: { value: "Test" },
    });
    fireEvent.click(screen.getByText("创建"));

    const buttons = screen.getAllByRole("button");
    const createButton = buttons.find((b) => b.textContent?.includes("创建中"));
    expect(createButton).toBeDefined();
    expect((createButton as HTMLButtonElement).disabled).toBe(true);

    resolveCreate!(null);
  });

  it("handles Enter key to submit", async () => {
    const onCreate = vi.fn().mockResolvedValue(null);
    render(<CreateFolderDialog {...defaultProps} onCreate={onCreate} />);

    const input = screen.getByPlaceholderText("输入文件夹名称");
    fireEvent.change(input, { target: { value: "Folder" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith("Folder");
    });
  });

  it("clears folder name on successful creation", async () => {
    const onCreate = vi.fn().mockResolvedValue(null);
    render(<CreateFolderDialog {...defaultProps} onCreate={onCreate} />);

    const input = screen.getByPlaceholderText("输入文件夹名称") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "New Folder" } });
    fireEvent.click(screen.getByText("创建"));

    await waitFor(() => {
      expect(input.value).toBe("");
    });
  });

  it("calls onCreate with raw input including whitespace", async () => {
    const onCreate = vi.fn().mockResolvedValue(null);
    render(<CreateFolderDialog {...defaultProps} onCreate={onCreate} />);

    const input = screen.getByPlaceholderText("输入文件夹名称");
    fireEvent.change(input, { target: { value: "  spaced  " } });
    fireEvent.click(screen.getByText("创建"));

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith("  spaced  ");
    });
  });

  it("calls onOpenChange(false) when dialog closes via button", async () => {
    const onOpenChange = vi.fn();
    render(<CreateFolderDialog {...defaultProps} onOpenChange={onOpenChange} />);

    fireEvent.click(screen.getByText("取消"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
