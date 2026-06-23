import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RequestBodyPanel } from "@/components/endpoint-detail/request-body-panel";

describe("RequestBodyPanel", () => {
  const defaultProps = {
    contentType: "application/json",
    schema: '{"type": "object"}',
    example: '{"key": "value"}',
    onContentTypeChange: vi.fn(),
    onSchemaChange: vi.fn(),
    onExampleChange: vi.fn(),
    onSave: vi.fn(),
    duplicateFields: [] as string[],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all fields with initial values", () => {
    render(<RequestBodyPanel {...defaultProps} />);

    // Content-Type is rendered as text in the SelectTrigger button
    expect(screen.getByText("application/json")).toBeDefined();
    // Schema and example are in textarea elements
    expect(screen.getByDisplayValue('{"type": "object"}')).toBeDefined();
    expect(screen.getByDisplayValue('{"key": "value"}')).toBeDefined();
  });

  it("calls onContentTypeChange when contentType changes", () => {
    render(<RequestBodyPanel {...defaultProps} />);

    const select = screen.getByRole("combobox");
    fireEvent.click(select);
    fireEvent.click(screen.getByText("text/plain"));

    expect(defaultProps.onContentTypeChange).toHaveBeenCalledWith("text/plain");
  });

  it("calls onSchemaChange when schema changes", () => {
    render(<RequestBodyPanel {...defaultProps} />);

    const schemaInput = screen.getByDisplayValue('{"type": "object"}');
    fireEvent.change(schemaInput, { target: { value: '{"type": "array"}' } });

    expect(defaultProps.onSchemaChange).toHaveBeenCalledWith('{"type": "array"}');
  });

  it("calls onExampleChange when example changes", () => {
    render(<RequestBodyPanel {...defaultProps} />);

    const exampleInput = screen.getByDisplayValue('{"key": "value"}');
    fireEvent.change(exampleInput, { target: { value: '{"key": "new"}' } });

    expect(defaultProps.onExampleChange).toHaveBeenCalledWith('{"key": "new"}');
  });

  it("calls onSave when save button is clicked", () => {
    render(<RequestBodyPanel {...defaultProps} />);

    fireEvent.click(screen.getByText("保存"));
    expect(defaultProps.onSave).toHaveBeenCalled();
  });

  it("shows duplicate warning when duplicateFields is not empty", () => {
    render(<RequestBodyPanel {...defaultProps} duplicateFields={["userId", "name"]} />);

    expect(screen.getByText(/以下字段在请求体和请求参数中同时出现/)).toBeDefined();
    expect(screen.getByText("userId")).toBeDefined();
    expect(screen.getByText("name")).toBeDefined();
  });

  it("does not show duplicate warning when empty", () => {
    render(<RequestBodyPanel {...defaultProps} duplicateFields={[]} />);

    expect(
      screen.queryByText(/以下字段在请求体和请求参数中同时出现/),
    ).toBeNull();
  });

  it("renders all content type options", () => {
    render(<RequestBodyPanel {...defaultProps} />);

    const select = screen.getByRole("combobox");
    fireEvent.click(select);

    // After opening dropdown, both trigger and option contain "application/json"
    const allJson = screen.getAllByText("application/json");
    expect(allJson.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("application/x-www-form-urlencoded")).toBeDefined();
    expect(screen.getByText("multipart/form-data")).toBeDefined();
    expect(screen.getByText("text/plain")).toBeDefined();
  });

  it("handles empty schema and example", () => {
    render(<RequestBodyPanel {...defaultProps} schema="" example="" />);

    const emptyTextareas = screen.getAllByDisplayValue("");
    expect(emptyTextareas.length).toBeGreaterThanOrEqual(2);
  });

  it("handles form-data content type", () => {
    render(<RequestBodyPanel {...defaultProps} contentType="multipart/form-data" />);

    // Content type is displayed as text in the SelectTrigger button
    expect(screen.getByText("multipart/form-data")).toBeDefined();
  });
});
