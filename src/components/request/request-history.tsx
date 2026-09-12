"use client";
import { History, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MethodBadge } from "@/components/method-badge";
import { displayRequestUrl } from "@/lib/request/history";
import type { RequestHistoryEntry } from "@/lib/request/types";

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
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-zinc-500">
          本标签页保留最近 20 次请求，可在刷新后载入。历史不会上传到服务器。
        </p>
        <Button
          variant="ghost"
          size="sm"
          disabled={!entries.length}
          onClick={onClear}
        >
          <Trash2 className="size-3.5" />
          清空历史
        </Button>
      </div>
      {!entries.length ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-zinc-200 py-12 text-sm text-zinc-500 dark:border-zinc-700">
          <History className="size-7 text-zinc-400" />
          <p>发送请求后，结果会出现在这里</p>
        </div>
      ) : (
        <div className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-700">
          {entries.map((entry) => (
            <div key={entry.id} className="flex min-w-0 items-start gap-3 p-3">
              <MethodBadge method={entry.request.method} />
              <div className="min-w-0 flex-1">
                <p
                  className="truncate font-mono text-xs"
                  title={displayRequestUrl(entry.request.url)}
                >
                  {displayRequestUrl(entry.request.url)}
                </p>
                <p className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-zinc-500">
                  <span>{new Date(entry.at).toLocaleString()}</span>
                  <span>{entry.environment}</span>
                  <span
                    className={
                      entry.error ? "text-red-600 dark:text-red-400" : ""
                    }
                  >
                    {entry.error ||
                      `${entry.response?.status ?? "—"} · ${entry.response?.duration ?? 0} ms`}
                  </span>
                  {entry.responseTruncated && <span>响应仅保留前 64 KB</span>}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={disabled}
                onClick={() => onRestore(entry)}
                aria-label={`载入 ${entry.request.method} ${displayRequestUrl(entry.request.url)}`}
              >
                <RotateCcw className="size-3.5" />
                <span className="hidden sm:inline">载入</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-zinc-400"
                onClick={() => onDelete(entry.id)}
                aria-label="删除历史记录"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
