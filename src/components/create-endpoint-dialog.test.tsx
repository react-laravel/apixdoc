import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CreateEndpointDialog } from "@/components/create-endpoint-dialog";

describe("CreateEndpointDialog", () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    folderId: null as string | null,
    onCreate: vi.fn().mockResolvedValue({}),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders dialog when open", () => {
    render(<CreateEndpointDialog {...defaultProps} />);
    expect(screen.getByText("新建接口")).toBeDefined();
    expect(screen.getByPlaceholderText("如：获取用户列表")).toBeDefined();
    expect(screen.getByPlaceholderText("/api/users")).toBeDefined();
  });

  it("does not render when closed", () => {
    render(<CreateEndpointDialog {...defaultProps} open={false} />);
    expect(screen.queryByText("新建接口")).toBeNull();
  });

  it("calls onCreate with form data", async () => {
    const onCreate = vi.fn().mockResolvedValue({});
    render(<CreateEndpointDialog {...defaultProps} onCreate={onCreate} />);

    fireEvent.change(screen.getByPlaceholderText("如：获取用户列表"), {
      target: { value: "Get Users" },
    });
    fireEvent.change(screen.getByPlaceholderText("/api/users"), {
      target: { value: "/api/users" },
    });

    fireEvent.click(screen.getByText("创建"));

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith({
        name: "Get Users",
        method: "GET",
        path: "/api/users",
        description: "",
        folderId: null,
      });
    });
  });

  it("displays error when onCreate returns error", async () => {
    render(
      <CreateEndpointDialog
        {...defaultProps}
        onCreate={vi.fn().mockResolvedValue({ error: "Path required" })}
      />,
    );

    fireEvent.click(screen.getByText("创建"));

    await waitFor(() => {
      expect(screen.getByText("Path required")).toBeDefined();
    });
  });

  it("shows submitting state", async () => {
    let resolveCreate: (v: void) => void;
    const onCreate = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );
    render(<CreateEndpointDialog {...defaultProps} onCreate={onCreate} />);

    fireEvent.click(screen.getByText("创建"));
    expect(screen.getByText("创建中...")).toBeDefined();

    resolveCreate!({});
    await waitFor(() => {
      expect(screen.getByText("创建")).toBeDefined();
    });
  });

  it("clears form on close", async () => {
    const onOpenChange = vi.fn();
    render(<CreateEndpointDialog {...defaultProps} onOpenChange={onOpenChange} />);

    fireEvent.change(screen.getByPlaceholderText("如：获取用户列表"), {
      target: { value: "Test" },
    });

    fireEvent.click(screen.getByText("取消"));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("changes HTTP method via select", () => {
    render(<CreateEndpointDialog {...defaultProps} />);

    const methodSelect = screen.getByRole("combobox");
    fireEvent.click(methodSelect);

    expect(screen.getByText("POST")).toBeDefined();
    expect(screen.getByText("DELETE")).toBeDefined();
  });

  it("passes folderId to onCreate", async () => {
    const onCreate = vi.fn().mockResolvedValue({});
    render(
      <CreateEndpointDialog {...defaultProps} folderId="folder-123" onCreate={onCreate} />,
    );

    fireEvent.change(screen.getByPlaceholderText("如：获取用户列表"), {
      target: { value: "Test" },
    });
    fireEvent.click(screen.getByText("创建"));

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({ folderId: "folder-123" }),
      );
    });
  });

  it("clears error when path is edited", async () => {
    render(
      <CreateEndpointDialog
        {...defaultProps}
        onCreate={vi.fn().mockResolvedValue({ error: "Invalid path" })}
      />,
    );

    fireEvent.click(screen.getByText("创建"));
    await waitFor(() => {
      expect(screen.getByText("Invalid path")).toBeDefined();
    });

    const pathInput = screen.getByPlaceholderText("/api/users");
    fireEvent.change(pathInput, { target: { value: "/api/new" } });
    expect(screen.queryByText("Invalid path")).toBeNull();
  });
});
