"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EndpointResponse, SendRequestResult } from "@/lib/types";

interface ResponsesPanelProps {
  responses: EndpointResponse[];
  onUpdate: (index: number, field: keyof EndpointResponse, value: string | number) => void;
  onRemove: (index: number) => void;
  onAdd: () => void;
  onAddWithStatus: (statusCode: number) => void;
  onSave: () => void;
  onImportFromTest: (response: SendRequestResult) => void;
  testResponse: SendRequestResult | null;
}

export function ResponsesPanel({
  responses,
  onUpdate,
  onRemove,
  onAdd,
  onAddWithStatus,
  onSave,
  onImportFromTest,
  testResponse,
}: ResponsesPanelProps) {
  return (
    <div className="space-y-4">
      {responses.map((r, i) => (
        <div
          key={i}
          className="relative space-y-3 rounded-lg border border-zinc-200 p-3 sm:p-4 dark:border-zinc-800"
        >
          <button
            type="button"
            onClick={() => onRemove(i)}
            className="absolute right-2 top-2 rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40"
            aria-label="删除此响应"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div>
              <label className="mb-1 block text-xs font-medium">状态码</label>
              <Input
                type="number"
                value={r.statusCode}
                onChange={(e) =>
                  onUpdate(i, "statusCode", parseInt(e.target.value) || 0)
                }
                className="h-8 w-full text-xs sm:w-24"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium">描述</label>
              <Input
                value={r.description}
                onChange={(e) => onUpdate(i, "description", e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Content-Type</label>
              <Select
                value={r.contentType}
                onValueChange={(v) => onUpdate(i, "contentType", v)}
              >
                <SelectTrigger className="h-8 w-48 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="application/json">application/json</SelectItem>
                  <SelectItem value="text/plain">text/plain</SelectItem>
                  <SelectItem value="text/html">text/html</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium">响应示例</label>
            <Textarea
              value={r.example}
              onChange={(e) => onUpdate(i, "example", e.target.value)}
              rows={4}
              className="font-mono text-xs"
            />
          </div>
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-zinc-400">快速添加：</span>
          {[200, 201, 400, 401, 403, 404, 422, 500].map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => onAddWithStatus(code)}
              disabled={responses.some((r) => r.statusCode === code)}
              className={cn(
                "rounded border px-1.5 py-0.5 text-xs font-mono transition-colors",
                code < 300
                  ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-30 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
                  : code < 500
                    ? "border-amber-200 text-amber-700 hover:bg-amber-50 disabled:opacity-30 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950/40"
                    : "border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-30 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40",
              )}
            >
              {code}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onAdd}>
            添加响应
          </Button>
          <Button size="sm" onClick={onSave}>
            保存
          </Button>
        </div>
      </div>

      {testResponse && (
        <Button variant="outline" size="sm" onClick={() => onImportFromTest(testResponse)}>
          <Badge variant={testResponse.status < 300 ? "default" : "secondary"} className="mr-2 text-[10px]">
            {testResponse.status}
          </Badge>
          将测试结果添加到响应
        </Button>
      )}
    </div>
  );
}
