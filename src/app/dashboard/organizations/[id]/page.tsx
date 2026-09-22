"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, Users, FolderOpen, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TeamManagement } from "@/components/team-management";
import { CreateWorkspaceDialog } from "@/components/workspace/create-workspace-dialog";
import {
  PageHeading,
  ListSearch,
  ListSkeleton,
  EmptyList,
  ProjectCard,
} from "@/components/workspace/list-ui";
import { apiFetch } from "@/lib/api-fetch";
import type { Organization, Project } from "@/lib/types";
export default function OrganizationDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <OrganizationWorkspace key={id} id={id} />;
}
function OrganizationWorkspace({ id }: { id: string }) {
  const [org, setOrg] = useState<Organization | null>(null),
    [projects, setProjects] = useState<Project[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [projectDialogOpen, setProjectDialogOpen] = useState(false),
    [query, setQuery] = useState(""),
    [tab, setTab] = useState("projects"),
    [notice, setNotice] = useState("");
  const sequence = useRef(0);
  const fetchData = useCallback(async () => {
    const version = ++sequence.current;
    setError("");
    try {
      const [orgData, projectData] = await Promise.all([
        apiFetch<Organization>(`/api/organizations/${id}`),
        apiFetch<Project[]>(`/api/projects?organizationId=${id}`),
      ]);
      if (version !== sequence.current) return;
      setOrg(orgData);
      setProjects(projectData);
    } catch (e) {
      if (version === sequence.current)
        setError(e instanceof Error ? e.message : "加载失败");
      throw e;
    } finally {
      if (version === sequence.current) setLoading(false);
    }
  }, [id]);
  useEffect(() => {
    void fetchData().catch(() => {});
    const current = sequence;
    return () => {
      current.current++;
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
  if (loading)
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
          description={error || "组织不存在或已被删除。"}
        >
          <Button onClick={() => fetchData().catch(() => {})}>重新加载</Button>
        </EmptyList>
      </div>
    );
  const filtered = projects.filter((project) =>
    `${project.name} ${project.description}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
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
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400"
        >
          {error}
        </p>
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
            <span className="text-xs text-zinc-400">{projects.length}</span>
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
              onClick={() => fetchData().catch(() => {})}
            >
              <RefreshCw className="size-4" />
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
          {filtered.length ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((project) => (
                <ProjectCard key={project.id} project={project} />
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
          const created = await apiFetch<Project>("/api/projects", {
            method: "POST",
            body: JSON.stringify({ ...input, organizationId: id }),
          });
          sequence.current++;
          setProjects((previous) => [
            created,
            ...previous.filter((project) => project.id !== created.id),
          ]);
          setQuery("");
          setNotice(`已创建「${created.name}」`);
        }}
      />
    </div>
  );
}
