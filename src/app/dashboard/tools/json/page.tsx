"use client";

import { useRef, useState } from "react";
import { FileJson, Upload, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JsonWorkbench } from "@/components/json/json-workbench";
import { MAX_STRUCTURED_JSON_SIZE } from "@/lib/json-document";

export default function JsonToolPage() {
  const [value, setValue] = useState("");
  const [filename, setFilename] = useState("document.json");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const revision = useRef(0);

  const importFile = async (file?: File) => {
    if (!file) return;
    if (file.size > MAX_STRUCTURED_JSON_SIZE) {
      setError("请选择不超过 2 MB 的 JSON 文件");
      return;
    }
    if (value && !window.confirm("导入文件会替换当前内容，是否继续？")) return;
    const current = ++revision.current;
    setError(null);
    setLoading(true);
    try {
      const text = await file.text();
      if (current !== revision.current) return;
      setValue(text);
      setFilename(file.name);
    } catch {
      setError("读取文件失败，请重新选择");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="shrink-0 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
            <FileJson className="size-6 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold">JSON 工作台</h1>
            <p className="mt-1 text-sm text-zinc-500">
              粘贴或导入
              JSON，查看结构、格式化并定位错误。内容只在当前浏览器处理。
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            onClick={() => fileInput.current?.click()}
            disabled={loading}
          >
            <Upload className="size-4" />
            {loading ? "读取中…" : "导入文件"}
          </Button>
          <Button
            variant="ghost"
            disabled={!value || loading}
            onClick={() => {
              if (window.confirm("确定清空当前内容吗？")) {
                revision.current++;
                setValue("");
                setFilename("document.json");
                setError(null);
              }
            }}
          >
            <Trash2 className="size-4" />
            清空
          </Button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json,text/plain"
          className="hidden"
          aria-label="导入 JSON 文件"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            void importFile(file);
          }}
        />
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400"
        >
          {error}
        </p>
      )}
      <JsonWorkbench
        label="JSON 内容"
        value={value}
        onChange={(next) => {
          revision.current++;
          setValue(next);
        }}
        filename={filename}
      />
      <p className="text-xs leading-6 text-zinc-500">
        支持大整数与 Unicode 原样保留。编辑区可用 ⌘ / Ctrl + F 查找，⌘ / Ctrl +
        Z 撤销；Tab 键可离开编辑器。
      </p>
    </div>
  );
}
