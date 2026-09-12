import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DocumentationView } from "./documentation-view";
import { Markdown } from "./markdown";
import type { Project } from "@/lib/types";
import type { CodeEditorProps } from "@/components/json/code-editor";
vi.mock("@/components/json/code-editor", () => ({
  CodeEditor: ({ value, label, readOnly }: CodeEditorProps) => (
    <textarea aria-label={label} value={value} readOnly={readOnly} />
  ),
}));
const project: Project = {
  id: "p",
  name: "Project",
  description: "Docs",
  baseUrl: "https://example.com",
  isPublic: true,
  folders: [],
  globalHeaders: [],
  globalParams: [],
  environments: [],
  endpoints: [
    {
      id: "a",
      name: "Create",
      method: "POST",
      path: "/users",
      description: "## Hello\n\n**Bold** description",
      folderId: null,
    },
    {
      id: "b",
      name: "Read",
      method: "GET",
      path: "/users/{id}",
      description: "",
      folderId: null,
    },
  ],
};
describe("documentation reading", () => {
  it("provides search and endpoint selection without mutation controls", () => {
    render(<DocumentationView project={project} />);
    expect(
      screen.queryByRole("button", { name: /保存|删除接口|发送请求/ }),
    ).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: "搜索文档接口" }), {
      target: { value: "GET" },
    });
    expect(screen.queryByRole("button", { name: /POST Create/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /GET Read/ }));
    expect(screen.getByRole("heading", { name: "Read" })).toBeInTheDocument();
  });
  it("renders Markdown tables and ignores unsafe HTML and links", () => {
    render(
      <Markdown>
        {
          "| Key | Value |\n| --- | --- |\n| id | 1 |\n\n<script>alert(1)</script>\n[unsafe](javascript:alert(1))"
        }
      </Markdown>,
    );
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
    expect(screen.queryByRole("link", { name: "unsafe" })).toBeNull();
  });
});
