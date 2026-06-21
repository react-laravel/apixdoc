"use client";

import { useState } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { HTTP_METHODS } from "@/lib/utils";

interface CreateEndpointDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folderId: string | null;
  onCreate: (data: {
    name: string;
    method: string;
    path: string;
    description: string;
    folderId: string | null;
  }) => Promise<{ error?: string }>;
}

export function CreateEndpointDialog({
  open,
  onOpenChange,
  folderId,
  onCreate,
}: CreateEndpointDialogProps) {
  const [endpointName, setEndpointName] = useState("");
  const [endpointMethod, setEndpointMethod] = useState("GET");
  const [endpointPath, setEndpointPath] = useState("");
  const [endpointDescription, setEndpointDescription] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setEndpointName("");
      setEndpointMethod("GET");
      setEndpointPath("");
      setEndpointDescription("");
      setError("");
    }
  };

  const handleCreate = async () => {
    setSubmitting(true);
    setError("");
    const result = await onCreate({
      name: endpointName,
      method: endpointMethod,
      path: endpointPath,
      description: endpointDescription,
      folderId,
    });
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建接口</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">接口名称</label>
            <Input
              value={endpointName}
              onChange={(e) => setEndpointName(e.target.value)}
              placeholder="如：获取用户列表"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium">方法</label>
              <Select value={endpointMethod} onValueChange={setEndpointMethod}>
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
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium">路径</label>
              <Input
                value={endpointPath}
                onChange={(e) => {
                  setEndpointPath(e.target.value);
                  if (error) setError("");
                }}
                placeholder="/api/users"
                className="font-mono"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">描述</label>
            <Textarea
              value={endpointDescription}
              onChange={(e) => setEndpointDescription(e.target.value)}
              placeholder="接口功能描述"
              rows={3}
            />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleCreate} disabled={submitting}>
            {submitting ? "创建中..." : "创建"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
