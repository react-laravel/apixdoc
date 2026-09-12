"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HTTP_METHODS } from "@/lib/utils";

interface BasicInfoPanelProps {
  method: string;
  path: string;
  name: string;
  description: string;
  onMethodChange: (v: string) => void;
  onPathChange: (v: string) => void;
  onNameChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onSave: () => void;
  saving?: boolean;
}

export function BasicInfoPanel({
  method,
  path,
  name,
  description,
  onMethodChange,
  onPathChange,
  onNameChange,
  onDescriptionChange,
  onSave,
  saving = false,
}: BasicInfoPanelProps) {
  return (
    <div className="space-y-5 rounded-xl border border-zinc-200 bg-white p-4 sm:p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[160px_1fr]">
        <div>
          <label
            htmlFor="endpoint-method"
            className="mb-1.5 block text-sm font-medium"
          >
            请求方法
          </label>
          <Select value={method} onValueChange={onMethodChange}>
            <SelectTrigger id="endpoint-method">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HTTP_METHODS.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label
            htmlFor="endpoint-path"
            className="mb-1.5 block text-sm font-medium"
          >
            路径
          </label>
          <Input
            id="endpoint-path"
            value={path}
            onChange={(e) => onPathChange(e.target.value)}
            placeholder="/api/resource"
            className="font-mono"
          />
        </div>
      </div>
      <div>
        <label
          htmlFor="endpoint-name"
          className="mb-1.5 block text-sm font-medium"
        >
          名称
        </label>
        <Input
          id="endpoint-name"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
        />
      </div>
      <div>
        <label
          htmlFor="endpoint-description"
          className="mb-1.5 block text-sm font-medium"
        >
          描述
        </label>
        <Textarea
          id="endpoint-description"
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          rows={6}
        />
      </div>
      <Button disabled={saving} onClick={onSave}>
        {saving ? "保存中…" : "保存"}
      </Button>
    </div>
  );
}
