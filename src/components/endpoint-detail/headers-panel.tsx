"use client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EndpointHeader } from "@/lib/types";
export function HeadersPanel({
  headers,
  onChange,
  onSave,
  saving,
}: {
  headers: EndpointHeader[];
  onChange: (value: EndpointHeader[]) => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <div className="space-y-4">
      {!headers.length && (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-zinc-500">
          暂无接口请求头，项目全局请求头仍会用于调试。
        </p>
      )}
      {headers.map((header, index) => (
        <div
          key={index}
          className="grid gap-2 rounded-lg border border-zinc-200 p-3 sm:grid-cols-2 dark:border-zinc-700"
        >
          {(["key", "value", "description"] as const).map((key, i) => (
            <Input
              key={key}
              aria-label={`${["请求头名称", "请求头内容", "请求头描述"][i]} ${index + 1}`}
              placeholder={["名称", "内容", "描述"][i]}
              value={header[key] || ""}
              disabled={saving}
              onChange={(e) =>
                onChange(
                  headers.map((h, n) =>
                    n === index ? { ...h, [key]: e.target.value } : h,
                  ),
                )
              }
            />
          ))}
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!header.required}
                disabled={saving}
                onChange={(e) =>
                  onChange(
                    headers.map((h, n) =>
                      n === index ? { ...h, required: e.target.checked } : h,
                    ),
                  )
                }
              />
              必填
            </label>
            <Button
              variant="ghost"
              size="sm"
              disabled={saving}
              onClick={() => onChange(headers.filter((_, n) => n !== index))}
            >
              删除
            </Button>
          </div>
        </div>
      ))}
      <div className="flex gap-2">
        <Button
          variant="outline"
          disabled={saving}
          onClick={() =>
            onChange([
              ...headers,
              { key: "", value: "", description: "", required: false },
            ])
          }
        >
          添加请求头
        </Button>
        <Button disabled={saving} onClick={onSave}>
          {saving ? "保存中…" : "保存"}
        </Button>
      </div>
    </div>
  );
}
