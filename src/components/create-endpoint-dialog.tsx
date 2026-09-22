"use client";

import { useRef, useState } from "react";
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
  DialogDescription,
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
  const lock = useRef(false);

  const handleOpenChange = (nextOpen: boolean) => {
    if (lock.current) return;
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
    if (lock.current) return;
    lock.current = true;
    setSubmitting(true);
    setError("");
    try {
      const result = await onCreate({
        name: endpointName,
        method: endpointMethod,
        path: endpointPath,
        description: endpointDescription,
        folderId,
      });
      if (result.error) setError(result.error);
      else {
        lock.current = false;
        handleOpenChange(false);
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "创建接口失败，请重试");
    } finally {
      lock.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent closeDisabled={submitting}>
        <DialogHeader>
          <DialogTitle>新建接口</DialogTitle>
          <DialogDescription>
            填写请求方法和路径，创建后继续编辑参数与响应。
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleCreate();
          }}
          className="space-y-4"
          aria-busy={submitting}
        >
          <div>
            <label
              htmlFor="endpoint-name"
              className="mb-1 block text-sm font-medium"
            >
              接口名称
            </label>
            <Input
              id="endpoint-name"
              disabled={submitting}
              value={endpointName}
              onChange={(e) => setEndpointName(e.target.value)}
              placeholder="如：获取用户列表"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium">方法</label>
              <Select
                disabled={submitting}
                value={endpointMethod}
                onValueChange={setEndpointMethod}
              >
                <SelectTrigger aria-label="请求方法">
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
              <label
                htmlFor="endpoint-path"
                className="mb-1 block text-sm font-medium"
              >
                路径
              </label>
              <Input
                id="endpoint-path"
                disabled={submitting}
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
            <label
              htmlFor="endpoint-description"
              className="mb-1 block text-sm font-medium"
            >
              描述
            </label>
            <Textarea
              id="endpoint-description"
              disabled={submitting}
              value={endpointDescription}
              onChange={(e) => setEndpointDescription(e.target.value)}
              placeholder="接口功能描述"
              rows={3}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              type="button"
              disabled={submitting}
              onClick={() => handleOpenChange(false)}
            >
              取消
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "创建中..." : "创建"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
