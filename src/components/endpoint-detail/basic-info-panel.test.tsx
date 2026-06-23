import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BasicInfoPanel } from "@/components/endpoint-detail/basic-info-panel";

describe("BasicInfoPanel", () => {
  const defaultProps = {
    method: "GET",
    path: "/api/users",
    name: "Get Users",
    description: "Get all users",
    onMethodChange: vi.fn(),
    onPathChange: vi.fn(),
    onNameChange: vi.fn(),
    onDescriptionChange: vi.fn(),
    onSave: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders all fields with initial values", () => {
    render(<BasicInfoPanel {...defaultProps} />);

    // Method is rendered as text in the SelectTrigger button
    expect(screen.getByText("GET")).toBeDefined();
    expect(screen.getByDisplayValue("/api/users")).toBeDefined();
    expect(screen.getByDisplayValue("Get Users")).toBeDefined();
    expect(screen.getByDisplayValue("Get all users")).toBeDefined();
  });

  it("calls onMethodChange when method changes", () => {
    render(<BasicInfoPanel {...defaultProps} />);

    const methodSelect = screen.getByRole("combobox");
    fireEvent.click(methodSelect);
    fireEvent.click(screen.getByText("POST"));

    expect(defaultProps.onMethodChange).toHaveBeenCalledWith("POST");
  });

  it("calls onPathChange when path changes", () => {
    render(<BasicInfoPanel {...defaultProps} />);

    const pathInput = screen.getByDisplayValue("/api/users");
    fireEvent.change(pathInput, { target: { value: "/api/posts" } });

    expect(defaultProps.onPathChange).toHaveBeenCalledWith("/api/posts");
  });

  it("calls onNameChange when name changes", () => {
    render(<BasicInfoPanel {...defaultProps} />);

    const nameInput = screen.getByDisplayValue("Get Users");
    fireEvent.change(nameInput, { target: { value: "Get Posts" } });

    expect(defaultProps.onNameChange).toHaveBeenCalledWith("Get Posts");
  });

  it("calls onDescriptionChange when description changes", () => {
    render(<BasicInfoPanel {...defaultProps} />);

    const descInput = screen.getByDisplayValue("Get all users");
    fireEvent.change(descInput, { target: { value: "New description" } });

    expect(defaultProps.onDescriptionChange).toHaveBeenCalledWith("New description");
  });

  it("calls onSave when save button is clicked", () => {
    render(<BasicInfoPanel {...defaultProps} />);

    fireEvent.click(screen.getByText("保存"));
    expect(defaultProps.onSave).toHaveBeenCalled();
  });

  it("renders HTTP method options in select", () => {
    render(<BasicInfoPanel {...defaultProps} />);

    const methodSelect = screen.getByRole("combobox");
    fireEvent.click(methodSelect);

    // After opening dropdown, both trigger and options contain "GET"
    const allMethodTexts = screen.getAllByText("GET");
    expect(allMethodTexts.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("POST")).toBeDefined();
    expect(screen.getByText("PUT")).toBeDefined();
    expect(screen.getByText("PATCH")).toBeDefined();
    expect(screen.getByText("DELETE")).toBeDefined();
    expect(screen.getByText("HEAD")).toBeDefined();
    expect(screen.getByText("OPTIONS")).toBeDefined();
  });

  it("handles empty name", () => {
    render(<BasicInfoPanel {...defaultProps} name="" />);
    expect(screen.getByDisplayValue("")).toBeDefined();
  });

  it("handles empty description", () => {
    render(<BasicInfoPanel {...defaultProps} description="" />);
    expect(screen.getByDisplayValue("")).toBeDefined();
  });

  it("handles POST method", () => {
    render(<BasicInfoPanel {...defaultProps} method="POST" />);
    expect(screen.getByText("POST")).toBeDefined();
  });

  it("handles DELETE method", () => {
    render(<BasicInfoPanel {...defaultProps} method="DELETE" />);
    expect(screen.getByText("DELETE")).toBeDefined();
  });
});
