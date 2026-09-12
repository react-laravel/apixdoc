"use client";

import { useMemo, useState } from "react";
import type { Node } from "jsonc-parser";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  FoldVertical,
  UnfoldVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { jsonPath, jsonPointer } from "@/lib/json-document";

interface Entry {
  node: Node;
  name: string;
  path: (string | number)[];
}
function childrenOf(
  entry: Entry,
  limit = entry.node.children?.length ?? 0,
): Entry[] {
  return (entry.node.children ?? []).slice(0, limit).map((node, index) =>
    entry.node.type === "object"
      ? {
          node: node.children![1],
          name: String(node.children![0].value),
          path: [...entry.path, String(node.children![0].value)],
        }
      : { node, name: String(index), path: [...entry.path, index] },
  );
}
function isContainer(node: Node) {
  return node.type === "object" || node.type === "array";
}

export function JsonTree({
  root,
  source,
  onCopy,
}: {
  root: Node;
  source: string;
  onCopy: (value: string, label: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Map<number, boolean>>(
    () => new Map([[root.offset, true]]),
  );
  const [revision, setRevision] = useState(0);
  const [resultLimit, setResultLimit] = useState(100);
  const normalized = query.trim().toLocaleLowerCase();
  const results = useMemo(() => {
    if (!normalized) return [];
    const found: Entry[] = [];
    const stack: Entry[] = [{ node: root, name: "$", path: [] }];
    while (stack.length) {
      const entry = stack.pop()!;
      if (
        entry.name.toLocaleLowerCase().includes(normalized) ||
        (!isContainer(entry.node) &&
          source
            .slice(entry.node.offset, entry.node.offset + entry.node.length)
            .toLocaleLowerCase()
            .includes(normalized))
      )
        found.push(entry);
      if (isContainer(entry.node)) {
        const children = childrenOf(entry);
        for (let index = children.length - 1; index >= 0; index--)
          stack.push(children[index]);
      }
    }
    return found;
  }, [root, source, normalized]);

  const renderEntry = (entry: Entry, depth = 0) => (
    <TreeEntry
      key={`${revision}:${entry.node.offset}`}
      entry={entry}
      source={source}
      depth={depth}
      open={expanded.get(entry.node.offset) ?? false}
      onCopy={onCopy}
      onToggle={() => {
        setExpanded((current) => {
          const next = new Map(current);
          next.set(entry.node.offset, !current.get(entry.node.offset));
          return next;
        });
      }}
      renderChild={(child) => renderEntry(child, depth + 1)}
    />
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 p-2 dark:border-zinc-800">
        <Input
          aria-label="搜索 JSON 字段或值"
          placeholder="搜索字段或值…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setResultLimit(100);
          }}
          className="h-8 min-w-36 flex-1 text-xs"
        />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={!!normalized}
          onClick={() => {
            const next = new Map<number, boolean>();
            const queue = [
              { entry: { node: root, name: "$", path: [] } as Entry, depth: 0 },
            ];
            for (
              let index = 0;
              index < queue.length && next.size < 50;
              index++
            ) {
              const { entry, depth } = queue[index];
              if (!isContainer(entry.node) || depth >= 5) continue;
              next.set(entry.node.offset, true);
              for (const child of childrenOf(entry, 100))
                queue.push({ entry: child, depth: depth + 1 });
            }
            setExpanded(next);
            setRevision(revision + 1);
          }}
          title="展开前五层，大文档最多展开 50 个分组；数组分批显示"
        >
          <UnfoldVertical className="size-3.5" />
          展开
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={!!normalized}
          onClick={() => {
            setExpanded(new Map());
            setRevision(revision + 1);
          }}
        >
          <FoldVertical className="size-3.5" />
          收起
        </Button>
      </div>
      <div className="max-h-[420px] min-h-48 overflow-auto p-2 font-mono text-xs">
        {normalized ? (
          <>
            <p role="status" className="px-2 py-2 font-sans text-zinc-500">
              找到 {results.length} 项
            </p>
            {results.slice(0, resultLimit).map((entry) => (
              <div
                key={entry.node.offset}
                className="mb-2 rounded-lg border border-zinc-200 p-2 dark:border-zinc-800"
              >
                <div className="mb-1 break-all text-[11px] text-zinc-500">
                  {jsonPath(entry.path)}
                </div>
                {renderEntry(entry)}
              </div>
            ))}
            {results.length > resultLimit && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setResultLimit(resultLimit + 100)}
              >
                再显示 100 项
              </Button>
            )}
          </>
        ) : (
          renderEntry({ node: root, name: "$", path: [] })
        )}
      </div>
    </div>
  );
}

function TreeEntry({
  entry,
  source,
  depth,
  open,
  onToggle,
  onCopy,
  renderChild,
}: {
  entry: Entry;
  source: string;
  depth: number;
  open: boolean;
  onToggle: () => void;
  onCopy: (value: string, label: string) => void;
  renderChild: (entry: Entry) => React.ReactNode;
}) {
  const [limit, setLimit] = useState(100);
  const container = isContainer(entry.node);
  const raw = source.slice(
    entry.node.offset,
    entry.node.offset + entry.node.length,
  );
  const count = entry.node.children?.length ?? 0;
  const preview = container
    ? `${entry.node.type === "array" ? "[" : "{"} ${count} 项 ${entry.node.type === "array" ? "]" : "}"}`
    : raw.length > 160
      ? `${raw.slice(0, 160)}…`
      : raw;
  return (
    <div className="min-w-0">
      <div className="group flex min-w-0 items-start gap-1 rounded py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800">
        {container ? (
          <button
            type="button"
            aria-label={`${open ? "收起" : "展开"} ${jsonPath(entry.path)}`}
            aria-expanded={open}
            className="mt-0.5 rounded"
            onClick={onToggle}
          >
            {open ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
          </button>
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <span className="min-w-0 flex-1 break-all leading-6">
          <span className="text-[var(--json-key)]">{entry.name}</span>
          <span className="px-1 text-zinc-400">:</span>
          <span
            className={
              container
                ? "text-zinc-500"
                : entry.node.type === "string"
                  ? "text-[var(--json-string)]"
                  : entry.node.type === "number"
                    ? "text-[var(--json-number)]"
                    : "text-[var(--json-literal)]"
            }
          >
            {preview}
          </span>
        </span>
        <button
          type="button"
          onClick={() => onCopy(raw, "字段值")}
          aria-label={`复制 ${jsonPath(entry.path)} 的值`}
          title="复制字段值"
          className="shrink-0 rounded p-1.5 text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700"
        >
          <Copy className="size-3" />
        </button>
        <button
          type="button"
          onClick={() => onCopy(jsonPointer(entry.path), "JSON Pointer")}
          aria-label={`复制 ${jsonPath(entry.path)} 的路径`}
          title="复制 JSON Pointer"
          className="shrink-0 rounded px-1 py-1.5 text-[10px] text-zinc-500 hover:bg-zinc-200 dark:hover:bg-zinc-700"
        >
          /
        </button>
      </div>
      {container && open && (
        <div
          className={
            depth < 12
              ? "ml-3 border-l border-zinc-200 pl-2 dark:border-zinc-800"
              : "border-l border-zinc-200 pl-1 dark:border-zinc-800"
          }
        >
          {childrenOf(entry, limit).map(renderChild)}
          {count > limit && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLimit(limit + 100)}
            >
              再显示 {Math.min(100, count - limit)} 项（剩余 {count - limit}{" "}
              项）
            </Button>
          )}
          {!count && (
            <p className="py-1 text-zinc-500">
              {entry.node.type === "array" ? "空数组" : "空对象"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
