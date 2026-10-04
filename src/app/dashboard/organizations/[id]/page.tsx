"use client";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft, Plus, Users, FolderOpen, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { CreateWorkspaceDialog } from "@/components/workspace/create-workspace-dialog";
import {
  PageHeading,
  ListSearch,
  ListSkeleton,
  EmptyList,
  ProjectCard,
} from "@/components/workspace/list-ui";
import { apiFetch, ApiError } from "@/lib/api-fetch";
import type { Organization, ProjectListItem } from "@/lib/types";
type OrganizationProject = Pick<
  ProjectListItem,
  "id" | "name" | "description" | "isPublic"
> & { _count?: ProjectListItem["_count"] };
const TeamManagement = dynamic(
  () =>
    import("@/components/team-management").then((module) => module.TeamManagement),
  {
    loading: () => (
      <p role="status" className="text-sm text-zinc-500">正在加载团队管理…</p>
    ),
  },
);
export default function OrganizationDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <OrganizationWorkspace key={id} id={id} />;
}
function OrganizationWorkspace({ id }: { id: string }) {
  const [org, setOrg] = useState<Organization | null>(null),
    [projects, setProjects] = useState<OrganizationProject[]>([]),
    [projectsLoaded, setProjectsLoaded] = useState(false),
    [loading, setLoading] = useState(true),
    [orgError, setOrgError] = useState(""),
    [projectError, setProjectError] = useState(""),
    [projectDialogOpen, setProjectDialogOpen] = useState(false),
    [query, setQuery] = useState(""),
    [tab, setTab] = useState("projects"),
    [notice, setNotice] = useState("");
  const request = useRef<AbortController | null>(null);
  const lifecycle = useRef({ active: false });
  const fetchData = useCallback(async () => {
    if (!lifecycle.current.active) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setOrgError("");
    setProjectError("");
    setNotice("");
    try {
      const [orgResult, projectResult] = await Promise.allSettled([
        apiFetch<Organization>(`/api/organizations/${encodeURIComponent(id)}`, {
          signal: controller.signal,
        }),
        apiFetch<OrganizationProject[]>(
          `/api/projects?organizationId=${encodeURIComponent(id)}`,
          { signal: controller.signal },
        ),
      ]);
      if (controller.signal.aborted) return;
      if (orgResult.status === "fulfilled") setOrg(orgResult.value);
      else {
        setOrgError(
          orgResult.reason instanceof Error
            ? orgResult.reason.message
            : "组织信息加载失败",
        );
        if (
          orgResult.reason instanceof ApiError &&
          [401, 403, 404].includes(orgResult.reason.status)
        ) {
          setOrg(null);
          setProjects([]);
          setProjectsLoaded(false);
          throw orgResult.reason;
        }
      }
      if (projectResult.status === "fulfilled") {
        setProjects(projectResult.value);
        setProjectsLoaded(true);
      } else {
        setProjectError(
          projectResult.reason instanceof Error
            ? projectResult.reason.message
            : "项目列表加载失败",
        );
        if (
          projectResult.reason instanceof ApiError &&
          [401, 403, 404].includes(projectResult.reason.status)
        ) {
          setProjects([]);
          setProjectsLoaded(false);
        }
      }
      if (orgResult.status === "rejected") throw orgResult.reason;
      if (projectResult.status === "rejected") throw projectResult.reason;
    } finally {
      if (!controller.signal.aborted) {
        request.current = null;
        setLoading(false);
      }
    }
  }, [id]);
  useEffect(() => {
    const current = { active: true };
    lifecycle.current = current;
    void fetchData().catch(() => {});
    return () => {
      current.active = false;
      request.current?.abort();
    };
  }, [fetchData]);
  useEffect(() => {
    const sync = () =>
      setTab(window.location.hash === "#members" ? "members" : "projects");
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  function changeTab(value: string) {
    setTab(value);
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${window.location.search}${value === "members" ? "#members" : ""}`,
    );
  }
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return projects.filter((project) =>
      `${project.name} ${project.description}`.toLocaleLowerCase().includes(needle),
    );
  }, [projects, query]);
  const error = [
    orgError && `组织信息加载失败：${orgError}`,
    projectError && `项目列表加载失败：${projectError}`,
  ].filter(Boolean).join("；");
  if (loading && !org)
    return (
      <div className="mx-auto max-w-6xl">
        <ListSkeleton />
      </div>
    );
  if (!org)
    return (
      <div className="mx-auto max-w-6xl">
        <EmptyList
          title="暂时无法打开组织"
          description={orgError || "组织不存在或已被删除。"}
        >
          <Button disabled={loading} onClick={() => fetchData().catch(() => {})}>
            重新加载
          </Button>
        </EmptyList>
      </div>
    );
  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-6">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 rounded text-xs text-zinc-500 hover:text-blue-600 focus-visible:outline-2 focus-visible:outline-blue-500"
      >
        <ArrowLeft className="size-3.5" />
        所有组织
      </Link>
      <PageHeading
        title={org.name}
        description={
          org.description || "管理团队项目，邀请成员一起维护接口文档。"
        }
      />
      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
        >
          <span className="min-w-0 flex-1 break-words">
            {error}
            {projectsLoaded && projectError ? "。显示上次加载的项目，内容可能不是最新。" : ""}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={loading}
            onClick={() => fetchData().catch(() => {})}
          >
            重新加载
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
      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList aria-label="组织内容" className="mb-5 h-11">
          <TabsTrigger value="projects" className="gap-2 px-4 py-2">
            <FolderOpen className="size-4" />
            项目{" "}
            <span className="text-xs text-zinc-400">
              {projectsLoaded ? projects.length : "—"}
            </span>
          </TabsTrigger>
          <TabsTrigger value="members" className="gap-2 px-4 py-2">
            <Users className="size-4" />
            成员与设置{" "}
            <span className="text-xs text-zinc-400">{org.members.length}</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="projects" className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <ListSearch
              value={query}
              onChange={setQuery}
              label="搜索组织内项目"
              placeholder="搜索项目名称或描述"
            />
            <Button
              variant="outline"
              size="icon"
              className="size-10 shrink-0"
              aria-label="刷新组织项目"
              disabled={loading}
              onClick={() => fetchData().catch(() => {})}
            >
              <RefreshCw
                aria-hidden
                className={`size-4 ${loading ? "animate-spin motion-reduce:animate-none" : ""}`}
              />
            </Button>
            {org.permissions?.canEdit !== false && (
              <Button
                className="h-10"
                onClick={() => setProjectDialogOpen(true)}
              >
                <Plus className="size-4" />
                创建项目
              </Button>
            )}
          </div>
          <p role="status" className="text-xs text-zinc-500">
            {loading ? "正在刷新 · " : ""}
            {!projectsLoaded
              ? "项目尚未加载"
              : query.trim()
                ? `找到 ${filtered.length} 个项目`
                : `${projects.length} 个项目`}
          </p>
          {!projectsLoaded || (projectError && projects.length === 0) ? (
            <EmptyList
              title="项目暂时无法显示"
              description="项目列表未能加载，请重新加载后再查看。"
            />
          ) : filtered.length ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((project) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  stale={!!projectError}
                />
              ))}
            </div>
          ) : (
            <EmptyList
              title={query.trim() ? "没有匹配的项目" : "这里还没有项目"}
              description={
                query.trim()
                  ? "换个关键词，或清空搜索查看所有项目。"
                  : org.permissions?.canEdit !== false
                    ? "创建第一个项目，开始编写或导入接口文档。"
                    : "团队创建项目后，你可以在这里阅读接口文档。"
              }
            >
              {query.trim() ? (
                <Button variant="outline" onClick={() => setQuery("")}>
                  清空搜索
                </Button>
              ) : (
                org.permissions?.canEdit !== false && (
                  <Button onClick={() => setProjectDialogOpen(true)}>
                    创建项目
                  </Button>
                )
              )}
            </EmptyList>
          )}
        </TabsContent>
        <TabsContent value="members">
          <TeamManagement organization={org} onReload={fetchData} />
        </TabsContent>
      </Tabs>
      <CreateWorkspaceDialog
        kind="项目"
        open={projectDialogOpen}
        onOpenChange={setProjectDialogOpen}
        onCreate={async (input) => {
          const current = lifecycle.current;
          if (!current.active) return;
          const created = await apiFetch<OrganizationProject>("/api/projects", {
            method: "POST",
            body: JSON.stringify({ ...input, organizationId: id }),
          });
          if (!current.active) return;
          // A list read started before creation can omit the newly confirmed project.
          request.current?.abort();
          request.current = null;
          setLoading(false);
          setProjectsLoaded(true);
          setProjectError("");
          setProjects((previous) => [
            { ...created, _count: created._count ?? { endpoints: 0, folders: 0 } },
            ...previous.filter((project) => project.id !== created.id),
          ]);
          setQuery("");
          setNotice(`已创建「${created.name}」`);
        }}
      />
    </div>
  );
}
