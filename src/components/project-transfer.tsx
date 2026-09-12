"use client";
import { SpecificationImport } from "@/components/specification-import";
import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Project } from "@/lib/types";

export function ProjectTransfer({
  project,
  onReload,
  beforeImport,
}: {
  project: Project;
  beforeImport?: () => boolean;
  onReload?: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState("openapi-json");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const download = async () => {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const [kind, syntax] = format.split("-");
      const response = await fetch(
        `/api/projects/${project.id}/export?format=${kind}&syntax=${syntax}`,
      );
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || "导出失败");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${project.name.replace(/[\\/:*?"<>|]/g, "-")}-${kind}.${syntax}`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setOpen(false);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : "导出失败");
    } finally {
      setLoading(false);
    }
  };
  return (
    <>
      {project.permissions?.canEdit !== false && (
        <SpecificationImport
          project={project}
          onReload={onReload}
          beforeImport={beforeImport}
        />
      )}
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Download className="size-3.5" />
        导出
      </Button>
      <Dialog open={open} onOpenChange={(value) => !loading && setOpen(value)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>导出接口文档</DialogTitle>
            <DialogDescription>
              导出当前接口文档。相同格式的导入内容保留原始结构；转换格式时仅转换可映射的接口数据。
            </DialogDescription>
          </DialogHeader>
          <Select value={format} onValueChange={setFormat} disabled={loading}>
            <SelectTrigger aria-label="导出格式">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="openapi-json">OpenAPI · JSON</SelectItem>
              <SelectItem value="openapi-yaml">OpenAPI · YAML</SelectItem>
              <SelectItem value="postman-json">
                Postman Collection 2.1 · JSON
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs leading-6 text-zinc-500">
            内部导出包含接口自身的请求与响应示例，分享文件前请检查内容。公开文档中的运行配置和已识别认证示例会隐藏。
          </p>
          {!!project.specificationImports?.length && (
            <details>
              <summary className="cursor-pointer text-sm">
                下载原始规范（{project.specificationImports.length}）
              </summary>
              <ul className="mt-2 max-h-40 space-y-2 overflow-auto text-sm">
                {project.specificationImports.map((source) => (
                  <li key={source.id}>
                    <a
                      className="break-all text-blue-600 hover:underline"
                      href={`/api/projects/${project.id}/sources/${source.id}`}
                      download
                    >
                      {source.name} · {source.format} {source.version}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={loading}
              onClick={() => setOpen(false)}
            >
              取消
            </Button>
            <Button disabled={loading} onClick={download}>
              {loading && <Loader2 className="size-3.5 animate-spin" />}下载文件
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
