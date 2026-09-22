"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { RefreshCw, ArrowRight } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-fetch";
import type { Organization, ProjectListItem } from "@/lib/types";
import {
  PageHeading,
  ListSearch,
  ListSkeleton,
  EmptyList,
  ProjectCard,
} from "@/components/workspace/list-ui";
export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectListItem[]>([]),
    [organizations, setOrganizations] = useState<Organization[]>([]),
    [failed, setFailed] = useState<string[]>([]),
    [loading, setLoading] = useState(true),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState("");
  const [query, setQuery] = useState(""),
    [organization, setOrganization] = useState(""),
    [visibility, setVisibility] = useState("");
  const request = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    try {
      const orgs = await apiFetch<Organization[]>("/api/organizations", {
        signal: controller.signal,
      });
      const results = await Promise.allSettled(
        orgs.map(async (org) =>
          (
            await apiFetch<ProjectListItem[]>(
              `/api/projects?organizationId=${org.id}`,
              { signal: controller.signal },
            )
          ).map((project) => ({ ...project, organization: org })),
        ),
      );
      if (controller.signal.aborted) return;
      setOrganizations(orgs);
      setFailed(
        results.flatMap((result, index) =>
          result.status === "rejected" ? [orgs[index].name] : [],
        ),
      );
      setProjects(
        results
          .flatMap((result) =>
            result.status === "fulfilled" ? result.value : [],
          )
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      );
      setLoaded(true);
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
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return projects.filter(
      (project) =>
        (!organization || project.organization.id === organization) &&
        (!visibility || project.isPublic === (visibility === "public")) &&
        `${project.name} ${project.description} ${project.organization.name}`
          .toLocaleLowerCase()
          .includes(needle),
    );
  }, [projects, query, organization, visibility]);
  const hasFilters = !!(query.trim() || organization || visibility);
  const reset = () => {
    setQuery("");
    setOrganization("");
    setVisibility("");
  };
  const selectClass =
    "h-10 min-w-0 rounded-md border border-zinc-200 bg-white px-3 text-sm focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-zinc-700 dark:bg-zinc-900";
  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-6">
      <PageHeading
        title="项目管理"
        description="找到需要的项目，进入文档与调试工作台。"
      >
        <Link
          href="/dashboard"
          className={buttonVariants({ variant: "outline" })}
        >
          进入组织创建项目
          <ArrowRight className="size-4" />
        </Link>
      </PageHeading>
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full min-w-0 sm:w-auto sm:flex-1">
          <ListSearch
            value={query}
            onChange={setQuery}
            label="搜索项目"
            placeholder="搜索项目、描述或所属组织"
          />
        </div>
        <select
          aria-label="所属组织"
          className={`${selectClass} w-0 flex-1 sm:w-auto sm:max-w-48 sm:flex-none`}
          value={organization}
          onChange={(e) => setOrganization(e.target.value)}
        >
          <option value="">全部组织</option>
          {organizations.map((org) => (
            <option key={org.id} value={org.id}>
              {org.name}
            </option>
          ))}
        </select>
        <select
          aria-label="访问范围"
          className={`${selectClass} flex-1 sm:flex-none`}
          value={visibility}
          onChange={(e) => setVisibility(e.target.value)}
        >
          <option value="">全部范围</option>
          <option value="public">公开文档</option>
          <option value="private">团队可见</option>
        </select>
        <Button
          variant="outline"
          size="icon"
          className="size-10 shrink-0"
          aria-label="刷新项目列表"
          disabled={loading}
          onClick={load}
        >
          <RefreshCw
            className={`size-4 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`}
          />
        </Button>
      </div>
      {(error || failed.length > 0) && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300"
        >
          <span className="min-w-0 flex-1 break-words">
            {error ||
              `部分项目暂时无法加载：${failed.join("、")}。其他项目仍可使用。`}
          </span>
          <Button variant="ghost" size="sm" disabled={loading} onClick={load}>
            重新加载
          </Button>
        </div>
      )}
      {!loaded && loading ? (
        <ListSkeleton />
      ) : (
        loaded && (
          <>
            <div className="flex items-center justify-between gap-2">
              <p role="status" className="text-xs text-zinc-500">
                {hasFilters
                  ? `找到 ${filtered.length} 个项目`
                  : `${projects.length} 个项目`}
                {failed.length ? " · 部分组织未加载" : ""}
              </p>
              {hasFilters && (
                <Button variant="ghost" size="sm" onClick={reset}>
                  清空筛选
                </Button>
              )}
            </div>
            {filtered.length ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {filtered.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    organization={project.organization}
                  />
                ))}
              </div>
            ) : (
              <EmptyList
                title={
                  hasFilters
                    ? "没有找到匹配的项目"
                    : failed.length
                      ? "项目暂时无法显示"
                      : "还没有项目"
                }
                description={
                  hasFilters
                    ? "试试其他关键词或组织，也可以清空筛选重新查找。"
                    : failed.length
                      ? "部分组织加载失败，请重试后查看。"
                      : "进入一个组织，为团队创建第一个接口项目。"
                }
              >
                {hasFilters ? (
                  <Button variant="outline" onClick={reset}>
                    清空筛选
                  </Button>
                ) : failed.length ? (
                  <Button onClick={load} disabled={loading}>
                    重新加载
                  </Button>
                ) : (
                  <Link href="/dashboard" className={buttonVariants()}>
                    前往组织
                    <ArrowRight className="size-4" />
                  </Link>
                )}
              </EmptyList>
            )}
          </>
        )
      )}
    </div>
  );
}
