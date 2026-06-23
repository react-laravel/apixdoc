import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ParamsPanel } from "@/components/endpoint-detail/params-panel";

const mockParams = [
  {
    name: "id",
    type: "string",
    required: true,
    location: "path",
    description: "User ID",
    example: "123",
  },
  {
    name: "page",
    type: "number",
    required: false,
    location: "query",
    description: "Page number",
    example: "1",
  },
];

describe("ParamsPanel", () => {
  const defaultProps = {
    params: mockParams,
    onAdd: vi.fn(),
    onUpdate: vi.fn(),
    onRemove: vi.fn(),
    onSave: vi.fn(),
    duplicateFields: [] as string[],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders params table with data", () => {
    const { container } = render(<ParamsPanel {...defaultProps} />);

    // Verify inputs are rendered with correct values using DOM queries
    const rows = container.querySelectorAll("tbody tr");
    expect(rows.length).toBe(2);

    // First param row: name="id", type="string"
    const firstRowInputs = rows[0].querySelectorAll("input");
    expect(firstRowInputs.length).toBeGreaterThanOrEqual(1);
    expect(firstRowInputs[0]).toHaveAttribute("value", "id");

    // Second param row: name="page", type="number"
    const secondRowInputs = rows[1].querySelectorAll("input");
    expect(secondRowInputs.length).toBeGreaterThanOrEqual(1);
    expect(secondRowInputs[0]).toHaveAttribute("value", "page");

    // Verify table has correct structure (header + 2 data rows)
    expect(container.querySelector("thead")).not.toBeNull();
    expect(container.querySelectorAll("tbody tr").length).toBe(2);
  });

  it("renders empty table when no params", () => {
    render(<ParamsPanel {...defaultProps} params={[]} />);

    expect(screen.queryByText("id")).toBeNull();
    expect(screen.getByText("名称")).toBeDefined();
  });

  it("calls onAdd when add button clicked", () => {
    render(<ParamsPanel {...defaultProps} />);

    fireEvent.click(screen.getByText("添加参数"));
    expect(defaultProps.onAdd).toHaveBeenCalled();
  });

  it("calls onSave when save button clicked", () => {
    render(<ParamsPanel {...defaultProps} />);

    fireEvent.click(screen.getByText("保存"));
    expect(defaultProps.onSave).toHaveBeenCalled();
  });

  it("calls onRemove when delete button clicked", () => {
    render(<ParamsPanel {...defaultProps} />);

    const deleteButtons = screen.getAllByRole("button", { name: /删除/ });
    fireEvent.click(deleteButtons[0]);

    expect(defaultProps.onRemove).toHaveBeenCalledWith(0);
  });

  it("calls onUpdate when param name changes", () => {
    const { container } = render(<ParamsPanel {...defaultProps} />);

    // Scope to the first data row (index 0 in tbody)
    const rows = container.querySelectorAll("tbody tr");
    const firstRowInputs = rows[0].querySelectorAll("input");
    fireEvent.change(firstRowInputs[0], { target: { value: "newId" } });

    expect(defaultProps.onUpdate).toHaveBeenCalledWith(0, "name", "newId");
  });

  it("shows duplicate warning when duplicateFields is not empty", () => {
    render(<ParamsPanel {...defaultProps} duplicateFields={["id"]} />);

    expect(screen.getByText(/以下参数在请求体和请求参数中同时出现/)).toBeDefined();
    expect(screen.getByText("id")).toBeDefined();
  });

  it("does not show duplicate warning when duplicateFields is empty", () => {
    render(<ParamsPanel {...defaultProps} duplicateFields={[]} />);

    expect(screen.queryByText(/以下参数在请求体和请求参数中同时出现/)).toBeNull();
  });

  it("shows multiple duplicate fields", () => {
    render(<ParamsPanel {...defaultProps} duplicateFields={["id", "name"]} />);

    expect(screen.getByText("id")).toBeDefined();
    expect(screen.getByText("name")).toBeDefined();
  });

  it("renders table headers", () => {
    render(<ParamsPanel {...defaultProps} />);

    expect(screen.getByText("名称")).toBeDefined();
    expect(screen.getByText("类型")).toBeDefined();
    expect(screen.getByText("必填")).toBeDefined();
    expect(screen.getByText("位置")).toBeDefined();
    expect(screen.getByText("描述")).toBeDefined();
    expect(screen.getByText("示例")).toBeDefined();
    expect(screen.getByText("操作")).toBeDefined();
  });
});
