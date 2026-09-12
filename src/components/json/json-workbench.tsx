"use client";

import { useId, useMemo, useState } from "react";
import {
  Check,
  Copy,
  Download,
  Expand,
  Minimize2,
  WandSparkles,
  WrapText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { CodeEditor } from "@/components/json/code-editor";
import { JsonTree } from "@/components/json/json-tree";
import {
  formatBytes,
  formatJson,
  inspectJson,
  inspectJsonTemplate,
  transformJsonTemplate,
  minifyJson,
} from "@/lib/json-document";
import { cn } from "@/lib/utils";

interface JsonWorkbenchProps {
  value: string;
  onChange?: (value: string) => void;
  label: string;
  readOnly?: boolean;
  language?: "json" | "text";
  filename?: string;
  disabled?: boolean;
  template?: boolean;
}

export function JsonWorkbench({
  value,
  onChange,
  label,
  readOnly = false,
  language = "json",
  filename = "document.json",
  disabled = false,
  template = false,
}: JsonWorkbenchProps) {
  const id = useId();
  const [mode, setMode] = useState<"source" | "tree">("source");
  const [pretty, setPretty] = useState(readOnly);
  const [wrap, setWrap] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [focusOffset, setFocusOffset] = useState<{
    offset: number;
    request: number;
  }>();
  const document = useMemo(
    () =>
      language === "json"
        ? (template ? inspectJsonTemplate : inspectJson)(value)
        : {
            empty: !value,
            size: new TextEncoder().encode(value).length,
            root: undefined,
            issue: undefined,
          },
    [value, language, template],
  );
  const canFormat = language === "json" && !!document.root && !document.issue;
  const displayed = useMemo(
    () =>
      readOnly && pretty && canFormat
        ? template
          ? transformJsonTemplate(value, true)
          : formatJson(value)
        : value,
    [readOnly, pretty, canFormat, value, template],
  );

  const copy = async (text: string, kind = "内容") => {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(`${kind}已复制`);
      setCopied(true);
    } catch {
      setNotice("复制失败，请选择内容后手动复制");
      setCopied(false);
    }
  };
  const transform = (action: "format" | "minify") => {
    try {
      if (readOnly) {
        setPretty(action === "format");
        setNotice(null);
      } else {
        onChange?.(
          template
            ? transformJsonTemplate(value, action === "format")
            : action === "format"
              ? formatJson(value)
              : minifyJson(value),
        );
        setNotice(action === "format" ? "已美化" : "已压缩");
      }
      setMode("source");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "处理失败");
    }
  };
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([readOnly ? value : displayed], {
        type:
          language === "json"
            ? "application/json;charset=utf-8"
            : "text/plain;charset=utf-8",
      }),
    );
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice("已下载原始内容");
  };

  const content = (
    <div
      className="json-workbench min-w-0 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900"
      role="group"
      aria-label={label}
    >
      <div className="flex flex-wrap items-center gap-1 border-b border-zinc-200 bg-zinc-50/80 p-2 dark:border-zinc-700 dark:bg-zinc-900">
        <span
          id={`${id}-label`}
          className="min-w-0 basis-full truncate px-1 text-xs font-medium sm:mr-auto sm:basis-auto"
        >
          {label}
        </span>
        <div
          className="flex rounded-md bg-zinc-200/60 p-0.5 dark:bg-zinc-800"
          role="group"
          aria-label="查看方式"
        >
          <button
            type="button"
            className={cn(
              "rounded px-2 py-1 text-xs",
              mode === "source" && "bg-white shadow-sm dark:bg-zinc-700",
            )}
            aria-pressed={mode === "source"}
            onClick={() => setMode("source")}
          >
            {readOnly ? "源码" : "编辑"}
          </button>
          {language === "json" && (
            <button
              type="button"
              className={cn(
                "rounded px-2 py-1 text-xs disabled:opacity-40",
                mode === "tree" && "bg-white shadow-sm dark:bg-zinc-700",
              )}
              aria-pressed={mode === "tree"}
              disabled={!canFormat || template}
              title={template ? "请在解析后的请求体中查看结构" : undefined}
              onClick={() => setMode("tree")}
            >
              结构
            </button>
          )}
        </div>
        {language === "json" && (
          <>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!canFormat || disabled}
              onClick={() => transform("format")}
              title="美化 JSON，保留数值精度"
            >
              <WandSparkles className="size-3.5" />
              美化
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={!canFormat || disabled}
              onClick={() => transform("minify")}
            >
              {readOnly ? "原文" : "压缩"}
            </Button>
          </>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => setWrap(!wrap)}
          aria-label="自动换行"
          aria-pressed={wrap}
          title="自动换行"
        >
          <WrapText className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => copy(readOnly ? value : displayed)}
          aria-label={`复制${label}`}
          title="复制原始内容"
        >
          {copied ? (
            <Check className="size-3.5" />
          ) : (
            <Copy className="size-3.5" />
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={download}
          aria-label={`下载${label}`}
          title="下载原始内容"
        >
          <Download className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => setExpanded(!expanded)}
          aria-label={expanded ? "退出放大" : "放大编辑器"}
          title={expanded ? "退出放大" : "放大编辑器"}
        >
          {expanded ? (
            <Minimize2 className="size-3.5" />
          ) : (
            <Expand className="size-3.5" />
          )}
        </Button>
      </div>
      {mode === "tree" && !template && document.root && !document.issue ? (
        <JsonTree root={document.root} source={value} onCopy={copy} />
      ) : (
        <CodeEditor
          value={displayed}
          onChange={
            readOnly
              ? undefined
              : (next) => {
                  if (!disabled) {
                    setNotice(null);
                    setCopied(false);
                    onChange?.(next);
                  }
                }
          }
          label={label}
          readOnly={readOnly || disabled}
          language={language}
          template={template}
          wrap={wrap}
          focusOffset={focusOffset}
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200 px-3 py-2 text-[11px] dark:border-zinc-700">
        {document.issue ? (
          <button
            type="button"
            className="text-left text-red-600 underline-offset-2 hover:underline dark:text-red-400"
            onClick={() => {
              setMode("source");
              setPretty(false);
              setFocusOffset({
                offset: document.issue!.offset,
                request: (focusOffset?.request ?? 0) + 1,
              });
            }}
            aria-label="定位 JSON 错误"
          >
            第 {document.issue.line} 行，第 {document.issue.column} 列：
            {document.issue.message}
          </button>
        ) : (
          <span
            className={
              canFormat
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-zinc-500"
            }
          >
            {canFormat
              ? template
                ? "JSON 变量模板"
                : "有效 JSON"
              : document.empty
                ? "暂无内容"
                : "纯文本"}
          </span>
        )}
        <span className="text-zinc-500">
          {formatBytes(document.size)} · {value.split("\n").length} 行
        </span>
        {notice && (
          <span role="status" className="w-full text-zinc-500">
            {notice}
          </span>
        )}
      </div>
    </div>
  );

  return (
    <>
      {!expanded && content}
      <Dialog open={expanded} onOpenChange={setExpanded}>
        {expanded && (
          <DialogContent
            aria-describedby={undefined}
            className="w-[calc(100%-2rem)] max-w-6xl gap-3 p-3 sm:p-5"
          >
            <DialogTitle className="pr-8 text-sm">{label}</DialogTitle>
            {content}
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
