"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

interface CreateFolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (name: string) => Promise<string | null>;
}

export function CreateFolderDialog({
  open,
  onOpenChange,
  onCreate,
}: CreateFolderDialogProps) {
  const [folderName, setFolderName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setFolderName("");
      setError("");
    }
  };

  const handleCreate = async () => {
    setSubmitting(true);
    setError("");
    const err = await onCreate(folderName);
    setSubmitting(false);
    if (err) {
      setError(err);
    } else {
      setFolderName("");
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建文件夹</DialogTitle>
        </DialogHeader>
        <div>
          <label className="mb-1 block text-sm font-medium">文件夹名称</label>
          <Input
            value={folderName}
            onChange={(e) => {
              setFolderName(e.target.value);
              if (error) setError("");
            }}
            placeholder="输入文件夹名称"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
            }}
          />
          {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
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
