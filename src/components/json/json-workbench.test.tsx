import { useState } from "react";
import { describe, expect, it, vi, afterEach } from "vitest";
import {
  fireEvent,
  act,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { JsonWorkbench } from "./json-workbench";
import type { CodeEditorProps } from "./code-editor";

// The browser checks exercise CodeMirror. These tests cover the surrounding document workflow.
vi.mock("./code-editor", () => ({
  CodeEditor: ({ value, onChange, label, readOnly }: CodeEditorProps) => (
    <textarea
      aria-label={label}
      value={value}
      readOnly={readOnly}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}));
afterEach(() => vi.unstubAllGlobals());

function Editor({
  initial = '{"id":9223372036854775807,"user":{"name":"Alice"}}',
}) {
  const [value, setValue] = useState(initial);
  return <JsonWorkbench label="测试 JSON" value={value} onChange={setValue} />;
}

describe("JSON workbench", () => {
  it("does not show an old copy confirmation for a different document", async () => {
    let finish!: () => void;
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn(() => new Promise<void>((resolve) => { finish = resolve; })) } });
    const view = render(<JsonWorkbench label="响应体" value={'{"id":1}'} readOnly />);
    fireEvent.click(screen.getByRole("button", { name: "复制响应体" }));
    view.rerender(<JsonWorkbench label="响应体" value={'{"id":2}'} readOnly />);
    await act(async () => finish());
    expect(screen.queryByText("内容已复制")).toBeNull();
  });
  it("keeps the latest clipboard feedback when pending copies finish out of order", async () => {
    const finish: (() => void)[] = [];
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn(() => new Promise<void>((resolve) => finish.push(resolve))) } });
    render(<Editor initial={'{"name":"Alice"}'} />);
    fireEvent.click(screen.getByRole("button", { name: "复制测试 JSON" }));
    fireEvent.click(screen.getByRole("button", { name: "结构" }));
    fireEvent.click(screen.getByRole("button", { name: "复制 $.name 的路径" }));
    await act(async () => finish[1]());
    expect(screen.getByText("JSON Pointer已复制")).toBeVisible();
    await act(async () => finish[0]());
    expect(screen.getByText("JSON Pointer已复制")).toBeVisible();
    expect(screen.queryByText("内容已复制")).toBeNull();
  });
  it("copies a collapsed container exactly, including precision and string escapes", async () => {
    const raw = '{ "id":9223372036854775807, "text":"\\u4f60" }';
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<Editor initial={`{"nested":${raw}}`} />);
    fireEvent.click(screen.getByRole("button", { name: "结构" }));
    fireEvent.click(screen.getByRole("button", { name: "复制 $.nested 的值" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(raw));
  });
  it("formats and minifies an editable document without losing precision", () => {
    render(<Editor />);
    fireEvent.click(screen.getByRole("button", { name: "美化" }));
    expect(
      (
        screen.getByRole("textbox", {
          name: "测试 JSON",
        }) as HTMLTextAreaElement
      ).value,
    ).toContain('\n  "id": 9223372036854775807');
    fireEvent.click(screen.getByRole("button", { name: "压缩" }));
    expect(screen.getByRole("textbox", { name: "测试 JSON" })).toHaveValue(
      '{"id":9223372036854775807,"user":{"name":"Alice"}}',
    );
  });
  it("leaves an invalid document editable while preventing destructive transforms", () => {
    render(<Editor initial={'{"name":}'} />);
    expect(
      screen.getByRole("button", { name: "定位 JSON 错误" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "美化" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "结构" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "测试 JSON" })).toHaveValue(
      '{"name":}',
    );
  });
  it("shows nested search results and copies an escaped path", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<Editor initial={'{"a/b":{"~field":"needle"}}'} />);
    fireEvent.click(screen.getByRole("button", { name: "结构" }));
    fireEvent.change(
      screen.getByRole("textbox", { name: "搜索 JSON 字段或值" }),
      { target: { value: "needle" } },
    );
    expect(screen.getByText("找到 1 项")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /复制.*的路径/ }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith("/a~1b/~0field"),
    );
    expect(screen.getByText("JSON Pointer已复制")).toBeInTheDocument();
  });
  it("shows a useful error when clipboard access fails", async () => {
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
    });
    render(<Editor />);
    fireEvent.click(screen.getByRole("button", { name: "复制测试 JSON" }));
    await screen.findByText("复制失败，请选择内容后手动复制");
  });
  it("preserves edits when opening and closing the expanded editor", () => {
    render(<Editor />);
    fireEvent.change(screen.getByRole("textbox", { name: "测试 JSON" }), {
      target: { value: '{"draft":true}' },
    });
    fireEvent.click(screen.getByRole("button", { name: "放大编辑器" }));
    expect(
      within(screen.getByRole("dialog")).getByRole("textbox", {
        name: "测试 JSON",
      }),
    ).toHaveValue('{"draft":true}');
    fireEvent.click(screen.getByRole("button", { name: "退出放大" }));
    expect(screen.getByRole("textbox", { name: "测试 JSON" })).toHaveValue(
      '{"draft":true}',
    );
  });
  it("paginates large arrays rather than mounting every item", () => {
    render(
      <Editor
        initial={JSON.stringify(Array.from({ length: 1000 }, (_, i) => i))}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "结构" }));
    expect(screen.getAllByRole("button", { name: /复制.*的值/ })).toHaveLength(
      101,
    );
    fireEvent.click(screen.getByRole("button", { name: /再显示 100 项/ }));
    expect(screen.getAllByRole("button", { name: /复制.*的值/ })).toHaveLength(
      201,
    );
  });
  it("copies exact wire data from a read-only formatted response", async () => {
    const raw = '{"id":9223372036854775807}';
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<JsonWorkbench label="响应体" value={raw} readOnly />);
    fireEvent.click(screen.getByRole("button", { name: "复制响应体" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(raw));
  });
  it("renders HTML as inert text", () => {
    render(
      <JsonWorkbench
        label="响应体"
        value={"<script>alert(1)</script>"}
        language="text"
        readOnly
      />,
    );
    expect(screen.getByRole("textbox", { name: "响应体" })).toHaveValue(
      "<script>alert(1)</script>",
    );
    expect(document.querySelector("script")).toBeNull();
  });
});
