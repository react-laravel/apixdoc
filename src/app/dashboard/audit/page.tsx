"use client";
import { useCallback, useEffect, useState } from "react";
import { Download, RefreshCw, ScrollText } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { AUDIT_ACTIONS, auditDetail, type AuditRow } from "@/lib/audit/model";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
interface Scopes {
  canRead: boolean;
  isPlatformAdmin: boolean;
  organizations: { id: string; name: string }[];
  projects: { id: string; name: string; organizationId: string }[];
}
export default function AuditPage() {
  const [scopes, setScopes] = useState<Scopes | null>(null);
  const [ready, setReady] = useState(false);
  const [org, setOrg] = useState("");
  const [project, setProject] = useState("");
  const [action, setAction] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setOrg(params.get("organizationId") || "");
    setProject(params.get("projectId") || "");
    apiFetch<Scopes>("/api/audit/scopes")
      .then(setScopes)
      .catch((e) => setError(e instanceof Error ? e.message : "范围加载失败"))
      .finally(() => setReady(true));
  }, []);
  const query = useCallback(() => {
    const values = new URLSearchParams();
    for (const [key, value] of [
      ["organizationId", org],
      ["projectId", project],
      ["action", action],
      ["q", q],
    ] as const)
      if (value) values.set(key, value);
    if (from) values.set("from", new Date(from + "T00:00:00").toISOString());
    if (to) values.set("to", new Date(to + "T23:59:59.999").toISOString());
    return values;
  }, [org, project, action, q, from, to]);
  const load = useCallback(
    async (cursor?: string, signal?: AbortSignal) => {
      setBusy(true);
      setError("");
      try {
        const params = query();
        if (cursor) params.set("cursor", cursor);
        const result = await apiFetch<{
          items: AuditRow[];
          next: string | null;
          total: number;
        }>(`/api/audit?${params}`, { signal });
        if (signal?.aborted) return;
        setRows((previous) =>
          cursor ? [...previous, ...result.items] : result.items,
        );
        setNext(result.next);
        setTotal(result.total);
      } catch (e) {
        if (!signal?.aborted)
          setError(e instanceof Error ? e.message : "记录加载失败");
      } finally {
        if (!signal?.aborted) setBusy(false);
      }
    },
    [query],
  );
  useEffect(() => {
    if (!ready || !scopes?.canRead) return;
    const controller = new AbortController();
    const timer = window.setTimeout(
      () => load(undefined, controller.signal),
      250,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [ready, scopes, load]);
  const download = async () => {
    setBusy(true);
    setError("");
    try {
      const params = query();
      params.set("format", "csv");
      const response = await fetch(`/api/audit?${params}`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "导出失败");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "audit-events.csv";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "导出失败");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-center gap-3">
        <ScrollText className="size-6 text-zinc-500" />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold">操作记录</h1>
          <p className="mt-1 text-sm text-zinc-500">
            追踪已提交的变更。组织管理员查看自己的组织，平台管理员可查看全站记录。
          </p>
        </div>
        <Button
          variant="outline"
          disabled={busy || !scopes?.canRead}
          onClick={() => load()}
        >
          <RefreshCw className="size-4" />
          刷新
        </Button>
        <Button
          variant="outline"
          disabled={busy || !scopes?.canRead}
          onClick={download}
        >
          <Download className="size-4" />
          导出 CSV
        </Button>
      </header>
      {ready && !scopes?.canRead ? (
        <p className="rounded-lg border p-6 text-sm text-zinc-500">
          当前没有可查看的审计范围，需要组织所有者、管理员或平台管理员权限。
        </p>
      ) : (
        <>
          <div className="grid gap-3 rounded-xl border border-zinc-200 p-4 sm:grid-cols-2 lg:grid-cols-3 dark:border-zinc-800">
            <Select
              value={org || "all"}
              onValueChange={(value) => {
                setOrg(value === "all" ? "" : value);
                setProject("");
              }}
            >
              <SelectTrigger aria-label="审计组织">
                <SelectValue placeholder="选择组织" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部可见组织</SelectItem>
                {org && !scopes?.organizations.some((o) => o.id === org) && (
                  <SelectItem value={org}>历史组织</SelectItem>
                )}
                {scopes?.organizations.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={project || "all"}
              onValueChange={(value) =>
                setProject(value === "all" ? "" : value)
              }
            >
              <SelectTrigger aria-label="审计项目">
                <SelectValue placeholder="选择项目" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部项目</SelectItem>
                {project && !scopes?.projects.some((p) => p.id === project) && (
                  <SelectItem value={project}>历史项目</SelectItem>
                )}
                {scopes?.projects
                  .filter((p) => !org || p.organizationId === org)
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Select
              value={action || "all"}
              onValueChange={(value) => setAction(value === "all" ? "" : value)}
            >
              <SelectTrigger aria-label="审计操作类型">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部操作</SelectItem>
                {Object.entries(AUDIT_ACTIONS).map(([key, name]) => (
                  <SelectItem key={key} value={key}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              aria-label="搜索操作记录"
              value={q}
              maxLength={200}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索操作者、对象或项目名称"
            />
            <label className="flex items-center gap-2 text-sm text-zinc-500">
              <span className="shrink-0">开始日期</span>
              <Input
                type="date"
                aria-label="开始日期"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-500">
              <span className="shrink-0">结束日期</span>
              <Input
                type="date"
                aria-label="结束日期"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </div>
          <p role="status" className="text-xs text-zinc-500">
            {busy ? "正在读取…" : `共 ${total} 条，已显示 ${rows.length} 条`}
          </p>
          <ol className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {rows.map((row) => (
              <li key={row.id} className="space-y-2 p-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <strong className="font-medium">
                    {AUDIT_ACTIONS[row.action] || row.action}
                  </strong>
                  <span className="break-all">
                    {row.targetName ||
                      row.projectName ||
                      row.organizationName ||
                      "系统操作"}
                  </span>
                  <time
                    className="ml-auto text-xs text-zinc-400"
                    dateTime={row.createdAt}
                  >
                    {new Date(row.createdAt).toLocaleString("zh-CN")}
                  </time>
                </div>
                <p className="break-all text-xs text-zinc-500">
                  {row.actorName} ·{" "}
                  {row.organizationName ||
                    (row.organizationId ? "历史组织" : "平台")}
                  {row.projectName && ` / ${row.projectName}`}
                </p>
                {auditDetail(row.metadata) && (
                  <p className="text-xs text-zinc-500">
                    {auditDetail(row.metadata)}
                  </p>
                )}
              </li>
            ))}
            {!busy && !rows.length && (
              <li className="p-10 text-center text-sm text-zinc-500">
                没有匹配的记录
              </li>
            )}
          </ol>
          {next && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => load(next)}
            >
              加载更多
            </Button>
          )}
          <p className="text-xs text-zinc-400">
            记录对象与变更范围，不保存请求体、配置值或邀请密钥。CSV 最多导出
            5000 条。
          </p>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
