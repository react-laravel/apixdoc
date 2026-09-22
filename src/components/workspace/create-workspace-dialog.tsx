"use client";
import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
export function CreateWorkspaceDialog({
  kind,
  open,
  onOpenChange,
  onCreate,
}: {
  kind: "组织" | "项目";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: { name: string; description: string }) => Promise<void>;
}) {
  const [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const lock = useRef(false);
  function close(value: boolean) {
    if (lock.current) return;
    onOpenChange(value);
    if (!value) {
      setName("");
      setDescription("");
      setError("");
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (lock.current || !name.trim()) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await onCreate({ name: name.trim(), description: description.trim() });
      lock.current = false;
      close(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : `创建${kind}失败，请重试`);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent closeDisabled={busy}>
        <DialogHeader>
          <DialogTitle>创建{kind}</DialogTitle>
          <DialogDescription>
            {kind === "组织"
              ? "为团队建立共享空间，集中管理项目与成员。"
              : "为一组相关接口创建项目，之后可以导入文档或新建接口。"}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-5" aria-busy={busy}>
          <div className="space-y-2">
            <label htmlFor="workspace-name" className="text-sm font-medium">
              {kind}名称{" "}
              <span className="text-red-500" aria-hidden>
                *
              </span>
            </label>
            <Input
              id="workspace-name"
              placeholder={`输入${kind}名称`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              required
              disabled={busy}
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="workspace-description"
              className="text-sm font-medium"
            >
              描述 <span className="font-normal text-zinc-400">（可选）</span>
            </label>
            <Textarea
              id="workspace-description"
              placeholder={`简单介绍${kind}的用途`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              rows={3}
              disabled={busy}
            />
          </div>
          {error && (
            <p
              role="alert"
              className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400"
            >
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => close(false)}
            >
              取消
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy && (
                <Loader2
                  aria-hidden
                  className="size-4 animate-spin motion-reduce:animate-none"
                />
              )}
              {busy ? "创建中…" : `创建${kind}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
