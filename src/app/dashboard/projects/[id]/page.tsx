"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EndpointSidebar } from "@/components/endpoint-sidebar";
import { EndpointDetail } from "@/components/endpoint-detail";
import { ProjectSettings } from "@/components/project-settings";
import { CreateFolderDialog } from "@/components/create-folder-dialog";
import { CreateEndpointDialog } from "@/components/create-endpoint-dialog";
import { useProjectPage } from "@/hooks/useProjectPage";

export default function ProjectPage() {
  const {
    project,
    loading,
    selectedEndpointId,
    selectedEndpoint,
    allEndpoints,
    saveError,
    setSaveError,
    handleSelectEndpoint,
    handleReorder,
    handleCreateFolder,
    handleDeleteFolder,
    handleRenameFolder,
    handleCreateEndpoint,
    handleSaveEndpoint,
    handleSaveSettings,
  } = useProjectPage();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  // Create folder dialog state
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);

  // Create endpoint dialog state
  const [endpointDialogOpen, setEndpointDialogOpen] = useState(false);
  const [endpointFolderId, setEndpointFolderId] = useState<string | null>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 768px)");
    const updateIsDesktop = () => setIsDesktop(mediaQuery.matches);
    updateIsDesktop();
    mediaQuery.addEventListener("change", updateIsDesktop);
    return () => mediaQuery.removeEventListener("change", updateIsDesktop);
  }, []);

  useEffect(() => {
    const handleOpenSettings = () => setSettingsOpen(true);
    window.addEventListener("open-settings", handleOpenSettings);
    return () => window.removeEventListener("open-settings", handleOpenSettings);
  }, []);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-zinc-500">加载中...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-zinc-500">项目不存在</p>
      </div>
    );
  }

  return (
    <div className="-m-3 flex h-[calc(100%+1.5rem)] min-h-0 flex-col sm:-m-6 sm:h-[calc(100%+3rem)]">
      {/* Main content */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
        {/* Sidebar */}
        <div className="min-h-0 flex-1 border-b border-zinc-200 md:h-auto md:w-72 md:flex-none md:border-b-0">
          <EndpointSidebar
            folders={project.folders}
            endpoints={allEndpoints}
            selectedEndpointId={selectedEndpointId}
            onSelectEndpoint={handleSelectEndpoint}
            onCreateFolder={() => setFolderDialogOpen(true)}
            onCreateEndpoint={(folderId) => {
              setEndpointFolderId(folderId);
              setEndpointDialogOpen(true);
            }}
            onDeleteFolder={handleDeleteFolder}
            onRenameFolder={handleRenameFolder}
            onReorder={handleReorder}
          />
        </div>

        {/* Desktop Detail */}
        <div className="hidden min-h-0 flex-1 overflow-hidden md:block">
          {selectedEndpoint ? (
            <>
              {saveError && (
                <div className="mx-3 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400 sm:mx-6">
                  {saveError}
                  <button
                    type="button"
                    onClick={() => setSaveError(null)}
                    className="ml-2 text-red-400 hover:text-red-600"
                  >
                    关闭
                  </button>
                </div>
              )}
              <EndpointDetail
                key={selectedEndpoint.id}
                endpoint={selectedEndpoint}
                projectBaseUrl={project.baseUrl}
                globalHeaders={project.globalHeaders ?? []}
                globalParams={project.globalParams ?? []}
                onSave={handleSaveEndpoint}
              />
            </>
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-zinc-400">
              选择一个接口查看详情，或创建新接口
            </div>
          )}
        </div>
      </div>

      {/* Mobile Endpoint Detail */}
      {!isDesktop && selectedEndpoint && (
        <Dialog open onOpenChange={(open) => !open && handleSelectEndpoint(null)}>
          <DialogContent className="h-[92dvh] max-w-[calc(100vw-1rem)] overflow-hidden p-0 md:hidden">
            <DialogHeader className="sr-only">
              <DialogTitle>
                {selectedEndpoint.name || selectedEndpoint.path}
              </DialogTitle>
            </DialogHeader>
            {saveError && (
              <div className="mx-4 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                {saveError}
                <button
                  type="button"
                  onClick={() => setSaveError(null)}
                  className="ml-2 text-red-400 hover:text-red-600"
                >
                  关闭
                </button>
              </div>
            )}
            <EndpointDetail
              key={`mobile-${selectedEndpoint.id}`}
              endpoint={selectedEndpoint}
              projectBaseUrl={project.baseUrl}
              globalHeaders={project.globalHeaders ?? []}
              globalParams={project.globalParams ?? []}
              onSave={handleSaveEndpoint}
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Project Settings */}
      {settingsOpen && (
        <ProjectSettings
          project={project}
          onSave={handleSaveSettings}
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
        />
      )}

      {/* Create Folder Dialog */}
      <CreateFolderDialog
        open={folderDialogOpen}
        onOpenChange={setFolderDialogOpen}
        onCreate={handleCreateFolder}
      />

      {/* Create Endpoint Dialog */}
      <CreateEndpointDialog
        open={endpointDialogOpen}
        onOpenChange={setEndpointDialogOpen}
        folderId={endpointFolderId}
        onCreate={handleCreateEndpoint}
      />
    </div>
  );
}
