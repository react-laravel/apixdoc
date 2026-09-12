import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TestPanel, type SendRequestOptions } from "./test-panel";
import userEvent from "@testing-library/user-event";
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

afterEach(() => sessionStorage.clear());
describe("request debugging", () => {
  it("sends an explicitly empty body instead of the documentation example", async () => {
    const onSend = vi
      .fn()
      .mockResolvedValue({ status: 204, headers: {}, body: "", duration: 10 });
    render(<TestPanel {...props} onSend={onSend} />);
    await userEvent.click(screen.getByRole("tab", { name: "请求内容" }));
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
    const onSend = vi.fn().mockResolvedValue({
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

describe("environment and request workflows", () => {
  const success = {
    status: 200,
    headers: { "content-type": "application/json" },
    body: '{"ok":true}',
    duration: 12,
  };
  it("uses the selected environment and forwards resolved path, query and auth values", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn().mockResolvedValue(success);
    render(
      <TestPanel
        {...props}
        path="/users/{id}?q={{query}}"
        bodyExample='{"message":"{{message}}"}'
        environments={[
          {
            name: "Staging",
            baseUrl: "https://staging.example.com/v2",
            variables: '{"query":"a&b","message":"hello","token":"abc"}',
          },
        ]}
        onSend={onSend}
      />,
    );
    await user.click(screen.getByRole("combobox", { name: "调试环境" }));
    await user.click(screen.getByRole("option", { name: "Staging" }));
    fireEvent.change(screen.getByRole("textbox", { name: "路径参数值 1" }), {
      target: { value: "a/b" },
    });
    await user.click(screen.getByRole("tab", { name: "认证" }));
    await user.click(screen.getByRole("combobox", { name: "认证方式" }));
    await user.click(screen.getByRole("option", { name: "Bearer Token" }));
    fireEvent.change(screen.getByLabelText("Bearer Token"), {
      target: { value: "{{token}}" },
    });
    await user.click(screen.getByRole("button", { name: "发送请求" }));
    await waitFor(() =>
      expect(onSend).toHaveBeenCalledWith(
        expect.objectContaining({
          url: "https://staging.example.com/v2/users/a%2Fb?q=a%26b",
          body: '{"message":"hello"}',
          headers: expect.objectContaining({ authorization: "Bearer abc" }),
        }),
      ),
    );
  });
  it("restores history after remount without automatically sending it", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn().mockResolvedValue(success);
    const first = render(
      <TestPanel
        {...props}
        projectId="history-project"
        endpointId="history-endpoint"
        onSend={onSend}
      />,
    );
    await user.click(screen.getByRole("button", { name: "发送请求" }));
    await screen.findByRole("textbox", { name: "响应体" });
    first.unmount();
    onSend.mockClear();
    render(
      <TestPanel
        {...props}
        projectId="history-project"
        endpointId="history-endpoint"
        onSend={onSend}
      />,
    );
    await user.click(await screen.findByRole("tab", { name: /历史 1/ }));
    await user.click(screen.getByRole("button", { name: /载入 POST/ }));
    expect(screen.getByRole("textbox", { name: "调试请求地址" })).toHaveValue(
      "https://example.com/v1/users",
    );
    expect(onSend).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "发送请求" }));
    await waitFor(() =>
      expect(onSend).toHaveBeenCalledWith(
        expect.objectContaining({
          url: "https://example.com/v1/users",
          body: '{"example":true}',
        }),
      ),
    );
  });
  it("clears automatic authentication when changing environments", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn().mockResolvedValue(success);
    render(
      <TestPanel
        {...props}
        environments={[
          {
            name: "Production",
            baseUrl: "https://prod.example.com",
            variables: "{}",
          },
        ]}
        onSend={onSend}
      />,
    );
    await user.click(screen.getByRole("tab", { name: "认证" }));
    await user.click(screen.getByRole("combobox", { name: "认证方式" }));
    await user.click(screen.getByRole("option", { name: "Bearer Token" }));
    fireEvent.change(screen.getByLabelText("Bearer Token"), {
      target: { value: "private-token" },
    });
    await user.click(screen.getByRole("combobox", { name: "调试环境" }));
    await user.click(screen.getByRole("option", { name: "Production" }));
    await user.click(screen.getByRole("button", { name: "发送请求" }));
    await waitFor(() => expect(onSend).toHaveBeenCalled());
    expect(onSend.mock.calls[0][0].headers.authorization).toBeUndefined();
  });
});

it("discards an in-flight result when the history scope changes", async () => {
  let finish!: (value: {
    status: number;
    headers: Record<string, string>;
    body: string;
    duration: number;
  }) => void;
  const onSend = vi.fn(
    () =>
      new Promise<{
        status: number;
        headers: Record<string, string>;
        body: string;
        duration: number;
      }>((resolve) => {
        finish = resolve;
      }),
  );
  const view = render(
    <TestPanel
      {...props}
      projectId="old-project"
      endpointId="same-endpoint"
      onSend={onSend}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "发送请求" }));
  view.rerender(
    <TestPanel
      {...props}
      projectId="new-project"
      endpointId="same-endpoint"
      onSend={onSend}
    />,
  );
  await import("@testing-library/react").then(({ act }) =>
    act(async () => {
      finish({
        status: 200,
        headers: {},
        body: "old-private-response",
        duration: 1,
      });
    }),
  );
  expect(screen.queryByDisplayValue("old-private-response")).toBeNull();
  expect(
    sessionStorage.getItem(
      "apixdoc.history.v1:user-1:new-project:same-endpoint",
    ),
  ).toBeNull();
  expect(screen.getByRole("button", { name: "发送请求" })).toBeEnabled();
});

it("uses updated shared configuration without replacing a custom query value", async () => {
  const onSend = vi
    .fn()
    .mockResolvedValue({ status: 200, headers: {}, body: "ok", duration: 1 });
  const globals = [
    { key: "X-Mode", value: "old", description: "", enabled: true },
  ];
  const params = [
    {
      name: "page",
      value: "1",
      location: "query",
      description: "",
      enabled: true,
    },
  ];
  const view = render(
    <TestPanel
      {...props}
      globalHeaders={globals}
      globalParams={params}
      onSend={onSend}
    />,
  );
  fireEvent.change(screen.getByRole("textbox", { name: "查询参数值 1" }), {
    target: { value: "custom" },
  });
  view.rerender(
    <TestPanel
      {...props}
      globalHeaders={[{ ...globals[0], value: "new" }]}
      globalParams={[{ ...params[0], value: "2" }]}
      onSend={onSend}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "发送请求" }));
  await waitFor(() =>
    expect(onSend).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://example.com/v1/users?page=custom",
        headers: expect.objectContaining({ "x-mode": "new" }),
      }),
    ),
  );
});
