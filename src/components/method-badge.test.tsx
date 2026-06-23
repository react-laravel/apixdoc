import { describe, it, expect } from "vitest";
import { MethodBadge } from "@/components/method-badge";
import { render, screen } from "@testing-library/react";

describe("MethodBadge", () => {
  it("renders the method text", () => {
    render(<MethodBadge method="GET" />);
    expect(screen.getByText("GET")).toBeDefined();
  });

  it("renders POST method", () => {
    render(<MethodBadge method="POST" />);
    expect(screen.getByText("POST")).toBeDefined();
  });

  it("renders DELETE method", () => {
    render(<MethodBadge method="DELETE" />);
    expect(screen.getByText("DELETE")).toBeDefined();
  });

  it("renders lowercase method as uppercase", () => {
    render(<MethodBadge method="put" />);
    expect(screen.getByText("PUT")).toBeDefined();
  });
});
