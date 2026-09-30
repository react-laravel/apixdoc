"use client";
import { useRef, useState } from "react";
import { History, RotateCcw, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { MethodBadge } from "@/components/method-badge";
import { displayRequestUrl } from "@/lib/request/history";
import { REQUEST_METHODS, type RequestHistoryEntry } from "@/lib/request/types";

type Outcome = "success" | "http-error" | "request-error" | "unknown";
const outcomeLabels: Record<Outcome, string> = {
  success: "成功 / 重定向",
  "http-error": "HTTP 错误",
  "request-error": "请求失败 / 取消",
  unknown: "无响应结果",
};
function outcomeOf(entry: RequestHistoryEntry): Outcome {
  if (entry.error) return "request-error";
  if (!entry.response || entry.response.status < 100) return "unknown";
  return entry.response.status >= 400 ? "http-error" : "success";
}
const selectClass =
  "h-9 min-w-0 rounded-md border border-zinc-200 bg-white px-2 text-xs focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-zinc-700 dark:bg-zinc-900";

export function RequestHistory({
  entries,
  onRestore,
  onDelete,
  onClear,
  disabled = false,
}: {
  entries: RequestHistoryEntry[];
  disabled?: boolean;
  onRestore: (entry: RequestHistoryEntry) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState("");
  const [method, setMethod] = useState("");
  const [outcome, setOutcome] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const cancelClear = useRef<HTMLButtonElement>(null);
  const needle = query.trim().toLocaleLowerCase();
  const hasFilters = !!(needle || method || outcome);
  const filtered = entries.filter((entry) => {
    // Search only what the list actually displays, never a hidden credential,
    // request header/body or response payload.
    const text = `${displayRequestUrl(entry.request.url)} ${entry.environment}`;
    return (
      (!method || entry.request.method === method) &&
      (!outcome || outcomeOf(entry) === outcome) &&
      text.toLocaleLowerCase().includes(needle)
    );
  });
  const resetFilters = () => {
    setQuery("");
    setMethod("");
    setOutcome("");
  };
  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 flex-1 text-xs leading-5 text-zinc-500">
          本标签页保留最近 20 次请求，可在刷新后载入。历史不会上传到服务器。
          载入只恢复内容，不会自动发送。
        </p>
        <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              disabled={disabled || !entries.length}
            >
              <Trash2 className="size-3.5" aria-hidden />
              清空历史
            </Button>
          </DialogTrigger>
          <DialogContent
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              cancelClear.current?.focus();
            }}
          >
            <DialogHeader>
              <DialogTitle>清空本接口的请求历史？</DialogTitle>
              <DialogDescription>
                将删除本标签页中当前接口的全部 {entries.length} 条历史，
                包括被筛选隐藏的记录。此操作无法撤销，不会删除接口文档。
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                ref={cancelClear}
                variant="outline"
                onClick={() => setConfirmClear(false)}
              >
                取消
              </Button>
              <Button
                variant="destructive"
                disabled={disabled || !entries.length}
                onClick={() => {
                  onClear();
                  setConfirmClear(false);
                  resetFilters();
                }}
              >
                确认清空
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      {(entries.length > 0 || hasFilters) && (
        <>
          <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
            <div className="relative col-span-2 min-w-0 sm:col-span-1">
              <Search
                className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-zinc-400"
                aria-hidden
              />
              <Input
                ref={searchInput}
                type="search"
                aria-label="搜索请求历史"
                placeholder="搜索地址或环境"
                className="pr-9 pl-9"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape" && query) {
                    event.stopPropagation();
                    setQuery("");
                  }
                }}
              />
              {query && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-0.5 right-0.5 size-8"
                  aria-label="清空历史搜索"
                  onClick={() => {
                    setQuery("");
                    searchInput.current?.focus();
                  }}
                >
                  <X className="size-3.5" aria-hidden />
                </Button>
              )}
            </div>
            <select
              aria-label="筛选请求方法"
              className={selectClass}
              value={method}
              onChange={(event) => setMethod(event.target.value)}
            >
              <option value="">全部方法</option>
              {REQUEST_METHODS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <select
              aria-label="筛选请求结果"
              className={selectClass}
              value={outcome}
              onChange={(event) => setOutcome(event.target.value)}
            >
              <option value="">全部结果</option>
              {Object.entries(outcomeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between gap-2">
            <p role="status" className="text-xs text-zinc-500">
              显示 {filtered.length} / {entries.length} 条历史
            </p>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                清空筛选
              </Button>
            )}
          </div>
        </>
      )}
      {!entries.length ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-zinc-200 py-12 text-sm text-zinc-500 dark:border-zinc-700">
          <History className="size-7 text-zinc-400" aria-hidden />
          <p>发送请求后，结果会出现在这里</p>
        </div>
      ) : !filtered.length ? (
        <div className="rounded-lg border border-dashed border-zinc-200 px-3 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
          <p>没有匹配的请求历史</p>
          <p className="mt-1 text-xs">
            试试其他地址、环境或筛选条件，原始记录仍然保留。
          </p>
        </div>
      ) : (
        <ul
          aria-label="请求历史记录"
          className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-700"
        >
          {filtered.map((entry) => {
            const url = displayRequestUrl(entry.request.url);
            const result = outcomeOf(entry);
            const failed =
              result === "http-error" || result === "request-error";
            return (
              <li key={entry.id} className="min-w-0 space-y-2 p-3">
                <div className="flex min-w-0 items-center gap-2">
                  <MethodBadge
                    method={entry.request.method}
                    className="shrink-0"
                  />
                  <p
                    className="min-w-0 flex-1 truncate font-mono text-xs"
                    title={url}
                  >
                    {url}
                  </p>
                </div>
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 flex-1 space-y-1 text-[11px] text-zinc-500">
                    <p
                      className={`break-words font-medium ${failed ? "text-red-600 dark:text-red-400" : result === "success" ? "text-emerald-700 dark:text-emerald-400" : ""}`}
                    >
                      {entry.error ||
                        (entry.response
                          ? `${entry.response.status} · ${entry.response.duration} ms`
                          : "无响应结果")}
                      {result === "http-error" && " · HTTP 错误"}
                    </p>
                    <p className="flex flex-wrap gap-x-3">
                      <time dateTime={entry.at}>
                        {new Date(entry.at).toLocaleString()}
                      </time>
                      <span className="break-all">{entry.environment}</span>
                      {entry.responseTruncated && (
                        <span className="text-amber-700 dark:text-amber-400">
                          响应仅保留前 64 KB
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={disabled}
                      onClick={() => onRestore(entry)}
                      aria-label={`载入 ${entry.request.method} ${url}`}
                    >
                      <RotateCcw className="size-3.5" aria-hidden />
                      载入
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-zinc-400"
                      disabled={disabled}
                      onClick={() => onDelete(entry.id)}
                      aria-label={`删除历史记录 ${entry.request.method} ${url}`}
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
