import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api-fetch";
import type { DocumentSnapshot, RevisionSummary } from "@/lib/documents/model";
import { DocumentHistory } from "./document-history";

vi.mock("@/lib/api-fetch", () => ({ apiFetch: vi.fn() }));
vi.mock("./document-conflict", () => ({
  readableField: (path: string) => path,
  RevisionValue: ({ label, value }: { label: string; value: unknown }) => <p>{label}: {String(value)}</p>,
}));

const revision: RevisionSummary = { id: "revision", version: 1, action: "basic", actorName: "Sam", createdAt: "2026-10-04T08:00:00Z" };
const snapshot: DocumentSnapshot = {
  name: "Historical name", method: "GET", path: "/history", description: "",
  folderId: null, folderLabel: [], order: 0, parameters: [], headers: [], requestBody: null, responses: [],
};
const detail = { revision, snapshot, current: { ...snapshot, name: "Current name" }, version: 2, deletedAt: null };
const setup = () => {
  const callbacks = { beforeRestore: vi.fn(() => true), onRestored: vi.fn(), onClose: vi.fn() };
  return { ...callbacks, ...render(<DocumentHistory endpointId="endpoint" {...callbacks} />) };
};

beforeEach(() => { vi.mocked(apiFetch).mockReset(); });

describe("document history reads", () => {
  it("allows closing and aborts a pending history read", async () => {
    const user = userEvent.setup();
    vi.mocked(apiFetch).mockImplementation(() => new Promise(() => {}));
    const { onClose } = setup();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(vi.mocked(apiFetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it("shows retry after a read failure instead of claiming there are no versions", async () => {
    const user = userEvent.setup();
    vi.mocked(apiFetch).mockRejectedValueOnce(new Error("历史读取失败")).mockResolvedValueOnce({ items: [revision], next: null });
    setup();
    expect(await screen.findByRole("alert")).toHaveTextContent("历史读取失败");
    expect(screen.queryByText(/尚无历史记录/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "重试" }));
    expect(await screen.findByRole("button", { name: /v1/ })).toBeVisible();
  });

  it("ignores a late list from a previously opened endpoint", async () => {
    let finishOld!: (value: { items: RevisionSummary[]; next: number | null }) => void;
    vi.mocked(apiFetch)
      .mockImplementationOnce(() => new Promise((resolve) => { finishOld = resolve; }))
      .mockResolvedValueOnce({ items: [{ ...revision, id: "new", version: 8 }], next: null });
    const { rerender, beforeRestore, onRestored, onClose } = setup();
    const oldSignal = vi.mocked(apiFetch).mock.calls[0][1]?.signal;
    rerender(<DocumentHistory endpointId="other-endpoint" beforeRestore={beforeRestore} onRestored={onRestored} onClose={onClose} />);
    await screen.findByRole("button", { name: /v8/ });
    await act(async () => finishOld({ items: [revision], next: null }));
    expect(screen.queryByRole("button", { name: /v1/ })).toBeNull();
    expect(oldSignal?.aborted).toBe(true);
  });

  it("keeps the newest selected revision when an earlier detail arrives late", async () => {
    const user = userEvent.setup();
    let finishOlder!: (value: typeof detail) => void;
    const otherRevision = { ...revision, id: "new-revision", version: 3 };
    vi.mocked(apiFetch)
      .mockResolvedValueOnce({ items: [revision, otherRevision], next: null })
      .mockImplementationOnce(() => new Promise((resolve) => { finishOlder = resolve; }))
      .mockResolvedValueOnce({ ...detail, revision: otherRevision, snapshot: { ...snapshot, path: "/newer" } });
    setup();
    await user.click(await screen.findByRole("button", { name: /v1/ }));
    const olderSignal = vi.mocked(apiFetch).mock.calls[1][1]?.signal;
    await user.click(screen.getByRole("button", { name: /v3/ }));
    expect(await screen.findByRole("textbox", { name: "恢复后的接口路径" })).toHaveValue("/newer");
    await act(async () => finishOlder(detail));
    expect(screen.getByRole("textbox", { name: "恢复后的接口路径" })).toHaveValue("/newer");
    expect(olderSignal?.aborted).toBe(true);
  });

  it("renders a difference's values only when that field is expanded", async () => {
    const user = userEvent.setup();
    vi.mocked(apiFetch).mockResolvedValueOnce({ items: [revision], next: null }).mockResolvedValueOnce(detail);
    setup();
    await user.click(await screen.findByRole("button", { name: /v1/ }));
    await screen.findByRole("textbox", { name: "恢复后的接口路径" });
    expect(screen.queryByText("选中版本: Historical name")).toBeNull();
    await user.click(screen.getByText("/name"));
    expect(await screen.findByText("选中版本: Historical name")).toBeVisible();
    await user.click(screen.getByText("/name"));
    await waitFor(() => expect(screen.queryByText("选中版本: Historical name")).toBeNull());
  });

  it("guards an in-flight restore and sends the reviewed version and edited path", async () => {
    const user = userEvent.setup();
    let finishRestore!: (value: unknown) => void;
    vi.mocked(apiFetch).mockResolvedValueOnce({ items: [revision], next: null }).mockResolvedValueOnce(detail)
      .mockImplementationOnce(() => new Promise((resolve) => { finishRestore = resolve; }));
    const { onClose, onRestored } = setup();
    await user.click(await screen.findByRole("button", { name: /v1/ }));
    fireEvent.change(await screen.findByRole("textbox", { name: "恢复后的接口路径" }), { target: { value: "/restored" } });
    await user.click(screen.getByRole("button", { name: "恢复此版本" }));
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    for (const close of screen.getAllByRole("button", { name: "关闭" })) expect(close).toBeDisabled();
    expect(JSON.parse(vi.mocked(apiFetch).mock.calls[2][1]!.body as string)).toEqual({ revisionId: "revision", version: 2, path: "/restored" });
    const endpoint = { id: "endpoint", ...snapshot, path: "/restored", version: 3 };
    await act(async () => finishRestore(endpoint));
    await waitFor(() => expect(onRestored).toHaveBeenCalledExactlyOnceWith(endpoint));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
