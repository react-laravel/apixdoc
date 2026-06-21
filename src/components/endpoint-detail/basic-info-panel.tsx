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
}: BasicInfoPanelProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">请求方法</label>
          <Select value={method} onValueChange={onMethodChange}>
            <SelectTrigger>
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
          <label className="mb-1 block text-sm font-medium">路径</label>
          <Input
            value={path}
            onChange={(e) => onPathChange(e.target.value)}
            placeholder="/api/resource"
            className="font-mono"
          />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">名称</label>
        <Input value={name} onChange={(e) => onNameChange(e.target.value)} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">描述</label>
        <Textarea
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          rows={3}
        />
      </div>
      <Button onClick={onSave}>保存</Button>
    </div>
  );
}
