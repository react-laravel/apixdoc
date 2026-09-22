"use client";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
  const [folderName, setFolderName] = useState(""),
    [error, setError] = useState(""),
    [submitting, setSubmitting] = useState(false),
    lock = useRef(false);
  function handleOpenChange(value: boolean) {
    if (lock.current) return;
    onOpenChange(value);
    if (!value) {
      setFolderName("");
      setError("");
    }
  }
  async function handleCreate() {
    if (lock.current) return;
    if (!folderName.trim()) {
      setError("请填写文件夹名称");
      return;
    }
    lock.current = true;
    setSubmitting(true);
    setError("");
    try {
      const issue = await onCreate(folderName);
      if (issue) setError(issue);
      else {
        lock.current = false;
        handleOpenChange(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建失败，请重试");
    } finally {
      lock.current = false;
      setSubmitting(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent closeDisabled={submitting}>
        <DialogHeader>
          <DialogTitle>新建文件夹</DialogTitle>
          <DialogDescription>
            按业务模块整理接口，之后可以拖动调整目录。
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleCreate();
          }}
          className="space-y-5"
          aria-busy={submitting}
        >
          <div className="space-y-2">
            <label htmlFor="folder-name" className="block text-sm font-medium">
              文件夹名称
            </label>
            <Input
              id="folder-name"
              value={folderName}
              maxLength={100}
              disabled={submitting}
              onChange={(e) => {
                setFolderName(e.target.value);
                setError("");
              }}
              placeholder="输入文件夹名称"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void handleCreate();
                }
              }}
            />
            {error && (
              <p
                role="alert"
                className="text-sm text-red-600 dark:text-red-400"
              >
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
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
