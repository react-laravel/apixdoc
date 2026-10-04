"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  FilePlus,
  Eye,
  Loader2,
  MoreHorizontal,
  Settings,
  X,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { EndpointSidebar } from "@/components/endpoint-sidebar";
import { ProjectPublications } from "@/components/project-publications";
import { ProjectRecycleBin } from "@/components/project-recycle-bin";
import { ProjectTransfer } from "@/components/project-transfer";
import { CreateFolderDialog } from "@/components/create-folder-dialog";
import { CreateEndpointDialog } from "@/components/create-endpoint-dialog";
import { useProjectPage } from "@/hooks/useProjectPage";
import { cn } from "@/lib/utils";

function WorkspaceLoading() {
  return (
    <div role="status" className="flex min-h-40 flex-1 items-center justify-center gap-2 p-6 text-sm text-zinc-500">
      <Loader2 aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
      正在加载工作台…
    </div>
  );
}

const EndpointDetail = dynamic(
  () => import("@/components/endpoint-detail").then((module) => module.EndpointDetail),
  { loading: WorkspaceLoading },
);
const DocumentationView = dynamic(
  () => import("@/components/documentation/documentation-view").then((module) => module.DocumentationView),
  { loading: WorkspaceLoading },
);
const ProjectSettings = dynamic(
  () => import("@/components/project-settings").then((module) => module.ProjectSettings),
  { loading: () => <p role="status" className="p-3 text-center text-sm text-zinc-500">正在加载项目设置…</p> },
);

export default function ProjectPage() {
  const params = useParams<{ id: string }>();
  return <ProjectWorkspace key={params.id} />;
}

function ProjectWorkspace() {
  const {
    project,
    loading,
    loadError,
    selectedEndpointId,
    selectedEndpoint,
    allEndpoints,
    saveError,
    setSaveError,
    fetchProject,
    handleSelectEndpoint,
    handleReorder,
    handleCreateFolder,
    handleDeleteFolder,
    handleRenameFolder,
    handleCreateEndpoint,
    handleSaveEndpoint,
    handleDocumentRestored,
    handleCopyEndpoint,
    handleDeleteEndpoint,
    handleSaveSettings,
  } = useProjectPage();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null);
  useEffect(() => {
    if (!restoreNotice) return;
    const timer = window.setTimeout(() => setRestoreNotice(null), 8000);
    return () => window.clearTimeout(timer);
  }, [restoreNotice]);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [endpointDialogOpen, setEndpointDialogOpen] = useState(false);
  const [endpointFolderId, setEndpointFolderId] = useState<string | null>(null);
  const hasDraft = useRef(false);
  const [endpointAction, setEndpointAction] = useState(false);
  const actionRef = useRef(false);

  const canLeave = () =>
    !hasDraft.current || window.confirm("有未保存的修改，确定放弃这些修改吗？");
  const selectEndpoint = (id: string | null) => {
    if (id === selectedEndpointId || !canLeave()) return;
    hasDraft.current = false;
    handleSelectEndpoint(id);
  };
  const createEndpoint = (folderId: string | null) => {
    if (!canLeave()) return;
    setEndpointFolderId(folderId);
    setEndpointDialogOpen(true);
  };

  if (loading) {
    return (
      <div
        role="status"
        className="flex h-full items-center justify-center gap-2 text-sm text-zinc-500"
      >
        <Loader2 aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
        正在加载项目…
      </div>
    );
  }
  if (!project) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <BookOpen className="size-10 text-zinc-300" />
        <p role={loadError ? "alert" : undefined}>
          {loadError || "项目不存在或已被删除"}
        </p>
        <div className="flex gap-2">
          {loadError && <Button onClick={fetchProject}>重新加载</Button>}
          <Link
            className={buttonVariants({ variant: "outline" })}
            href="/dashboard/projects"
          >
            返回项目列表
          </Link>
        </div>
      </div>
    );
  }

  if (project.permissions && !project.permissions.canEdit)
    return <DocumentationView project={project} embedded />;

  return (
    <div className="-m-3 flex h-[calc(100%+1.5rem)] min-h-0 flex-col sm:-m-6 sm:h-[calc(100%+3rem)]">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-200 bg-white px-3 py-2 sm:px-4 dark:border-zinc-800 dark:bg-zinc-900">
        <Link
          href="/dashboard/projects"
          aria-label="返回项目列表"
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon" }),
            "size-8 shrink-0",
          )}
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0 flex-1" title={project.name}>
          <h1 className="truncate text-sm font-semibold">{project.name}</h1>
          <p className="mt-0.5 truncate text-xs text-zinc-500">
            {allEndpoints.length} 个接口 ·{" "}
            {project.baseUrl || "尚未配置基础 URL"}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 md:hidden"
          aria-label="更多项目操作"
          aria-expanded={actionsOpen}
          aria-controls="project-toolbar-actions"
          onClick={() => setActionsOpen((open) => !open)}
        >
          <MoreHorizontal className="size-4" />
        </Button>
        <div
          id="project-toolbar-actions"
          role="group"
          aria-label="项目操作"
          className={cn(
            "w-full min-w-0 flex-wrap items-center gap-1 border-t border-zinc-100 pt-2 md:flex md:w-auto md:flex-nowrap md:border-0 md:pt-0 dark:border-zinc-800",
            actionsOpen ? "flex" : "hidden",
          )}
        >
          <ProjectPublications
            project={project}
            beforePublish={() =>
              !hasDraft.current ||
              window.confirm(
                "当前接口有未保存修改，发布只包含服务器上已保存的内容。继续检查发布吗？",
              )
            }
            onChanged={fetchProject}
          />
          <ProjectRecycleBin
            compact
            projectId={project.id}
            beforeRestore={canLeave}
            onRestored={(updated) => {
              setRestoreNotice(updated.restoreNotice || "接口已恢复");
              hasDraft.current = false;
              handleDocumentRestored(updated);
            }}
          />
          <ProjectTransfer
            compact
            project={project}
            beforeImport={canLeave}
            onReload={async () => {
              hasDraft.current = false;
              handleSelectEndpoint(null);
              await fetchProject();
            }}
          />
          <Link
            href={`/docs/${project.id}?preview=1`}
            target="_blank"
            aria-label="内部预览"
            title="内部预览"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "md:px-2 lg:px-3")}
          >
            <Eye className="size-3.5" />
            <span className="md:hidden lg:inline">内部预览</span>
          </Link>
          {project.permissions?.canConfigure !== false && (
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 gap-2 md:px-2 lg:px-3"
              aria-label="项目设置"
              title="项目设置"
              onClick={() => {
                setSaveError(null);
                setSettingsOpen(true);
              }}
            >
              <Settings className="size-4" />
              <span className="md:hidden lg:inline">项目设置</span>
            </Button>
          )}
        </div>
      </div>

      {restoreNotice && (
        <div
          role="status"
          className="flex items-center gap-2 border-b border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
        >
          <span className="flex-1">{restoreNotice}</span>
          <button
            type="button"
            aria-label="关闭恢复提示"
            onClick={() => setRestoreNotice(null)}
          >
            <X className="size-4" />
          </button>
        </div>
      )}
      {(saveError || loadError) && !settingsOpen && (
        <div
          role="alert"
          className="flex shrink-0 flex-wrap items-center gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400"
        >
          <span className="min-w-0 flex-1">{saveError || loadError}</span>
          {loadError && (
            <Button variant="ghost" size="sm" onClick={fetchProject}>
              重试
            </Button>
          )}
          {saveError && (
            <button
              aria-label="关闭错误提示"
              onClick={() => setSaveError(null)}
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside
          aria-label="接口目录"
          className={cn(
            "min-h-0 w-full shrink-0 md:block md:w-72 lg:w-80",
            selectedEndpoint && "hidden",
          )}
        >
          <EndpointSidebar
            folders={project.folders}
            endpoints={allEndpoints}
            selectedEndpointId={selectedEndpointId}
            onSelectEndpoint={selectEndpoint}
            onCreateFolder={() => setFolderDialogOpen(true)}
            onCreateEndpoint={createEndpoint}
            onDeleteFolder={handleDeleteFolder}
            onRenameFolder={handleRenameFolder}
            onReorder={handleReorder}
          />
        </aside>
        <section
          aria-label="接口详情"
          className={cn(
            "min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-zinc-50/60 dark:bg-zinc-950",
            selectedEndpoint ? "flex" : "hidden md:flex",
          )}
        >
          {selectedEndpoint ? (
            <>
              <div className="shrink-0 border-b border-zinc-200 px-3 py-2 md:hidden dark:border-zinc-800">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2"
                  onClick={() => selectEndpoint(null)}
                >
                  <ArrowLeft className="size-4" />
                  接口目录
                </Button>
              </div>
              <EndpointDetail
                key={selectedEndpoint.id}
                endpoint={selectedEndpoint}
                projectId={project.id}
                environments={project.environments}
                projectBaseUrl={project.baseUrl}
                globalHeaders={project.globalHeaders ?? []}
                globalParams={project.globalParams ?? []}
                onSave={handleSaveEndpoint}
                onRestored={(updated) =>
                  handleDocumentRestored(
                    updated as import("@/lib/types").Endpoint,
                  )
                }
                actionBusy={endpointAction}
                onCopy={async () => {
                  if (actionRef.current || !canLeave()) return;
                  actionRef.current = true;
                  setEndpointAction(true);
                  try {
                    if (await handleCopyEndpoint()) hasDraft.current = false;
                  } finally {
                    actionRef.current = false;
                    setEndpointAction(false);
                  }
                }}
                onDelete={async () => {
                  if (actionRef.current) return;
                  actionRef.current = true;
                  setEndpointAction(true);
                  try {
                    if (await handleDeleteEndpoint()) hasDraft.current = false;
                  } finally {
                    actionRef.current = false;
                    setEndpointAction(false);
                  }
                }}
                onDirtyChange={(dirty) => {
                  hasDraft.current = dirty;
                }}
              />
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <div className="mb-5 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
                <BookOpen className="size-8 text-zinc-400" />
              </div>
              <h2 className="text-lg font-semibold">
                {allEndpoints.length
                  ? "开始浏览接口文档"
                  : "创建你的第一个接口"}
              </h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-500">
                从左侧目录选择接口，编辑请求参数、维护响应示例或发起在线测试。
              </p>
              <Button
                className="mt-6 gap-2"
                onClick={() => createEndpoint(null)}
              >
                <FilePlus className="size-4" />
                新建接口
              </Button>
            </div>
          )}
        </section>
      </div>
      {settingsOpen && (
        <ProjectSettings
          project={project}
          canPublish={project.permissions?.canManage !== false}
          onSave={handleSaveSettings}
          error={saveError}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
        />
      )}
      <CreateFolderDialog
        open={folderDialogOpen}
        onOpenChange={setFolderDialogOpen}
        onCreate={handleCreateFolder}
      />
      <CreateEndpointDialog
        open={endpointDialogOpen}
        onOpenChange={setEndpointDialogOpen}
        folderId={endpointFolderId}
        onCreate={async (data) => {
          const result = await handleCreateEndpoint(data);
          if (!result.error) hasDraft.current = false;
          return result;
        }}
      />
    </div>
  );
}
