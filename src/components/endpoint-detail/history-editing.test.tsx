import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EndpointDetail } from "@/components/endpoint-detail";
import { ApiError } from "@/lib/api-fetch";
import type { EndpointDetailData } from "@/lib/types";
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
const initial: EndpointDetailData = {
  id: "doc",
  version: 1,
  name: "Before",
  method: "POST",
  path: "/users",
  description: "old",
  parameters: [],
  headers: [],
  responses: [],
  requestBody: {
    contentType: "application/json",
    schema: "{}",
    example: '{"id":1}',
    content: "{}",
  },
};
function Harness({ save }: { save: ReturnType<typeof vi.fn> }) {
  const [endpoint, setEndpoint] = useState(initial);
  return (
    <EndpointDetail
      endpoint={endpoint}
      projectBaseUrl=""
      globalHeaders={[]}
      globalParams={[]}
      onSave={async (data, version, section) => {
        const next = await save(data, version, section);
        setEndpoint(next);
        return next;
      }}
    />
  );
}
describe("versioned document editor", () => {
  it("preserves unsaved work in another section with its original base version", async () => {
    const save = vi
      .fn()
      .mockResolvedValueOnce({
        ...initial,
        version: 2,
        name: "Remote name",
        description: "mine",
        saveMerged: true,
      })
      .mockResolvedValueOnce({
        ...initial,
        version: 3,
        name: "Remote name",
        description: "mine",
        requestBody: {
          ...initial.requestBody!,
          example: '{"id":9007199254740993123}',
        },
      });
    render(<Harness save={save} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: "请求体", exact: true }));
    fireEvent.change(screen.getByRole("textbox", { name: "请求体示例" }), {
      target: { value: '{"id":9007199254740993123}' },
    });
    await user.click(
      screen.getByRole("tab", { name: "基本信息", exact: true }),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "描述" }), {
      target: { value: "mine" },
    });
    await user.click(screen.getByRole("button", { name: "保存", exact: true }));
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "名称" })).toHaveValue(
        "Remote name",
      ),
    );
    await user.click(screen.getByRole("tab", { name: "请求体", exact: true }));
    expect(screen.getByRole("textbox", { name: "请求体示例" })).toHaveValue(
      '{"id":9007199254740993123}',
    );
    await user.click(screen.getByRole("button", { name: "保存", exact: true }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1][1]).toBe(1);
    expect(save.mock.calls[1][2]).toBe("body");
  });
  it("requires a field choice and saves against the reviewed current version", async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(
        new ApiError("内容冲突", 409, "DOCUMENT_CONFLICT", {
          section: "basic",
          version: 2,
          baseAvailable: true,
          conflicts: [
            {
              path: "/description",
              base: "old",
              mine: "mine",
              current: "theirs",
            },
          ],
          proposed: {
            name: "Remote name",
            method: "POST",
            path: "/users",
            description: "theirs",
          },
        }),
      )
      .mockResolvedValueOnce({
        ...initial,
        version: 3,
        name: "Remote name",
        description: "mine",
      });
    render(<Harness save={save} />);
    const user = userEvent.setup();
    fireEvent.change(screen.getByRole("textbox", { name: "描述" }), {
      target: { value: "mine" },
    });
    await user.click(screen.getByRole("button", { name: "保存", exact: true }));
    await screen.findByRole("dialog");
    expect(screen.getByRole("button", { name: "合并并保存" })).toBeDisabled();
    await user.click(screen.getByLabelText("保留我的修改"));
    await user.click(screen.getByRole("button", { name: "合并并保存" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1]).toEqual([
      expect.objectContaining({ name: "Remote name", description: "mine" }),
      2,
      "basic",
    ]);
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });
});
