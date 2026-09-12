import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TestPanel, type SendRequestOptions } from "./test-panel";
import type { CodeEditorProps } from "@/components/json/code-editor";
vi.mock("@/components/json/code-editor", () => ({
  CodeEditor: ({ value, onChange, label, readOnly }: CodeEditorProps) => (
    <textarea
      aria-label={label}
      value={value}
      readOnly={readOnly}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}));
const props = {
  method: "POST",
  path: "/users",
  projectBaseUrl: "https://example.com/v1/",
  globalHeaders: [],
  globalParams: [],
  params: [],
  bodyExample: '{"example":true}',
  onImportResponse: vi.fn(),
};

describe("request debugging", () => {
  it("sends an explicitly empty body instead of the documentation example", async () => {
    const onSend = vi
      .fn()
      .mockResolvedValue({ status: 204, headers: {}, body: "", duration: 10 });
    render(<TestPanel {...props} onSend={onSend} />);
    fireEvent.change(screen.getByRole("textbox", { name: "测试请求体" }), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发送请求" }));
    await waitFor(() =>
      expect(onSend).toHaveBeenCalledWith(
        expect.objectContaining({ body: "" }),
      ),
    );
    await screen.findByText("204");
  });
  it("aborts the pending request and can send again", async () => {
    const onSend = vi.fn(
      (options: SendRequestOptions) =>
        new Promise<never>((_, reject) =>
          options.signal!.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          ),
        ),
    );
    render(<TestPanel {...props} onSend={onSend} />);
    fireEvent.click(screen.getByRole("button", { name: "发送请求" }));
    fireEvent.click(screen.getByRole("button", { name: "取消请求" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "发送请求" })).toBeEnabled(),
    );
    expect(onSend.mock.calls[0][0].signal?.aborted).toBe(true);
    expect(screen.getByText("请求已取消")).toBeInTheDocument();
  });
  it("renders JSON responses without rounding large identifiers", async () => {
    const onSend = vi
      .fn()
      .mockResolvedValue({
        status: 200,
        headers: { "content-type": "application/json" },
        body: '{"id":9223372036854775807}',
        duration: 10,
      });
    render(<TestPanel {...props} onSend={onSend} />);
    fireEvent.click(screen.getByRole("button", { name: "发送请求" }));
    const response = await screen.findByRole("textbox", { name: "响应体" });
    expect((response as HTMLTextAreaElement).value).toContain(
      "9223372036854775807",
    );
    expect(screen.getByText("10 ms")).toBeInTheDocument();
  });
});
