"use client";
import { useCallback, useEffect, useState } from "react";
import { Activity, RefreshCw } from "lucide-react";
import { apiFetch } from "@/lib/api-fetch";
import { Button } from "@/components/ui/button";
interface RuntimeStatus {
  health: {
    ready: boolean;
    checkedAt: string;
    database: string;
    migrations: string;
    pendingCount: number;
    failedCount: number;
    requestId?: string;
  };
  counts: {
    organizations: number;
    projects: number;
    endpoints: number;
    recycled: number;
    auditEvents: number;
  } | null;
  uptimeSeconds: number;
  runtime: string;
  revision: string | null;
  memoryMegabytes: number;
}
export default function OperationsPage() {
  const [data, setData] = useState<RuntimeStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      setData(await apiFetch<RuntimeStatus>("/api/operations"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "状态读取失败");
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex items-center gap-3">
        <Activity className="size-6 text-zinc-500" />
        <div className="flex-1">
          <h1 className="text-xl font-semibold">运行状态</h1>
          <p className="mt-1 text-sm text-zinc-500">
            检查应用、数据库和部署迁移是否就绪。
          </p>
        </div>
        <Button variant="outline" disabled={busy} onClick={load}>
          <RefreshCw className="size-4" />
          {busy ? "检查中…" : "刷新"}
        </Button>
      </header>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 p-4 text-sm text-red-600"
        >
          {error}
        </p>
      )}
      {data && (
        <>
          <div
            className={`rounded-xl border p-5 ${data.health.ready ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300" : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"}`}
          >
            <h2 className="font-semibold">
              {data.health.ready ? "服务已就绪" : "服务尚未就绪"}
            </h2>
            <p className="mt-2 text-sm">
              数据库：
              {data.health.database === "ok" ? "连接正常" : "连接或检查失败"} ·
              迁移：
              {data.health.migrations === "ok"
                ? "已对齐"
                : data.health.migrations === "unavailable"
                  ? "无法检查"
                  : `${data.health.pendingCount} 项待执行，${data.health.failedCount} 项未完成`}
            </p>
            <p className="mt-2 text-xs">
              检查于 {new Date(data.health.checkedAt).toLocaleString("zh-CN")}
            </p>
            {data.health.requestId && (
              <p className="mt-2 break-all text-xs">
                问题编号：{data.health.requestId}
              </p>
            )}
          </div>
          <dl className="grid gap-3 sm:grid-cols-3">
            {Object.entries({
              运行时间: `${Math.floor(data.uptimeSeconds / 60)} 分钟`,
              运行环境: data.runtime,
              进程内存: `${data.memoryMegabytes} MB`,
              部署版本: data.revision || "未提供",
              组织: data.counts?.organizations ?? "—",
              项目: data.counts?.projects ?? "—",
              活动接口: data.counts?.endpoints ?? "—",
              回收站接口: data.counts?.recycled ?? "—",
              审计记录: data.counts?.auditEvents ?? "—",
            }).map(([key, value]) => (
              <div
                key={key}
                className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
              >
                <dt className="text-xs text-zinc-500">{key}</dt>
                <dd className="mt-2 break-all text-lg font-medium">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="rounded-xl border border-zinc-200 p-4 text-sm text-zinc-500 dark:border-zinc-800">
            <p>
              存活探针：<code>/api/health/live</code>
            </p>
            <p className="mt-2">
              就绪探针：<code>/api/health/ready</code>，数据库或迁移未就绪时返回
              503。
            </p>
            <p className="mt-2 text-xs">
              就绪检查最多缓存 5 秒；此页面不显示数据库地址或环境变量。
            </p>
          </div>
        </>
      )}
    </div>
  );
}
