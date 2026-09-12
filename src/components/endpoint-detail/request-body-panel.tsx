"use client";

import { Button } from "@/components/ui/button";
import { JsonWorkbench } from "@/components/json/json-workbench";
import { isJsonContentType } from "@/lib/json-document";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface RequestBodyPanelProps {
  contentType: string;
  schema: string;
  example: string;
  onContentTypeChange: (v: string) => void;
  onSchemaChange: (v: string) => void;
  onExampleChange: (v: string) => void;
  onSave: () => void;
  saving?: boolean;
  duplicateFields: string[];
}

export function RequestBodyPanel({
  contentType,
  schema,
  example,
  onContentTypeChange,
  onSchemaChange,
  onExampleChange,
  onSave,
  saving = false,
  duplicateFields,
}: RequestBodyPanelProps) {
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium">Content-Type</label>
        <Select value={contentType} onValueChange={onContentTypeChange}>
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="application/json">application/json</SelectItem>
            <SelectItem value="application/x-www-form-urlencoded">
              application/x-www-form-urlencoded
            </SelectItem>
            <SelectItem value="multipart/form-data">
              multipart/form-data
            </SelectItem>
            <SelectItem value="text/plain">text/plain</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {duplicateFields.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
          以下字段在请求体和请求参数中同时出现，请确认是否需要重复定义：
          {duplicateFields.map((f, idx) => (
            <span key={f}>
              {idx > 0 && "、"}
              <code className="mx-0.5 rounded bg-amber-100 px-1 dark:bg-amber-900">
                {f}
              </code>
            </span>
          ))}
        </div>
      )}

      <JsonWorkbench
        label="JSON Schema"
        value={schema}
        onChange={onSchemaChange}
        disabled={saving}
        filename="request-schema.json"
      />
      <JsonWorkbench
        label="请求体示例"
        template={/\{\{[^{}]+\}\}/.test(example)}
        value={example}
        onChange={onExampleChange}
        disabled={saving}
        language={isJsonContentType(contentType) ? "json" : "text"}
        filename={
          isJsonContentType(contentType)
            ? "request-body.json"
            : "request-body.txt"
        }
      />
      <Button disabled={saving} onClick={onSave}>
        {saving ? "保存中…" : "保存"}
      </Button>
    </div>
  );
}
