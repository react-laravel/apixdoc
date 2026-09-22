"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Building2, Plus, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-fetch";
import type { Organization } from "@/lib/types";
import {
  PageHeading,
  ListSearch,
  ListSkeleton,
  EmptyList,
} from "@/components/workspace/list-ui";
import { CreateWorkspaceDialog } from "@/components/workspace/create-workspace-dialog";
export default function DashboardPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]),
    [loading, setLoading] = useState(true),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [dialogOpen, setDialogOpen] = useState(false),
    [notice, setNotice] = useState("");
  const request = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    try {
      const result = await apiFetch<Organization[]>("/api/organizations", {
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        setOrganizations(result);
        setLoaded(true);
      }
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    return () => request.current?.abort();
  }, [load]);
  const needle = query.trim().toLocaleLowerCase(),
    filtered = organizations.filter((org) =>
      `${org.name} ${org.description}`.toLocaleLowerCase().includes(needle),
    );
  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-6">
      <PageHeading
        title="组织管理"
        description="从团队空间开始，继续你的接口协作。"
      >
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="size-4" />
          创建组织
        </Button>
      </PageHeading>
      <div className="flex items-center gap-2">
        <ListSearch
          value={query}
          onChange={setQuery}
          label="搜索组织"
          placeholder="搜索组织名称或描述"
        />
        <Button
          variant="outline"
          size="icon"
          className="size-10 shrink-0"
          aria-label="刷新组织列表"
          onClick={load}
          disabled={loading}
        >
          <RefreshCw
            className={`size-4 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`}
          />
        </Button>
      </div>
      {error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400"
        >
          <span>{error}</span>
          <Button size="sm" variant="ghost" disabled={loading} onClick={load}>
            重试
          </Button>
        </div>
      )}
      {notice && (
        <p
          role="status"
          className="text-sm text-emerald-700 dark:text-emerald-400"
        >
          {notice}
        </p>
      )}
      {!loaded && loading ? (
        <ListSkeleton />
      ) : (
        loaded && (
          <>
            <p className="text-xs text-zinc-500" role="status">
              {needle
                ? `找到 ${filtered.length} 个组织`
                : `${organizations.length} 个组织`}
            </p>
            {filtered.length ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map((org) => (
                  <Link
                    key={org.id}
                    href={`/dashboard/organizations/${org.id}`}
                    className="group flex min-w-0 flex-col rounded-xl border border-zinc-200 bg-white p-5 transition-colors hover:border-blue-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-blue-800"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="rounded-lg bg-blue-50 p-2.5 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
                        <Building2 className="size-5" aria-hidden />
                      </span>
                      <ArrowUpRight
                        className="size-4 text-zinc-300 group-hover:text-blue-500"
                        aria-hidden
                      />
                    </div>
                    <h2 className="mt-4 break-words text-base font-semibold group-hover:text-blue-700 dark:group-hover:text-blue-300">
                      {org.name}
                    </h2>
                    <p className="mt-2 line-clamp-2 min-h-10 break-words text-sm leading-5 text-zinc-500">
                      {org.description || "团队的项目与接口文档，集中在这里。"}
                    </p>
                    <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-zinc-100 pt-4 text-xs text-zinc-500 dark:border-zinc-800">
                      <span>
                        <strong className="font-medium text-zinc-700 dark:text-zinc-300">
                          {org._count?.projects ?? 0}
                        </strong>{" "}
                        个项目
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="size-3.5" aria-hidden />
                        {org._count?.members ?? 0} 位成员
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyList
                icon={needle ? undefined : Building2}
                title={needle ? "没有找到匹配的组织" : "创建你的第一个组织"}
                description={
                  needle
                    ? "换个关键词，或清空搜索查看全部组织。"
                    : "组织是团队共同的工作空间，用它管理项目和协作成员。"
                }
              >
                {needle ? (
                  <Button variant="outline" onClick={() => setQuery("")}>
                    清空搜索
                  </Button>
                ) : (
                  <Button onClick={() => setDialogOpen(true)}>
                    <Plus className="size-4" />
                    创建组织
                  </Button>
                )}
              </EmptyList>
            )}
          </>
        )
      )}
      <CreateWorkspaceDialog
        kind="组织"
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreate={async (input) => {
          const created = await apiFetch<Organization>("/api/organizations", {
            method: "POST",
            body: JSON.stringify(input),
          });
          request.current?.abort();
          setLoading(false);
          setLoaded(true);
          setOrganizations((previous) => [
            created,
            ...previous.filter((org) => org.id !== created.id),
          ]);
          setQuery("");
          setNotice(`已创建「${created.name}」`);
        }}
      />
    </div>
  );
}
