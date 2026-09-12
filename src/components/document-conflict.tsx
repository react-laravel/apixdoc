"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { inspectJson } from "@/lib/json-document";
import { JsonWorkbench } from "@/components/json/json-workbench";
import { chooseConflict, type FieldConflict } from "@/lib/documents/merge";
import { finishBodyMerge } from "@/lib/documents/body-merge";
import { SECTION_LABELS, type DocumentSection } from "@/lib/documents/model";
export interface DocumentConflict {
  section: DocumentSection;
  version: number;
  baseAvailable: boolean;
  bodyExpanded?: boolean;
  conflicts: FieldConflict[];
  proposed: Record<string, unknown>;
}
const fieldLabels: Record<string, string> = {
  name: "名称",
  method: "请求方法",
  path: "路径",
  description: "描述",
  parameters: "参数列表",
  headers: "请求头列表",
  responses: "响应列表",
  schema: "结构",
  example: "示例",
  content: "媒体格式",
  contentType: "内容格式",
  requestBody: "请求体",
  folderId: "目录",
  folderLabel: "目录路径",
  order: "排序",
};
export const readableField = (pointer: string) =>
  pointer
    ? pointer
        .slice(1)
        .split("/")
        .map((p) => {
          const key = p.replace(/~1/g, "/").replace(/~0/g, "~");
          return fieldLabels[key] || key;
        })
        .join(" · ")
    : "全部内容";
export function RevisionValue({
  label,
  value,
}: {
  label: string;
  value: unknown;
}) {
  const [expanded, setExpanded] = useState(false);
  const text =
    value === undefined
      ? "（未设置）"
      : typeof value === "string"
        ? value
        : JSON.stringify(value, null, 2);
  return (
    <div className="min-w-0">
      <p className="mb-1 text-xs font-medium text-zinc-500">{label}</p>
      <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-all rounded-md bg-zinc-100 p-3 font-mono text-xs leading-5 dark:bg-zinc-900">
        {text.slice(0, 4000)}
        {text.length > 4000 ? "\n…展开查看完整内容" : ""}
      </pre>
      <details
        className="mt-2"
        onToggle={(event) => setExpanded(event.currentTarget.open)}
      >
        <summary className="cursor-pointer text-xs text-zinc-500">
          查看完整内容
        </summary>
        {expanded && (
          <JsonWorkbench
            label={label}
            value={text}
            readOnly
            language={inspectJson(text).root ? "json" : "text"}
          />
        )}
      </details>
    </div>
  );
}
export function DocumentConflictDialog({
  conflict,
  saving,
  onClose,
  onResolve,
}: {
  conflict: DocumentConflict;
  saving: boolean;
  onClose: () => void;
  onResolve: (value: Record<string, unknown>, version: number) => void;
}) {
  const [choices, setChoices] = useState<Record<number, "mine" | "current">>(
    {},
  );
  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{SECTION_LABELS[conflict.section]}有冲突</DialogTitle>
          <DialogDescription>
            {conflict.baseAvailable
              ? "其他人的修改已更新到版本 " +
                conflict.version +
                "。不冲突的字段会合并，请为以下冲突选择要保留的内容。"
              : "原始版本已超过保留范围，请对比并确认要保存的内容。你的草稿仍在。"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          {conflict.conflicts.map((field, index) => (
            <section
              key={field.path}
              className="space-y-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-700"
            >
              <h3 className="text-sm font-medium">
                {readableField(field.path)}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <RevisionValue label="你的修改" value={field.mine} />
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={`resolve-${index}`}
                      checked={choices[index] === "mine"}
                      disabled={saving}
                      onChange={() =>
                        setChoices((c) => ({ ...c, [index]: "mine" }))
                      }
                    />
                    保留我的修改
                  </label>
                </div>
                <div className="space-y-2">
                  <RevisionValue label="当前最新内容" value={field.current} />
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={`resolve-${index}`}
                      checked={choices[index] === "current"}
                      disabled={saving}
                      onChange={() =>
                        setChoices((c) => ({ ...c, [index]: "current" }))
                      }
                    />
                    采用最新内容
                  </label>
                </div>
              </div>
              {conflict.baseAvailable && (
                <details>
                  <summary className="cursor-pointer text-xs text-zinc-500">
                    查看编辑前的内容
                  </summary>
                  <RevisionValue label="编辑前" value={field.base} />
                </details>
              )}
            </section>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={onClose}>
            返回继续编辑
          </Button>
          <Button
            disabled={
              saving || conflict.conflicts.some((_, index) => !choices[index])
            }
            onClick={() => {
              let value: unknown = conflict.proposed;
              conflict.conflicts.forEach((field, index) => {
                value = chooseConflict(
                  value,
                  field.path,
                  field[choices[index]],
                );
              });
              onResolve(
                finishBodyMerge(
                  value as Record<string, unknown>,
                  !!conflict.bodyExpanded,
                ),
                conflict.version,
              );
            }}
          >
            {saving ? "保存中…" : "合并并保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
