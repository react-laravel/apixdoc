"use client";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-fetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ACTION_LABELS,
  type DocumentSnapshot,
  type RevisionSummary,
} from "@/lib/documents/model";
import { differences } from "@/lib/documents/merge";
import { readableField, RevisionValue } from "./document-conflict";
import type { Endpoint } from "@/lib/types";
interface Detail {
  revision: RevisionSummary;
  snapshot: DocumentSnapshot;
  current: DocumentSnapshot;
  version: number;
  deletedAt: string | null;
}
export function DocumentHistory({
  endpointId,
  beforeRestore,
  onRestored,
  onClose,
}: {
  endpointId: string;
  beforeRestore: () => boolean;
  onRestored: (endpoint: Endpoint) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<RevisionSummary[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [path, setPath] = useState("");
  const load = useCallback(
    async (before?: number) => {
      setBusy(true);
      setError("");
      try {
        const data = await apiFetch<{
          items: RevisionSummary[];
          next: number | null;
        }>(
          `/api/endpoints/${endpointId}/history${before ? `?before=${before}` : ""}`,
        );
        setItems((prev) => (before ? [...prev, ...data.items] : data.items));
        setNext(data.next);
      } catch (e) {
        setError(e instanceof Error ? e.message : "历史加载失败");
      } finally {
        setBusy(false);
      }
    },
    [endpointId],
  );
  useEffect(() => {
    load();
  }, [load]);
  const select = async (id: string) => {
    setBusy(true);
    setError("");
    try {
      const data = await apiFetch<Detail>(
        `/api/endpoints/${endpointId}/history/${id}`,
      );
      setDetail(data);
      setPath(data.snapshot.path);
    } catch (e) {
      setError(e instanceof Error ? e.message : "版本加载失败");
    } finally {
      setBusy(false);
    }
  };
  const restore = async () => {
    if (!detail || busy || !beforeRestore()) return;
    setBusy(true);
    setError("");
    try {
      const endpoint = await apiFetch<Endpoint>(
        `/api/endpoints/${endpointId}/restore`,
        {
          method: "POST",
          body: JSON.stringify({
            revisionId: detail.revision.id,
            version: detail.version,
            ...(path !== detail.snapshot.path ? { path } : {}),
          }),
        },
      );
      onRestored(endpoint);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "恢复失败");
    } finally {
      setBusy(false);
    }
  };
  const download = async () => {
    if (!detail || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/endpoints/${endpointId}/history/${detail.revision.id}/export`,
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "导出失败");
      }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `endpoint-v${detail.revision.version}.json`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "导出失败");
    } finally {
      setBusy(false);
    }
  };
  const changes = detail ? differences(detail.current, detail.snapshot) : [];
  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>接口版本历史</DialogTitle>
          <DialogDescription>
            保留最近 50
            个版本。恢复会创建新版本，不会删除已有历史。历史内容仅编辑成员可见。
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-w-0 gap-5 md:grid-cols-[220px_1fr]">
          <div className="space-y-2">
            <div className="max-h-60 space-y-2 overflow-auto md:max-h-[55vh]">
              {items.map((item) => (
                <button
                  key={item.id}
                  disabled={busy}
                  className={`w-full rounded-lg border p-3 text-left text-xs ${detail?.revision.id === item.id ? "border-blue-500 bg-blue-50/40 dark:bg-blue-950/20" : "border-zinc-200 dark:border-zinc-700"}`}
                  onClick={() => select(item.id)}
                >
                  <p className="font-medium">
                    v{item.version} ·{" "}
                    {ACTION_LABELS[item.action] || item.action}
                  </p>
                  <p className="mt-1 text-zinc-500">
                    {item.actorName} ·{" "}
                    {new Date(item.createdAt).toLocaleString("zh-CN")}
                  </p>
                </button>
              ))}
            </div>
            {!busy && !items.length && (
              <p className="text-sm text-zinc-500">
                尚无历史记录。下一次修改时，会先保存当前内容作为基线。
              </p>
            )}
            {next && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => load(next)}
              >
                加载更多
              </Button>
            )}
          </div>
          <div className="min-w-0 space-y-4">
            {detail ? (
              <>
                <div className="text-sm">
                  <strong>
                    当前 v{detail.version} → 历史 v{detail.revision.version}
                  </strong>
                  <p className="mt-1 text-xs text-zinc-500">
                    恢复基本信息、参数、请求头、请求体、响应与目录位置。项目环境与导入原文不受影响。
                  </p>
                </div>
                {changes.length ? (
                  changes.map((field) => (
                    <details
                      key={field.path}
                      className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700"
                    >
                      <summary className="cursor-pointer break-all text-sm">
                        {readableField(field.path)}
                      </summary>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <RevisionValue label="当前内容" value={field.base} />
                        <RevisionValue label="选中版本" value={field.current} />
                      </div>
                    </details>
                  ))
                ) : (
                  <p className="text-sm text-zinc-500">内容与当前版本一致</p>
                )}
                <label className="block space-y-2 text-sm">
                  <span>恢复后的接口路径</span>
                  <Input
                    value={path}
                    onChange={(e) => setPath(e.target.value)}
                    disabled={busy}
                  />
                </label>
                {detail.deletedAt && (
                  <p className="text-xs text-amber-700">
                    接口在回收站中，恢复后会重新出现在文档目录。
                  </p>
                )}
              </>
            ) : (
              <p className="py-8 text-center text-sm text-zinc-500">
                {busy ? "加载中…" : "选择一个版本查看差异"}
              </p>
            )}
          </div>
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            关闭
          </Button>
          {detail && (
            <>
              <Button variant="outline" disabled={busy} onClick={download}>
                导出此版本
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => select(detail.revision.id)}
              >
                重新对比
              </Button>
              <Button
                disabled={
                  busy ||
                  !path.trim() ||
                  (!changes.length &&
                    !detail.deletedAt &&
                    path === detail.current.path)
                }
                onClick={restore}
              >
                {busy ? "处理中…" : "恢复此版本"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
