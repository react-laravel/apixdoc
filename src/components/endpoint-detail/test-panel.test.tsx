import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  it("lets response content switch between raw and formatted JSON while copy and import keep the wire data", async () => {
    const body = '{"id":9223372036854775807,"text":"\\u4f60","nested":{"ok":true}}';
    const result = { status: 200, headers: { "content-type": "text/plain" }, body, duration: 10 };
    const writeText = vi.fn().mockResolvedValue(undefined);
    userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockImplementation(writeText);
    const onImportResponse = vi.fn();
    render(<TestPanel {...props} onSend={vi.fn().mockResolvedValue(result)} onImportResponse={onImportResponse} />);
    fireEvent.click(screen.getByRole("button", { name: "发送请求" }));
    const response = await screen.findByRole("textbox", { name: "响应体" });
    expect(screen.getByRole("button", { name: "JSON 格式化" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "原文" }));
    expect(response).toHaveValue(body);
    fireEvent.click(screen.getByRole("button", { name: "JSON 格式化" }));
    expect((response as HTMLTextAreaElement).value).toContain('\n  "id": 9223372036854775807');
    fireEvent.click(screen.getByRole("button", { name: "复制响应体" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(body));
    fireEvent.click(screen.getByRole("button", { name: "将测试结果添加到响应" }));
    expect(onImportResponse).toHaveBeenCalledWith(result);
  });
  it.each([
    ["text/html", "<html><body>failure</body></html>"],
    ["application/json", '{"broken":}'],
  ])("keeps %s response data readable without offering a destructive JSON conversion", async (contentType, body) => {
    render(<TestPanel {...props} onSend={vi.fn().mockResolvedValue({ status: 400, headers: { "content-type": contentType }, body, duration: 10 })} />);
    fireEvent.click(screen.getByRole("button", { name: "发送请求" }));
    expect(await screen.findByRole("textbox", { name: "响应体" })).toHaveValue(body);
    expect(screen.getByRole("button", { name: "JSON 格式化" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "原文" })).toHaveAttribute("aria-pressed", "true");
  });
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
  it("starts imported requests with their own server and inherited collection authentication", async () => {
    const onSend = vi.fn().mockResolvedValue(success);
    render(
      <TestPanel
        {...props}
        endpointServerUrl="https://{{region}}.example.com/v3"
        endpointVariables='{"region":"eu","token":"sample"}'
        endpointAuth='{"type":"bearer","token":"{{token}}"}'
        environments={[
          {
            name: "Imported",
            baseUrl: "https://other.example.com",
            variables: '{"region":"wrong","token":"wrong"}',
            isDefault: true,
          },
        ]}
        onSend={onSend}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "发送请求" }));
    await waitFor(() =>
      expect(onSend).toHaveBeenCalledWith(
        expect.objectContaining({
          url: "https://eu.example.com/v3/users",
          headers: expect.objectContaining({ authorization: "Bearer sample" }),
        }),
      ),
    );
  });
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

  it("keeps the selected environment and temporary authentication when shared settings refresh", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn().mockResolvedValue(success);
    const environments = [
      { name: "Staging", baseUrl: "https://staging.example.com", variables: "{}", isDefault: true },
      { name: "Production", baseUrl: "https://prod.example.com", variables: "{}" },
    ];
    const view = render(
      <TestPanel {...props} environments={environments} endpointAuth='{"type":"bearer","token":"document-token"}' onSend={onSend} />,
    );
    await user.click(screen.getByRole("combobox", { name: "调试环境" }));
    await user.click(screen.getByRole("option", { name: "Production" }));
    await user.click(screen.getByRole("tab", { name: "认证" }));
    await user.click(screen.getByRole("combobox", { name: "认证方式" }));
    await user.click(screen.getByRole("option", { name: "Bearer Token" }));
    fireEvent.change(screen.getByLabelText("Bearer Token"), { target: { value: "temporary-token" } });

    view.rerender(
      <TestPanel {...props} environments={[{ ...environments[0], variables: '{"region":"eu"}' }, environments[1]]} endpointAuth='{"type":"bearer","token":"updated-document-token"}' onSend={onSend} />,
    );
    expect(screen.getByRole("combobox", { name: "调试环境" })).toHaveTextContent("Production");
    expect(screen.getByLabelText("Bearer Token")).toHaveValue("temporary-token");
    await user.click(screen.getByRole("button", { name: "发送请求" }));
    await waitFor(() => expect(onSend).toHaveBeenCalledWith(expect.objectContaining({
      url: "https://prod.example.com/users",
      headers: expect.objectContaining({ authorization: "Bearer temporary-token" }),
    })));
  });

  it("keeps imported cURL authentication independent from document updates", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn().mockResolvedValue(success);
    const view = render(
      <TestPanel {...props} endpointAuth='{"type":"bearer","token":"document-token"}' onSend={onSend} />,
    );
    await user.click(screen.getByRole("button", { name: "导入 cURL" }));
    fireEvent.change(screen.getByRole("textbox", { name: "cURL 命令" }), {
      target: { value: "curl 'https://custom.example.com/users' -H 'Authorization: Bearer wire-token'" },
    });
    await user.click(screen.getByRole("button", { name: "载入调试器" }));
    view.rerender(
      <TestPanel {...props} endpointAuth='{"type":"bearer","token":"updated-document-token"}' onSend={onSend} />,
    );
    await user.click(screen.getByRole("button", { name: "发送请求" }));
    await waitFor(() => expect(onSend).toHaveBeenCalledWith(expect.objectContaining({
      url: "https://custom.example.com/users",
      headers: expect.objectContaining({ authorization: "Bearer wire-token" }),
    })));
  });

  it("refreshes document authentication while it is still inherited", async () => {
    const onSend = vi.fn().mockResolvedValue(success);
    const view = render(
      <TestPanel {...props} endpointAuth='{"type":"bearer","token":"old-token"}' onSend={onSend} />,
    );
    view.rerender(
      <TestPanel {...props} endpointAuth='{"type":"bearer","token":"new-token"}' onSend={onSend} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "发送请求" }));
    await waitFor(() => expect(onSend).toHaveBeenCalledWith(expect.objectContaining({
      headers: expect.objectContaining({ authorization: "Bearer new-token" }),
    })));
  });

  it("clears temporary authentication when the selected environment is removed", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn().mockResolvedValue(success);
    const staging = { name: "Staging", baseUrl: "https://staging.example.com", variables: "{}", isDefault: true };
    const view = render(
      <TestPanel {...props} environments={[staging, { name: "Production", baseUrl: "https://prod.example.com", variables: "{}" }]} onSend={onSend} />,
    );
    await user.click(screen.getByRole("combobox", { name: "调试环境" }));
    await user.click(screen.getByRole("option", { name: "Production" }));
    await user.click(screen.getByRole("tab", { name: "认证" }));
    await user.click(screen.getByRole("combobox", { name: "认证方式" }));
    await user.click(screen.getByRole("option", { name: "Bearer Token" }));
    fireEvent.change(screen.getByLabelText("Bearer Token"), { target: { value: "production-token" } });
    view.rerender(
      <TestPanel {...props} environments={[staging]} endpointAuth='{"type":"bearer","token":"new-document-token"}' onSend={onSend} />,
    );
    expect(screen.getByRole("combobox", { name: "调试环境" })).toHaveTextContent("Staging");
    expect(screen.getByRole("combobox", { name: "认证方式" })).toHaveTextContent("不自动添加认证");
    expect(screen.getByRole("status")).toHaveTextContent("所选环境已移除");
    await user.click(screen.getByRole("button", { name: "发送请求" }));
    await waitFor(() => expect(onSend).toHaveBeenCalled());
    expect(onSend.mock.calls[0][0].headers.authorization).toBeUndefined();
  });

  it("mounts the actual request editor only while its preview is expanded", async () => {
    const user = userEvent.setup();
    render(<TestPanel {...props} onSend={vi.fn()} />);
    expect(screen.queryByRole("textbox", { name: "实际请求" })).toBeNull();
    await user.click(screen.getByText("查看实际请求"));
    const preview = await screen.findByRole("textbox", { name: "实际请求" });
    expect((preview as HTMLTextAreaElement).value).toContain("https://example.com/v1/users");
    await user.click(screen.getByText("查看实际请求"));
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "实际请求" })).toBeNull());
  });
});

it("does not record the automatic cancellation caused by leaving the debugger", async () => {
  const onSend = vi.fn(
    (options: SendRequestOptions) => new Promise<never>((_, reject) => {
      options.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }),
  );
  const view = render(
    <TestPanel {...props} projectId="leaving-project" endpointId="leaving-endpoint" onSend={onSend} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "发送请求" }));
  await act(async () => view.unmount());
  expect(onSend.mock.calls[0][0].signal?.aborted).toBe(true);
  expect(sessionStorage.getItem("apixdoc.history.v1:user-1:leaving-project:leaving-endpoint")).toBeNull();
});

it("ignores an older controller after returning to the same request scope", async () => {
  const finishes: Array<(response: { status: number; headers: Record<string, string>; body: string; duration: number }) => void> = [];
  const onSend = vi.fn(() => new Promise<{ status: number; headers: Record<string, string>; body: string; duration: number }>((resolve) => finishes.push(resolve)));
  const view = render(
    <TestPanel {...props} projectId="return-project" endpointId="same-endpoint" onSend={onSend} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "发送请求" }));
  view.rerender(<TestPanel {...props} projectId="other-project" endpointId="same-endpoint" onSend={onSend} />);
  view.rerender(<TestPanel {...props} projectId="return-project" endpointId="same-endpoint" onSend={onSend} />);
  fireEvent.click(screen.getByRole("button", { name: "发送请求" }));
  await act(async () => finishes[0]({ status: 200, headers: {}, body: "stale response", duration: 1 }));
  expect(screen.getByRole("button", { name: "取消请求" })).toBeEnabled();
  expect(screen.queryByRole("textbox", { name: "响应体" })).toBeNull();
  expect(sessionStorage.getItem("apixdoc.history.v1:user-1:return-project:same-endpoint")).toBeNull();
  await act(async () => finishes[1]({ status: 200, headers: {}, body: "current response", duration: 2 }));
  expect(screen.getByRole("textbox", { name: "响应体" })).toHaveValue("current response");
  const history = JSON.parse(sessionStorage.getItem("apixdoc.history.v1:user-1:return-project:same-endpoint")!);
  expect(history).toHaveLength(1);
  expect(history[0].response.body).toBe("current response");
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
