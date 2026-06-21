"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { EndpointParam } from "@/lib/types";

interface ParamsPanelProps {
  params: EndpointParam[];
  onAdd: () => void;
  onUpdate: (index: number, field: keyof EndpointParam, value: string | boolean) => void;
  onRemove: (index: number) => void;
  onSave: () => void;
  duplicateFields: string[];
}

export function ParamsPanel({
  params,
  onAdd,
  onUpdate,
  onRemove,
  onSave,
  duplicateFields,
}: ParamsPanelProps) {
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
              <th className="px-3 py-2 text-left font-medium">名称</th>
              <th className="px-3 py-2 text-left font-medium">类型</th>
              <th className="px-3 py-2 text-left font-medium">必填</th>
              <th className="px-3 py-2 text-left font-medium">位置</th>
              <th className="px-3 py-2 text-left font-medium">描述</th>
              <th className="px-3 py-2 text-left font-medium">示例</th>
              <th className="px-3 py-2 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {params.map((p, i) => (
              <tr
                key={i}
                className="border-b border-zinc-100 dark:border-zinc-800"
              >
                <td className="px-3 py-2">
                  <Input
                    value={p.name}
                    onChange={(e) => onUpdate(i, "name", e.target.value)}
                    className="h-8 text-xs"
                  />
                </td>
                <td className="px-3 py-2">
                  <Select
                    value={p.type}
                    onValueChange={(v) => onUpdate(i, "type", v)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="string">string</SelectItem>
                      <SelectItem value="number">number</SelectItem>
                      <SelectItem value="integer">integer</SelectItem>
                      <SelectItem value="boolean">boolean</SelectItem>
                      <SelectItem value="array">array</SelectItem>
                      <SelectItem value="object">object</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={p.required}
                    onChange={(e) => onUpdate(i, "required", e.target.checked)}
                  />
                </td>
                <td className="px-3 py-2">
                  <Select
                    value={p.location}
                    onValueChange={(v) => onUpdate(i, "location", v)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="query">query</SelectItem>
                      <SelectItem value="path">path</SelectItem>
                      <SelectItem value="header">header</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-3 py-2">
                  <Input
                    value={p.description}
                    onChange={(e) => onUpdate(i, "description", e.target.value)}
                    className="h-8 text-xs"
                  />
                </td>
                <td className="px-3 py-2">
                  <Input
                    value={p.example}
                    onChange={(e) => onUpdate(i, "example", e.target.value)}
                    className="h-8 text-xs"
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemove(i)}
                    className="text-xs"
                  >
                    删除
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {duplicateFields.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
          以下参数在请求体和请求参数中同时出现，可能重复：
          {duplicateFields.map((f, idx) => (
            <span key={f}>
              {idx > 0 && "、"}
              <code className="mx-0.5 rounded bg-amber-100 px-1 dark:bg-amber-900">{f}</code>
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onAdd}>
          添加参数
        </Button>
        <Button size="sm" onClick={onSave}>
          保存
        </Button>
      </div>
    </div>
  );
}
