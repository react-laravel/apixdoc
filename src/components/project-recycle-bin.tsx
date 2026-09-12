"use client";
import { useCallback, useEffect, useState } from "react";
import { History, RotateCcw, Trash2 } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { DocumentHistory } from "./document-history";
import { ACTION_LABELS } from "@/lib/documents/model";
import type { Endpoint } from "@/lib/types";
type Recycled = Pick<
  Endpoint,
  "id" | "name" | "method" | "path" | "version"
> & { deletedAt: string; actorName: string; action: string };
export function ProjectRecycleBin({
  projectId,
  beforeRestore,
  onRestored,
}: {
  projectId: string;
  beforeRestore: () => boolean;
  onRestored: (endpoint: Endpoint) => void;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Recycled[]>([]);
  const [total, setTotal] = useState(0);
  const [next, setNext] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Recycled | null>(null);
  const load = useCallback(
    async (cursor?: string, signal?: AbortSignal) => {
      setBusy(true);
      setError("");
      try {
        const query = new URLSearchParams({ q: search });
        if (cursor) query.set("cursor", cursor);
        const data = await apiFetch<{
          items: Recycled[];
          total: number;
          next: string | null;
        }>(`/api/projects/${projectId}/recycle-bin?${query}`, { signal });
        if (signal?.aborted) return;
        setItems((previous) =>
          cursor ? [...previous, ...data.items] : data.items,
        );
        setTotal(data.total);
        setNext(data.next);
      } catch (e) {
        if (!signal?.aborted)
          setError(e instanceof Error ? e.message : "回收站加载失败");
      } finally {
        if (!signal?.aborted) setBusy(false);
      }
    },
    [projectId, search],
  );
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => load(undefined, controller.signal),
      200,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, load]);
  const restored = (endpoint: Endpoint) => {
    onRestored(endpoint);
    setSelected(null);
    setOpen(false);
  };
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Trash2 className="size-3.5" />
        回收站
      </Button>
      <Dialog
        open={open && !selected}
        onOpenChange={(value) => !busy && setOpen(value)}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>接口回收站</DialogTitle>
            <DialogDescription>
              删除和规范替换移出的接口保存在这里。恢复时可以选择历史版本或调整路径。
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label="搜索已删除接口"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索名称或路径"
          />
          <p className="text-xs text-zinc-500">共 {total} 个接口</p>
          <ul className="space-y-2">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-700"
              >
                <div className="min-w-0 flex-1">
                  <p className="break-all text-sm font-medium">
                    {item.name || item.path}
                  </p>
                  <p className="break-all font-mono text-xs text-zinc-500">
                    {item.method} {item.path}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {ACTION_LABELS[item.action] || item.action} ·{" "}
                    {item.actorName} ·{" "}
                    {new Date(item.deletedAt).toLocaleString("zh-CN")}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setSelected(item)}
                >
                  <History className="size-3.5" />
                  查看并恢复
                </Button>
              </li>
            ))}
          </ul>
          {!busy && !items.length && (
            <p className="py-8 text-center text-sm text-zinc-500">
              回收站中没有匹配的接口
            </p>
          )}
          {next && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => load(next)}
            >
              加载更多
            </Button>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => load()}>
              <RotateCcw className="size-3.5" />
              刷新
            </Button>
            <Button disabled={busy} onClick={() => setOpen(false)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {selected && (
        <DocumentHistory
          key={selected.id}
          endpointId={selected.id}
          onClose={() => setSelected(null)}
          beforeRestore={beforeRestore}
          onRestored={restored}
        />
      )}
    </>
  );
}
