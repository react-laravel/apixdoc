import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("searches nested folder paths and supports keyboard selection and clearing", () => {
    render(<DocumentationView project={{
      ...project,
      endpoints: [],
      folders: [{
        id: "parent", name: "用户管理",
        children: [{
          id: "child", name: "账户",
          endpoints: [{ ...project.endpoints[1], folderId: "child" }],
        }],
      }],
    }} />);
    const search = screen.getByRole("textbox", { name: "搜索文档接口" });
    fireEvent.change(search, { target: { value: "用户管理" } });
    expect(screen.getByRole("status")).toHaveTextContent("找到 1 个接口");
    expect(screen.getByText("用户管理 / 账户")).toBeInTheDocument();
    fireEvent.keyDown(search, { key: "ArrowDown" });
    expect(screen.getByRole("button", { name: /GET Read/ })).toHaveFocus();
    fireEvent.keyDown(search, { key: "Enter" });
    expect(screen.getByRole("heading", { name: "Read" })).toHaveFocus();
    fireEvent.change(search, { target: { value: "missing" } });
    expect(screen.getByText("没有匹配的接口")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "清空文档搜索" }));
    expect(search).toHaveValue("");
    expect(search).toHaveFocus();
    expect(screen.getByRole("button", { name: /GET Read/ })).toBeInTheDocument();
  });

  it("returns to the top and focuses the heading when selecting another document", () => {
    render(<DocumentationView project={project} initialEndpoint="a" embedded />);
    const main = screen.getByRole("main", { name: "接口文档内容" });
    main.scrollTop = 500;
    fireEvent.click(screen.getByRole("button", { name: /GET Read/ }));
    expect(main.scrollTop).toBe(0);
    expect(screen.getByRole("heading", { name: "Read" })).toHaveFocus();
    main.scrollTop = 200;
    fireEvent.click(screen.getByRole("button", { name: /GET Read/ }));
    expect(main.scrollTop).toBe(0);
  });

  it("falls back to a remaining endpoint after a project refresh and copies its link", async () => {
    const user = userEvent.setup();
    const clipboard = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    const view = render(<DocumentationView project={project} initialEndpoint="a" />);
    view.rerender(<DocumentationView project={{ ...project, endpoints: [project.endpoints[1]] }} initialEndpoint="a" />);
    expect(screen.getByRole("heading", { name: "Read" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /GET Read/ })).toHaveAttribute("aria-current", "page");
    await user.click(screen.getByRole("button", { name: "复制链接" }));
    expect(clipboard).toHaveBeenCalledExactlyOnceWith(new URL("/docs/p?endpoint=b", window.location.origin).toString());
  });

  it("follows a new linked endpoint when navigation reuses the same reader", () => {
    const view = render(<DocumentationView project={project} initialEndpoint="a" />);
    view.rerender(<DocumentationView project={project} initialEndpoint="b" />);
    expect(screen.getByRole("heading", { name: "Read" })).toBeInTheDocument();
    view.rerender(<DocumentationView project={project} initialEndpoint="a" />);
    expect(screen.getByRole("heading", { name: "Create" })).toBeInTheDocument();
  });

  it("mounts read-only structure editors only while their disclosures are open", async () => {
    const user = userEvent.setup();
    render(<DocumentationView project={{
      ...project,
      endpoints: [{
        ...project.endpoints[0],
        requestBody: {
          contentType: "application/json", example: "", schema: '{"type":"object"}',
        },
        responses: [{
          statusCode: 200, description: "Success", contentType: "application/json",
          example: "", schema: '{"type":"object"}',
        }],
      }],
      documentationSchemas: { User: '{"type":"object"}', Account: '{"type":"object"}' },
    }} />);
    expect(screen.queryByRole("textbox", { name: "请求结构" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "响应结构 200" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "数据模型 User" })).toBeNull();
    await user.click(screen.getByText("查看请求结构"));
    expect(await screen.findByRole("textbox", { name: "请求结构" })).toHaveAttribute("readonly");
    await user.click(screen.getByText("User"));
    expect(await screen.findByRole("textbox", { name: "数据模型 User" })).toHaveAttribute("readonly");
    expect(screen.queryByRole("textbox", { name: "数据模型 Account" })).toBeNull();
    await user.click(screen.getByText("查看请求结构"));
    expect(screen.queryByRole("textbox", { name: "请求结构" })).toBeNull();
  });
});
