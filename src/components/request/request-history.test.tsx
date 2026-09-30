import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RequestHistory } from "./request-history";
import type { RequestHistoryEntry } from "@/lib/request/types";

const entries: RequestHistoryEntry[] = [
  {
    id: "success",
    at: "2026-09-30T08:00:00Z",
    environment: "Staging",
    request: {
      method: "GET",
      url: "https://example.com/orders?q=open",
      headers: {},
      timeoutMs: 15000,
    },
    response: {
      status: 200,
      headers: {},
      body: "sensitive body is not searchable",
      duration: 25,
    },
  },
  {
    id: "http-error",
    at: "2026-09-30T08:01:00Z",
    environment: "Production",
    request: {
      method: "POST",
      url: "https://example.com/orders",
      headers: {},
      timeoutMs: 15000,
    },
    response: { status: 500, headers: {}, body: "failed", duration: 45 },
    responseTruncated: true,
  },
  {
    id: "network-error",
    at: "2026-09-30T08:02:00Z",
    environment: "Staging",
    request: {
      method: "GET",
      url: "https://example.com/health",
      headers: {},
      timeoutMs: 15000,
    },
    error: "请求已取消",
  },
];
function setup(values = entries, disabled = false) {
  const callbacks = { onRestore: vi.fn(), onDelete: vi.fn(), onClear: vi.fn() };
  const view = render(
    <RequestHistory entries={values} disabled={disabled} {...callbacks} />,
  );
  return { ...callbacks, ...view };
}
const rows = () =>
  within(screen.getByRole("list", { name: "请求历史记录" })).getAllByRole(
    "listitem",
  );

describe("request history discovery", () => {
  it("combines address/environment search with method and outcome filters", () => {
    const callbacks = setup();
    expect(screen.getByRole("status")).toHaveTextContent("显示 3 / 3 条历史");
    fireEvent.change(screen.getByRole("searchbox", { name: "搜索请求历史" }), {
      target: { value: "  PRODUCTION  " },
    });
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toHaveTextContent("500 · 45 ms · HTTP 错误");
    expect(rows()[0]).toHaveTextContent("响应仅保留前 64 KB");
    fireEvent.change(screen.getByRole("combobox", { name: "筛选请求方法" }), {
      target: { value: "GET" },
    });
    expect(screen.getByText("没有匹配的请求历史")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("显示 0 / 3 条历史");
    fireEvent.click(screen.getByRole("button", { name: "清空筛选" }));
    fireEvent.change(screen.getByRole("combobox", { name: "筛选请求结果" }), {
      target: { value: "request-error" },
    });
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toHaveTextContent("请求已取消");
    expect(callbacks.onClear).not.toHaveBeenCalled();
    expect(callbacks.onDelete).not.toHaveBeenCalled();
  });

  it("distinguishes successful/redirect, HTTP error, failed, and missing results", () => {
    setup([
      ...entries,
      {
        ...entries[0],
        id: "redirect",
        response: { ...entries[0].response!, status: 302 },
      },
      { ...entries[0], id: "unknown", response: undefined },
    ]);
    const filter = screen.getByRole("combobox", { name: "筛选请求结果" });
    fireEvent.change(filter, { target: { value: "success" } });
    expect(rows()).toHaveLength(2);
    fireEvent.change(filter, { target: { value: "http-error" } });
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toHaveTextContent("HTTP 错误");
    fireEvent.change(filter, { target: { value: "unknown" } });
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toHaveTextContent("无响应结果");
  });

  it("clears only the search with Escape and restores search focus after the clear button", async () => {
    const user = userEvent.setup();
    setup();
    const search = screen.getByRole("searchbox", { name: "搜索请求历史" });
    await user.type(search, "orders");
    await user.keyboard("{Escape}");
    expect(search).toHaveValue("");
    expect(rows()).toHaveLength(3);
    await user.type(search, "health");
    await user.click(screen.getByRole("button", { name: "清空历史搜索" }));
    expect(search).toHaveFocus();
    expect(search).toHaveValue("");
  });

  it("uses redacted display text for URL labels and search while restoring the exact request", () => {
    const entry = {
      ...entries[0],
      request: {
        ...entries[0].request,
        url: "https://private-user:private-pass@example.com/orders?signature=private-token#private-fragment",
        headers: { Authorization: "private-header" },
      },
    };
    const { container, onRestore } = setup([entry]);
    for (const secret of [
      "private-user",
      "private-pass",
      "private-token",
      "private-fragment",
      "private-header",
    ])
      expect(container.innerHTML).not.toContain(secret);
    fireEvent.click(screen.getByRole("button", { name: /^载入 GET/ }));
    expect(onRestore).toHaveBeenCalledExactlyOnceWith(entry);
    fireEvent.change(screen.getByRole("searchbox", { name: "搜索请求历史" }), {
      target: { value: "private-token" },
    });
    expect(screen.getByText("没有匹配的请求历史")).toBeVisible();
    fireEvent.change(screen.getByRole("searchbox", { name: "搜索请求历史" }), {
      target: { value: "sensitive body" },
    });
    expect(screen.getByText("没有匹配的请求历史")).toBeVisible();
  });
});

describe("request history actions", () => {
  it("requires confirmation to clear all records, including those hidden by filters", async () => {
    const user = userEvent.setup();
    const { onClear } = setup();
    fireEvent.change(screen.getByRole("combobox", { name: "筛选请求方法" }), {
      target: { value: "POST" },
    });
    const trigger = screen.getByRole("button", { name: "清空历史" });
    await user.click(trigger);
    expect(onClear).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toHaveTextContent("全部 3 条历史");
    expect(screen.getByRole("button", { name: "取消" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger).toHaveFocus();
    expect(onClear).not.toHaveBeenCalled();
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(onClear).not.toHaveBeenCalled();
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "确认清空" }));
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("combobox", { name: "筛选请求方法" })).toHaveValue(
      "",
    );
  });

  it("deletes only the selected record and blocks mutation/restore actions while busy", () => {
    const { onDelete, onClear, onRestore, rerender } = setup();
    fireEvent.click(
      screen.getByRole("button", {
        name: "删除历史记录 GET https://example.com/health",
      }),
    );
    expect(onDelete).toHaveBeenCalledExactlyOnceWith("network-error");
    rerender(
      <RequestHistory
        entries={entries}
        disabled
        onDelete={onDelete}
        onClear={onClear}
        onRestore={onRestore}
      />,
    );
    for (const button of screen.getAllByRole("button", {
      name: /^(清空历史$|删除历史记录|载入 )/,
    })) {
      expect(button).toBeDisabled();
      fireEvent.click(button);
    }
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onClear).not.toHaveBeenCalled();
    expect(onRestore).not.toHaveBeenCalled();
  });

  it("prevents clearing if the request becomes busy after opening confirmation", async () => {
    const user = userEvent.setup();
    const { onClear, onDelete, onRestore, rerender } = setup();
    await user.click(screen.getByRole("button", { name: "清空历史" }));
    rerender(
      <RequestHistory
        entries={entries}
        disabled
        onClear={onClear}
        onDelete={onDelete}
        onRestore={onRestore}
      />,
    );
    expect(screen.getByRole("button", { name: "确认清空" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(onClear).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the first-request empty state and keeps new history visible", () => {
    const { rerender, onClear, onDelete, onRestore } = setup([]);
    expect(screen.getByText("发送请求后，结果会出现在这里")).toBeVisible();
    expect(screen.getByRole("button", { name: "清空历史" })).toBeDisabled();
    rerender(
      <RequestHistory
        entries={entries}
        onClear={onClear}
        onDelete={onDelete}
        onRestore={onRestore}
      />,
    );
    expect(rows()).toHaveLength(3);
    expect(screen.getByRole("button", { name: "清空历史" })).toBeEnabled();
  });
});
