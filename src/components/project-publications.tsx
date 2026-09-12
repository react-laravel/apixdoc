"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Loader2, Send } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import type { Project } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
interface Release {
  id: string;
  number: number;
  title: string;
  note: string;
  actorName: string;
  createdAt: string;
  revokedAt: string | null;
}
interface Status {
  currentTitle?: string | null;
  version: number;
  fingerprint: string | null;
  projectName: string;
  draftError?: string | null;
  changed: boolean;
  currentId: string | null;
  isPublic: boolean;
  endpoints: number;
  folders: number;
  items: Release[];
  next: number | null;
  events: {
    id: string;
    action: string;
    actorName: string;
    createdAt: string;
  }[];
}
const actionLabels: Record<string, string> = {
  publish: "发布新版本",
  baseline: "保留升级基线",
  activate: "切换当前版本",
  revoke: "撤销版本链接",
  withdraw: "停止所有版本分享",
};
export function ProjectPublications({
  project,
  beforePublish,
  onChanged,
}: {
  project: Project;
  beforePublish: () => boolean;
  onChanged: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState<{
    action: "publish" | "activate" | "revoke" | "withdraw";
    release?: Release;
    version: number;
    fingerprint?: string | null;
  } | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const canManage = !!project.permissions?.canManage;
  const load = useCallback(
    async (before?: number) => {
      setBusy(true);
      setError("");
      try {
        const next = await apiFetch<Status>(
          `/api/projects/${project.id}/publications${before ? `?before=${before}` : ""}`,
        );
        setStatus((previous) =>
          before && previous
            ? { ...next, items: [...previous.items, ...next.items] }
            : next,
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "发布记录加载失败");
      } finally {
        setBusy(false);
      }
    },
    [project.id],
  );
  useEffect(() => {
    if (open) load();
  }, [open, load]);
  const start = (
    action: "publish" | "activate" | "revoke" | "withdraw",
    release?: Release,
  ) => {
    if (!status) return;
    if (action === "publish" && !beforePublish()) return;
    setConfirm({
      action,
      release,
      version: status.version,
      fingerprint: status.fingerprint,
    });
    setConfirmation("");
    setError("");
    setNotice("");
  };
  const submit = async () => {
    if (!confirm || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/api/projects/${project.id}/publications`, {
        method: "POST",
        body: JSON.stringify({
          ...confirm,
          publicationId: confirm.release?.id,
          title,
          note,
          confirmation,
        }),
      });
      setConfirm(null);
      setTitle("");
      setNote("");
      setNotice("发布状态已更新");
      await load();
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "发布操作失败，请重试");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  const copy = async (id?: string) => {
    try {
      const url = new URL(`/docs/${project.id}`, window.location.origin);
      if (id) url.searchParams.set("release", id);
      await navigator.clipboard.writeText(url.toString());
      setNotice(id ? "固定版本链接已复制" : "文档入口已复制");
    } catch {
      setError("复制失败，请使用文档预览中的地址栏");
    }
  };
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Send className="size-3.5" />
        发布
      </Button>
      <Dialog open={open} onOpenChange={(value) => !busy && setOpen(value)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>文档发布</DialogTitle>
            <DialogDescription>
              编辑内容不会自动改变已发布文档。每个发布版本都有固定链接；访问范围以当前项目设置为准。
            </DialogDescription>
          </DialogHeader>
          {status && (
            <>
              <div className="space-y-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-700">
                <p className="text-sm font-medium">
                  {status.currentId
                    ? `当前版本：${status.currentTitle || "已发布"}`
                    : "尚未发布或分享已停止"}
                </p>
                <p className="text-xs text-zinc-500">
                  {status.isPublic
                    ? "发布内容可匿名访问"
                    : "发布内容仅团队成员可访问"}{" "}
                  ·{" "}
                  {status.changed
                    ? "有未发布的文档内容"
                    : "文档内容与当前发布一致"}
                </p>
                <div className="flex flex-wrap gap-2">
                  <a
                    className="text-sm text-blue-600 hover:underline"
                    href={`/docs/${project.id}?preview=1`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    检查内部预览
                  </a>
                  {status.currentId && (
                    <>
                      <a
                        className="text-sm text-blue-600 hover:underline"
                        href={`/docs/${project.id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        查看已发布文档
                      </a>
                      <button
                        type="button"
                        className="text-sm text-blue-600"
                        onClick={() => copy()}
                      >
                        复制文档入口
                      </button>
                    </>
                  )}
                </div>
              </div>
              {status.draftError && (
                <p role="alert" className="text-sm text-amber-700">
                  当前预览不可用：{status.draftError}。仍可管理已有发布版本。
                </p>
              )}
              {canManage && !confirm && (
                <div className="space-y-3 rounded-xl bg-zinc-50 p-4 dark:bg-zinc-900">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="space-y-1 text-sm">
                      <span>新版本名称</span>
                      <Input
                        aria-label="新版本名称"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        maxLength={80}
                        placeholder="例如 v1.0 或 9 月更新"
                      />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span>发布说明（仅团队可见）</span>
                      <Textarea
                        aria-label="发布说明"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        maxLength={2000}
                        rows={2}
                      />
                    </label>
                  </div>
                  <Button
                    disabled={busy || !title.trim() || !!status.draftError}
                    onClick={() => start("publish")}
                  >
                    检查并发布新版本
                  </Button>
                </div>
              )}
              {confirm && (
                <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900 dark:bg-amber-950/20">
                  <h3 className="font-medium">
                    {actionLabels[confirm.action]}
                  </h3>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    {confirm.action === "publish"
                      ? `将发布当前已保存的 ${status.endpoints} 个接口、${status.folders} 个目录。请先检查预览中的描述和示例。`
                      : confirm.action === "activate"
                        ? `文档入口将切换到「${confirm.release?.title}」，工作区草稿保持原样。`
                        : confirm.action === "revoke"
                          ? `「${confirm.release?.title}」的固定链接将失效。若它是当前版本，文档入口也会暂停。`
                          : `所有已发布版本的链接都会失效；以后重新发布也不会恢复这些旧链接。`}
                  </p>
                  {confirm.action === "withdraw" && (
                    <label className="block space-y-1 text-sm">
                      <span>输入项目名称「{status.projectName}」确认</span>
                      <Input
                        aria-label="停止分享确认"
                        value={confirmation}
                        onChange={(e) => setConfirmation(e.target.value)}
                      />
                    </label>
                  )}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => setConfirm(null)}
                    >
                      返回
                    </Button>
                    <Button
                      disabled={
                        busy ||
                        (confirm.action === "withdraw" &&
                          confirmation !== status.projectName)
                      }
                      onClick={submit}
                    >
                      {busy && <Loader2 className="size-4 animate-spin" />}确认
                      {actionLabels[confirm.action]}
                    </Button>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <h3 className="text-sm font-medium">发布记录</h3>
                {status.items.map((item) => (
                  <article
                    key={item.id}
                    className="space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-700"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">
                        #{item.number} {item.title}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {item.revokedAt
                          ? "链接已撤销"
                          : item.id === status.currentId
                            ? "当前发布"
                            : "历史发布"}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500">
                      {item.actorName} ·{" "}
                      {new Date(item.createdAt).toLocaleString("zh-CN")}
                    </p>
                    {item.note && (
                      <p className="whitespace-pre-wrap break-words text-xs text-zinc-500">
                        {item.note}
                      </p>
                    )}
                    <a
                      className="inline-block text-xs text-blue-600 hover:underline"
                      target="_blank"
                      rel="noreferrer"
                      href={`/docs/${project.id}?release=${item.id}&review=1`}
                    >
                      内部查看此版本
                    </a>
                    {!item.revokedAt && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy || !status.currentId}
                          onClick={() => copy(item.id)}
                        >
                          <Copy className="size-3.5" />
                          固定版本链接
                        </Button>
                        {canManage && item.id !== status.currentId && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => start("activate", item)}
                          >
                            设为当前版本
                          </Button>
                        )}
                        {canManage && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => start("revoke", item)}
                          >
                            撤销链接
                          </Button>
                        )}
                      </div>
                    )}
                  </article>
                ))}
                {!status.items.length && (
                  <p className="py-4 text-sm text-zinc-500">尚无发布记录</p>
                )}
                {status.next && (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => load(status.next!)}
                  >
                    加载更多
                  </Button>
                )}
              </div>
              {!!status.events.length && (
                <details>
                  <summary className="cursor-pointer text-sm text-zinc-500">
                    最近发布操作
                  </summary>
                  <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-xs text-zinc-500">
                    {status.events.map((event) => (
                      <li key={event.id}>
                        {new Date(event.createdAt).toLocaleString("zh-CN")} ·{" "}
                        {event.actorName} ·{" "}
                        {actionLabels[event.action] || event.action}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="text-sm text-emerald-700">
              {notice}
            </p>
          )}
          <DialogFooter>
            {status?.currentId && canManage && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => start("withdraw")}
              >
                停止所有版本分享
              </Button>
            )}
            <Button variant="outline" disabled={busy} onClick={() => load()}>
              刷新状态
            </Button>
            <Button disabled={busy} onClick={() => setOpen(false)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
