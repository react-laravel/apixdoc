"use client";
import { useEffect, useRef, useState } from "react";
import { Upload, Loader2, FileJson, CheckCircle2 } from "lucide-react";
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
import type { Project } from "@/lib/types";
interface Preview {
  name: string;
  format: string;
  version: string;
  total: number;
  imported: number;
  skipped: number;
  removed: number;
  folders: number;
  environments: number;
  warnings: string[];
  conflicts: string[];
  revision: string;
}
export function SpecificationImport({
  project,
  onReload,
  beforeImport,
}: {
  project: Project;
  onReload?: () => Promise<void>;
  beforeImport?: () => boolean;
}) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState("");
  const [filename, setFilename] = useState("");
  const [mode, setMode] = useState<"append" | "replace">("append");
  const [confirmation, setConfirmation] = useState("");
  const [importEnvironments, setImportEnvironments] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const fileReadVersion = useRef(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 7000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const perform = async (action: "preview" | "commit") => {
    if (
      pending.current ||
      (action === "commit" && beforeImport && !beforeImport())
    )
      return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${project.id}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          source,
          mode,
          confirmation,
          importEnvironments,
          revision: preview?.revision,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        if (response.status === 409) setPreview(null);
        throw new Error(result.error || "导入失败");
      }
      if (action === "preview") setPreview(result.data);
      else {
        setNotice(
          `已导入 ${result.data.imported} 个接口${result.data.skipped ? `，跳过 ${result.data.skipped} 个重复接口` : ""}`,
        );
        setSource("");
        setPreview(null);
        setOpen(false);
        await onReload?.();
      }
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "导入失败");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          setOpen(true);
          setError("");
          setNotice("");
        }}
      >
        <Upload className="size-3.5" />
        导入
      </Button>
      {notice && (
        <div
          role="status"
          className="fixed bottom-5 left-4 right-4 z-50 flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-white px-4 py-3 text-sm text-emerald-800 shadow-lg sm:left-auto dark:border-emerald-800 dark:bg-zinc-900 dark:text-emerald-300"
        >
          {notice}
          <button
            type="button"
            onClick={() => setNotice("")}
            aria-label="关闭导入提示"
            className="px-1"
          >
            ×
          </button>
        </div>
      )}
      <Dialog open={open} onOpenChange={(value) => !busy && setOpen(value)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>导入接口规范</DialogTitle>
            <DialogDescription>
              选择 OpenAPI 3.0 / 3.1 或 Postman Collection 2.1，支持
              JSON、YAML。先预览，再保存到项目。
            </DialogDescription>
          </DialogHeader>
          <fieldset disabled={busy} className="min-w-0 space-y-4">
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-5 text-sm dark:border-zinc-700 dark:bg-zinc-900">
              <FileJson className="size-7 text-zinc-400" />
              <span className="max-w-full break-all">
                {filename || "选择规范文件，最大 2 MB"}
              </span>
              <input
                type="file"
                accept=".json,.yaml,.yml,application/json,application/yaml"
                aria-label="选择规范文件"
                className="max-w-full text-xs"
                onChange={async (event) => {
                  const version = ++fileReadVersion.current;
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setPreview(null);
                  setError("");
                  if (file.size > 2 * 1024 * 1024) {
                    setError("规范文件不能超过 2 MB");
                    event.target.value = "";
                    return;
                  }
                  try {
                    const contents = await file.text();
                    if (version !== fileReadVersion.current) return;
                    setSource(contents);
                    setFilename(file.name);
                    setPreview(null);
                  } catch {
                    setError("读取文件失败，请重试");
                  }
                }}
              />
            </label>
            <details open={!filename}>
              <summary className="cursor-pointer text-sm text-zinc-500">
                或粘贴规范内容
              </summary>
              <Textarea
                aria-label="规范内容"
                className="mt-2 min-h-36 font-mono text-xs"
                value={source}
                onChange={(e) => {
                  fileReadVersion.current++;
                  setSource(e.target.value);
                  setFilename("");
                  setPreview(null);
                }}
              />
            </details>
            <div className="grid gap-2 sm:grid-cols-2">
              <label
                className={`cursor-pointer rounded-lg border p-3 text-sm ${mode === "append" ? "border-blue-500 bg-blue-50/40 dark:bg-blue-950/20" : "border-zinc-200 dark:border-zinc-800"}`}
              >
                <input
                  type="radio"
                  name="import-mode"
                  checked={mode === "append"}
                  onChange={() => {
                    setMode("append");
                    setPreview(null);
                  }}
                />{" "}
                <strong>追加接口</strong>
                <span className="mt-1 block text-xs text-zinc-500">
                  保留已有内容，跳过方法与路径重复的接口。
                </span>
              </label>
              {project.permissions?.canManage && (
                <label
                  className={`cursor-pointer rounded-lg border p-3 text-sm ${mode === "replace" ? "border-red-400 bg-red-50/40 dark:bg-red-950/20" : "border-zinc-200 dark:border-zinc-800"}`}
                >
                  <input
                    type="radio"
                    name="import-mode"
                    checked={mode === "replace"}
                    onChange={() => {
                      setMode("replace");
                      setPreview(null);
                    }}
                  />{" "}
                  <strong>替换项目文档</strong>
                  <span className="mt-1 block text-xs text-zinc-500">
                    删除现有接口、目录与导入记录，再导入文件。
                  </span>
                </label>
              )}
            </div>
            {preview && (
              <div className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <CheckCircle2 className="size-4 text-emerald-600" />
                  {preview.name} ·{" "}
                  {preview.format === "openapi" ? "OpenAPI" : "Postman"}{" "}
                  {preview.version}
                </p>
                <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                  <span>
                    将导入 <strong>{preview.imported}</strong> 个接口
                  </span>
                  <span>
                    跳过 <strong>{preview.skipped}</strong> 个重复项
                  </span>
                  {mode === "replace" && (
                    <span className="text-red-600">
                      删除现有 {preview.removed} 个接口
                    </span>
                  )}
                </div>
                {preview.conflicts.length > 0 && (
                  <details>
                    <summary className="cursor-pointer text-xs text-zinc-500">
                      查看重复接口
                    </summary>
                    <ul className="mt-2 max-h-32 overflow-auto font-mono text-xs">
                      {preview.conflicts.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  </details>
                )}
                {preview.warnings.length > 0 && (
                  <ul className="max-h-40 list-disc space-y-1 overflow-auto pl-4 text-xs leading-5 text-amber-700 dark:text-amber-400">
                    {preview.warnings.map((warning, i) => (
                      <li key={i}>{warning}</li>
                    ))}
                  </ul>
                )}
                {preview.environments > 0 && (
                  <label className="flex items-start gap-2 text-xs leading-5">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={importEnvironments}
                      onChange={(e) => setImportEnvironments(e.target.checked)}
                    />
                    同时添加 {preview.environments}{" "}
                    个环境及集合变量。原有环境和全局配置保留。
                  </label>
                )}
                {mode === "replace" && (
                  <div>
                    <label
                      htmlFor="import-confirmation"
                      className="mb-2 block text-xs text-red-600"
                    >
                      输入项目名称「{project.name}」确认替换，删除后不能撤销。
                    </label>
                    <Input
                      id="import-confirmation"
                      value={confirmation}
                      onChange={(e) => setConfirmation(e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                )}
              </div>
            )}
            <p className="text-xs leading-5 text-zinc-500">
              原始文件完整保留，可在导出窗口下载。集合脚本仅保存；外部引用不会自动加载。
            </p>
          </fieldset>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <DialogFooter className="sticky -bottom-6 -mx-6 -mb-6 border-t border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-950">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              取消
            </Button>
            {preview ? (
              <>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => setPreview(null)}
                >
                  返回修改
                </Button>
                <Button
                  disabled={
                    busy ||
                    (mode === "replace" && confirmation !== project.name)
                  }
                  onClick={() => perform("commit")}
                >
                  {busy && <Loader2 className="size-4 animate-spin" />}确认导入
                </Button>
              </>
            ) : (
              <Button
                disabled={busy || !source.trim()}
                onClick={() => perform("preview")}
              >
                {busy && <Loader2 className="size-4 animate-spin" />}预览导入
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
