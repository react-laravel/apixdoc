import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ResponsesPanel } from "@/components/endpoint-detail/responses-panel";

const mockResponses = [
  {
    statusCode: 200,
    description: "Success",
    contentType: "application/json",
    example: '{"ok": true}',
  },
  {
    statusCode: 400,
    description: "Bad Request",
    contentType: "application/json",
    example: '{"error": "bad"}',
  },
];

describe("ResponsesPanel", () => {
  const defaultProps = {
    responses: mockResponses,
    onUpdate: vi.fn(),
    onRemove: vi.fn(),
    onAdd: vi.fn(),
    onAddWithStatus: vi.fn(),
    onSave: vi.fn(),
    onImportFromTest: vi.fn(),
    testResponse: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all response cards", () => {
    render(<ResponsesPanel {...defaultProps} />);

    const statusInputs = screen.getAllByRole("spinbutton");
    expect(statusInputs.length).toBe(2);
    expect(statusInputs[0]).toHaveAttribute("value", "200");
    expect(statusInputs[1]).toHaveAttribute("value", "400");
    // Filter textbox role to text inputs only (exclude textareas)
    const allTextBoxes = screen.getAllByRole("textbox");
    const descInputs = allTextBoxes.filter(
      (el) => (el as HTMLInputElement).type === "text",
    );
    expect(descInputs.length).toBeGreaterThanOrEqual(2);
    expect(descInputs[0]).toHaveAttribute("value", "Success");
    expect(descInputs[1]).toHaveAttribute("value", "Bad Request");
  });

  it("renders empty responses list", () => {
    render(<ResponsesPanel {...defaultProps} responses={[]} />);

    expect(screen.queryByDisplayValue("200")).toBeNull();
    expect(screen.getByText("添加响应")).toBeDefined();
  });

  it("calls onAdd when add button clicked", () => {
    render(<ResponsesPanel {...defaultProps} />);

    fireEvent.click(screen.getByText("添加响应"));
    expect(defaultProps.onAdd).toHaveBeenCalled();
  });

  it("calls onSave when save button clicked", () => {
    render(<ResponsesPanel {...defaultProps} />);

    fireEvent.click(screen.getByText("保存"));
    expect(defaultProps.onSave).toHaveBeenCalled();
  });

  it("calls onRemove when delete button clicked", () => {
    render(<ResponsesPanel {...defaultProps} />);

    const deleteButtons = screen.getAllByRole("button", { name: /删除/ });
    fireEvent.click(deleteButtons[0]);

    expect(defaultProps.onRemove).toHaveBeenCalledWith(0);
  });

  it("calls onUpdate when status code changes", () => {
    render(<ResponsesPanel {...defaultProps} />);

    const statusInputs = screen.getAllByRole("spinbutton");
    expect(statusInputs[0]).toHaveAttribute("value", "200");
    fireEvent.change(statusInputs[0], { target: { value: "201" } });

    expect(defaultProps.onUpdate).toHaveBeenCalledWith(
      0,
      "statusCode",
      expect.any(Number),
    );
  });

  it("calls onUpdate when description changes", () => {
    render(<ResponsesPanel {...defaultProps} />);

    // Filter for text inputs (not textareas) to get description fields
    const allTextBoxes = screen.getAllByRole("textbox");
    const descInputs = allTextBoxes.filter(
      (el) => (el as HTMLInputElement).type === "text",
    );
    expect(descInputs[0]).toHaveAttribute("value", "Success");
    fireEvent.change(descInputs[0], { target: { value: "Created" } });

    expect(defaultProps.onUpdate).toHaveBeenCalledWith(0, "description", "Created");
  });

  it("calls onAddWithStatus when quick-add button clicked", () => {
    render(<ResponsesPanel {...defaultProps} />);

    fireEvent.click(screen.getByText("500"));
    expect(defaultProps.onAddWithStatus).toHaveBeenCalledWith(500);
  });

  it("disables quick-add button for existing status code", () => {
    render(<ResponsesPanel {...defaultProps} />);

    const button200 = screen.getByText("200").closest("button");
    expect(button200?.hasAttribute("disabled")).toBe(true);
  });

  it("enables quick-add button for non-existing status code", () => {
    render(<ResponsesPanel {...defaultProps} />);

    const button201 = screen.getByText("201").closest("button");
    expect(button201?.hasAttribute("disabled")).toBe(false);
  });

  it("shows import button when testResponse is provided", () => {
    render(
      <ResponsesPanel
        {...defaultProps}
        testResponse={{ status: 200, headers: {}, body: "test", duration: 100 }}
      />,
    );

    expect(screen.getByText("将测试结果添加到响应")).toBeDefined();
  });

  it("hides import button when testResponse is null", () => {
    render(<ResponsesPanel {...defaultProps} testResponse={null} />);

    expect(screen.queryByText("将测试结果添加到响应")).toBeNull();
  });

  it("calls onImportFromTest when import button clicked", () => {
    const testResponse = {
      status: 200,
      headers: { "content-type": "application/json" },
      body: '{"result": "ok"}',
      duration: 150,
    };
    render(<ResponsesPanel {...defaultProps} testResponse={testResponse} />);

    fireEvent.click(screen.getByText("将测试结果添加到响应"));
    expect(defaultProps.onImportFromTest).toHaveBeenCalledWith(testResponse);
  });

  it("renders quick-add status codes", () => {
    render(<ResponsesPanel {...defaultProps} />);

    const quickCodes = [200, 201, 400, 401, 403, 404, 422, 500];
    for (const code of quickCodes) {
      expect(screen.getByText(String(code))).toBeDefined();
    }
  });

  it("handles single response", () => {
    render(
      <ResponsesPanel
        {...defaultProps}
        responses={[{ statusCode: 404, description: "Not Found", contentType: "application/json", example: "{}" }]}
      />,
    );

    const numberInputs = screen.getAllByRole("spinbutton");
    expect(numberInputs.length).toBe(1);
    expect(numberInputs[0]).toHaveAttribute("value", "404");
    // Description is in an input[type=text] value attribute (not textarea)
    const allTextBoxes = screen.getAllByRole("textbox");
    const descInputs = allTextBoxes.filter(
      (el) => (el as HTMLInputElement).type === "text",
    );
    expect(descInputs.length).toBeGreaterThanOrEqual(1);
    expect(descInputs[0]).toHaveAttribute("value", "Not Found");
  });
});
