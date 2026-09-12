"use client";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { importCurl } from "@/lib/request/curl";
import type { RequestDraft } from "@/lib/request/types";

export function CurlImportDialog({
  open,
  onOpenChange,
  onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (draft: RequestDraft) => void;
}) {
  const [command, setCommand] = useState("");
  const parsed = useMemo(() => {
    if (!command.trim()) return {};
    try {
      return { result: importCurl(command) };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : "无法解析 cURL",
      };
    }
  }, [command]);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setCommand("");
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>从 cURL 载入请求</DialogTitle>
          <DialogDescription>
            粘贴一条 cURL
            命令，预览后载入调试器。导入过程不会执行命令或发送请求。
          </DialogDescription>
        </DialogHeader>
        <Textarea
          aria-label="cURL 命令"
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          placeholder={
            "curl 'https://api.example.com/users' \\\n  --header 'Accept: application/json'"
          }
          rows={9}
          className="font-mono text-xs"
        />
        {parsed.error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {parsed.error}
          </p>
        )}
        {parsed.result && (
          <div className="space-y-2 rounded-lg bg-zinc-50 p-3 text-xs dark:bg-zinc-800">
            <p className="break-all font-mono">
              <strong>{parsed.result.draft.method}</strong>{" "}
              {parsed.result.draft.address}
            </p>
            <p className="text-zinc-500">
              {parsed.result.draft.headers.length} 个请求头 ·{" "}
              {parsed.result.draft.body.length} 个请求体字符
            </p>
            {parsed.result.warnings.map((warning) => (
              <p key={warning} className="text-amber-700 dark:text-amber-400">
                {warning}
              </p>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            disabled={!parsed.result}
            onClick={() => {
              onImport(parsed.result!.draft);
              setCommand("");
              onOpenChange(false);
            }}
          >
            载入调试器
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
