"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { requestRow, type RequestRow } from "@/lib/request/types";

export function RequestRows({
  label,
  rows,
  onChange,
  lockedKeys = false,
  disabled = false,
  emptyText = "暂无配置",
}: {
  label: string;
  rows: RequestRow[];
  onChange: (rows: RequestRow[]) => void;
  lockedKeys?: boolean;
  disabled?: boolean;
  emptyText?: string;
}) {
  const columns = lockedKeys
    ? "grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]"
    : "grid-cols-[24px_minmax(0,1fr)_minmax(0,1.4fr)_28px]";
  const update = (id: string, patch: Partial<RequestRow>) =>
    onChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  return (
    <div className="space-y-2" role="group" aria-label={label}>
      {rows.length > 0 && (
        <div
          className={cn(
            "grid items-center gap-2 px-1 text-[11px] text-zinc-500",
            columns,
          )}
        >
          {!lockedKeys && <span />}
          <span>名称</span>
          <span>值</span>
          {!lockedKeys && <span />}
        </div>
      )}
      {rows.map((row, index) => (
        <div key={row.id} className={cn("grid items-start gap-2", columns)}>
          {!lockedKeys && (
            <input
              type="checkbox"
              checked={row.enabled}
              disabled={disabled}
              onChange={(event) =>
                update(row.id, { enabled: event.target.checked })
              }
              aria-label={`启用${label} ${index + 1}`}
              className="mx-auto mt-2.5 size-3.5 accent-blue-600"
            />
          )}
          {lockedKeys ? (
            <code className="truncate px-2 py-2.5 text-xs" title={row.key}>
              {row.key}
            </code>
          ) : (
            <Input
              value={row.key}
              disabled={disabled}
              onChange={(event) => update(row.id, { key: event.target.value })}
              aria-label={`${label}名称 ${index + 1}`}
              placeholder="名称"
              className="min-w-0 font-mono text-xs"
            />
          )}
          <Input
            value={row.value}
            disabled={disabled}
            onChange={(event) =>
              update(row.id, {
                value: event.target.value,
                ...(lockedKeys ? { enabled: true } : {}),
              })
            }
            aria-label={`${label}值 ${index + 1}`}
            placeholder="值或 {{变量}}"
            className="min-w-0 font-mono text-xs"
          />
          {!lockedKeys && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-7 text-zinc-400 hover:text-red-600"
              disabled={disabled}
              onClick={() =>
                onChange(rows.filter((item) => item.id !== row.id))
              }
              aria-label={`删除${label} ${index + 1}`}
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
      ))}
      {!rows.length && (
        <p className="rounded-md border border-dashed border-zinc-200 px-3 py-5 text-center text-xs text-zinc-500 dark:border-zinc-700">
          {emptyText}
        </p>
      )}
      {!lockedKeys && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          className="gap-1 text-zinc-600 dark:text-zinc-400"
          onClick={() => onChange([...rows, requestRow()])}
        >
          <Plus className="size-3.5" />
          添加{label}
        </Button>
      )}
    </div>
  );
}
