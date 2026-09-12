"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  FilePlus,
  Loader2,
  Settings,
  X,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { EndpointSidebar } from "@/components/endpoint-sidebar";
import { DocumentationView } from "@/components/documentation/documentation-view";
import { ProjectTransfer } from "@/components/project-transfer";
import { EndpointDetail } from "@/components/endpoint-detail";
import { ProjectSettings } from "@/components/project-settings";
import { CreateFolderDialog } from "@/components/create-folder-dialog";
import { CreateEndpointDialog } from "@/components/create-endpoint-dialog";
import { useProjectPage } from "@/hooks/useProjectPage";
import { cn } from "@/lib/utils";

export default function ProjectPage() {
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
    handleCopyEndpoint,
    handleDeleteEndpoint,
    handleSaveSettings,
  } = useProjectPage();
  const [settingsOpen, setSettingsOpen] = useState(false);
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
        <Loader2 className="size-4 animate-spin" />
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
      <div className="flex shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-3 py-3 sm:px-5 dark:border-zinc-800 dark:bg-zinc-900">
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
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">{project.name}</h1>
          <p className="mt-0.5 truncate text-xs text-zinc-500">
            {allEndpoints.length} 个接口 ·{" "}
            {project.baseUrl || "尚未配置基础 URL"}
          </p>
        </div>
        <ProjectTransfer project={project} onReload={fetchProject} />
        <Link
          href={`/docs/${project.id}`}
          target="_blank"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          文档预览
        </Link>
        {project.permissions?.canConfigure !== false && (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 gap-2"
            onClick={() => {
              setSaveError(null);
              setSettingsOpen(true);
            }}
          >
            <Settings className="size-4" />
            <span className="hidden sm:inline">项目设置</span>
            <span className="sm:hidden">设置</span>
          </Button>
        )}
      </div>

      {(saveError || loadError) && !settingsOpen && (
        <div
          role="alert"
          className="flex shrink-0 items-center gap-3 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400"
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
