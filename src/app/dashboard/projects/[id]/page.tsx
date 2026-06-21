"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { EndpointSidebar } from "@/components/endpoint-sidebar";
import { EndpointDetail } from "@/components/endpoint-detail";
import { ProjectSettings } from "@/components/project-settings";
import { HTTP_METHODS } from "@/lib/utils";
import { Settings } from "lucide-react";

interface Folder {
  id: string;
  name: string;
  parentId?: string | null;
  endpoints?: Endpoint[];
  children?: Folder[];
}

interface Endpoint {
  id: string;
  name: string;
  method: string;
  path: string;
  description: string;
  folderId: string | null;
  parameters?: Array<{
    id?: string;
    name: string;
    type: string;
    required: boolean;
    location: string;
    description: string;
    example: string;
  }>;
  requestBody?: {
    id?: string;
    contentType: string;
    schema: string;
    example: string;
  } | null;
  responses?: Array<{
    id?: string;
    statusCode: number;
    description: string;
    contentType: string;
    example: string;
  }>;
}

interface Project {
  id: string;
  name: string;
  description: string;
  baseUrl: string;
  isPublic: boolean;
  environments: Array<{
    id?: string;
    name: string;
    baseUrl: string;
    variables: string;
  }>;
  globalHeaders: Array<{
    id?: string;
    key: string;
    value: string;
    description: string;
    enabled: boolean;
  }>;
  globalParams: Array<{
    id?: string;
    name: string;
    value: string;
    location: string;
    description: string;
    enabled: boolean;
  }>;
  folders: Folder[];
  endpoints: Endpoint[];
}

export default function ProjectPage() {
  const params = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedEndpointId, setSelectedEndpointId] = useState<string | null>(
    null,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  // Create folder dialog
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderError, setFolderError] = useState("");

  // Create endpoint dialog
  const [endpointDialogOpen, setEndpointDialogOpen] = useState(false);
  const [endpointName, setEndpointName] = useState("");
  const [endpointMethod, setEndpointMethod] = useState("GET");
  const [endpointPath, setEndpointPath] = useState("");
  const [endpointFolderId, setEndpointFolderId] = useState<string | null>(null);

  const fetchProject = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${params.id}`);
      const json = await res.json();
      if (json.success) {
        setProject(json.data);
      }
    } catch {
      // handled silently
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 768px)");
    const updateIsDesktop = () => setIsDesktop(mediaQuery.matches);
    updateIsDesktop();
    mediaQuery.addEventListener("change", updateIsDesktop);
    return () => mediaQuery.removeEventListener("change", updateIsDesktop);
  }, []);

  const handleReorder = async (
    folderUpdates: Array<{
      id: string;
      order: number;
      parentId?: string | null;
    }>,
    endpointUpdates: Array<{
      id: string;
      order: number;
      folderId: string | null;
    }>,
  ) => {
    if (!project) return;

    // Persist to server, then refresh to get correct nested structure
    try {
      await fetch(`/api/projects/${project.id}/reorder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folders: folderUpdates.length > 0 ? folderUpdates : undefined,
          endpoints: endpointUpdates.length > 0 ? endpointUpdates : undefined,
        }),
      });
      await fetchProject();
    } catch {
      await fetchProject();
    }
  };

  const handleCreateFolder = async () => {
    const normalizedName = folderName.trim();
    if (!normalizedName || !project) return;

    const exists = project.folders.some(
      (folder) => folder.name.trim().toLowerCase() === normalizedName.toLowerCase(),
    );
    if (exists) {
      setFolderError("文件夹名称不能重复");
      return;
    }

    try {
      const res = await fetch("/api/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: normalizedName, projectId: project.id }),
      });
      const json = await res.json();
      if (json.success) {
        setProject((prev) =>
          prev ? { ...prev, folders: [...prev.folders, json.data] } : prev,
        );
        setFolderDialogOpen(false);
        setFolderName("");
        setFolderError("");
      } else {
        setFolderError(json.error || "创建文件夹失败");
      }
    } catch {
      setFolderError("创建文件夹失败");
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    if (!project) return;

    if (!window.confirm("确定要删除此文件夹吗？子文件夹也会被删除。")) {
      return;
    }

    try {
      const res = await fetch(`/api/folders/${folderId}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (json.success) {
        if (selectedEndpointId) {
          const deletedFolderIds = new Set<string>();
          const collectDeletedFolderIds = (parentId: string) => {
            deletedFolderIds.add(parentId);
            project.folders
              .filter((folder) => folder.parentId === parentId)
              .forEach((folder) => collectDeletedFolderIds(folder.id));
          };
          collectDeletedFolderIds(folderId);

          const selectedEndpoint = allEndpoints.find(
            (endpoint) => endpoint.id === selectedEndpointId,
          );
          if (
            selectedEndpoint?.folderId &&
            deletedFolderIds.has(selectedEndpoint.folderId)
          ) {
            setSelectedEndpointId(null);
          }
        }
        await fetchProject();
      }
    } catch {
      await fetchProject();
    }
  };

  const handleCreateEndpoint = async () => {
    if (!endpointPath.trim() || !project) return;

    try {
      const res = await fetch("/api/endpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: endpointName,
          method: endpointMethod,
          path: endpointPath,
          projectId: project.id,
          folderId: endpointFolderId,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setProject((prev) =>
          prev ? { ...prev, endpoints: [...prev.endpoints, json.data] } : prev,
        );
        setEndpointDialogOpen(false);
        setEndpointName("");
        setEndpointMethod("GET");
        setEndpointPath("");
        setEndpointFolderId(null);
        setSelectedEndpointId(json.data.id);
      }
    } catch {
      // handled silently
    }
  };

  const handleSaveEndpoint = async (data: Partial<Endpoint>) => {
    if (!project || !selectedEndpointId) return;

    try {
      // Route to the correct API based on what's being saved
      if (data.parameters) {
        const res = await fetch(`/api/endpoints/${selectedEndpointId}/params`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ params: data.parameters }),
        });
        const json = await res.json();
        if (json.success) {
          setProject((prev) =>
            prev
              ? {
                  ...prev,
                  endpoints: prev.endpoints.map((ep) =>
                    ep.id === selectedEndpointId
                      ? { ...ep, parameters: json.data }
                      : ep,
                  ),
                }
              : prev,
          );
        }
        return;
      }

      if (data.requestBody) {
        const res = await fetch(`/api/endpoints/${selectedEndpointId}/body`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data.requestBody),
        });
        const json = await res.json();
        if (json.success) {
          setProject((prev) =>
            prev
              ? {
                  ...prev,
                  endpoints: prev.endpoints.map((ep) =>
                    ep.id === selectedEndpointId
                      ? { ...ep, requestBody: json.data }
                      : ep,
                  ),
                }
              : prev,
          );
        }
        return;
      }

      if (data.responses) {
        const res = await fetch(
          `/api/endpoints/${selectedEndpointId}/responses`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ responses: data.responses }),
          },
        );
        const json = await res.json();
        if (json.success) {
          setProject((prev) =>
            prev
              ? {
                  ...prev,
                  endpoints: prev.endpoints.map((ep) =>
                    ep.id === selectedEndpointId
                      ? { ...ep, responses: json.data }
                      : ep,
                  ),
                }
              : prev,
          );
        }
        return;
      }

      // Basic info update (name, method, path, description)
      const res = await fetch(`/api/endpoints/${selectedEndpointId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (json.success) {
        setProject((prev) =>
          prev
            ? {
                ...prev,
                endpoints: prev.endpoints.map((ep) =>
                  ep.id === selectedEndpointId ? { ...ep, ...json.data } : ep,
                ),
              }
            : prev,
        );
      }
    } catch {
      // handled silently
    }
  };

  const handleSaveSettings = async (data: Partial<Project>) => {
    if (!project) return;

    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (json.success) {
        setProject((prev) => (prev ? { ...prev, ...json.data } : prev));
        setSettingsOpen(false);
      }
    } catch {
      // handled silently
    }
  };

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

  // Recursively collect endpoints from all folders (including nested)
  const collectFolderEndpoints = (folders: Folder[]): Endpoint[] =>
    folders.flatMap((f) => [
      ...(f.endpoints ?? []),
      ...collectFolderEndpoints(f.children ?? []),
    ]);

  const allEndpoints = [
    ...project.endpoints,
    ...collectFolderEndpoints(project.folders),
  ];

  const selectedEndpoint = allEndpoints.find(
    (ep) => ep.id === selectedEndpointId,
  );

  return (
    <div className="-m-3 flex h-[calc(100%+1.5rem)] min-h-0 flex-col sm:-m-6 sm:h-[calc(100%+3rem)]">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-white px-3 py-2 sm:px-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold sm:text-lg">{project.name}</h1>
          <p className="truncate text-xs text-zinc-500 sm:hidden">{project.baseUrl}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setSettingsOpen(true)}>
          <Settings className="mr-1 h-4 w-4" />
          设置
        </Button>
      </div>

      {/* Main content */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
        {/* Sidebar */}
        <div className="min-h-0 flex-1 border-b border-zinc-200 md:h-auto md:w-72 md:flex-none md:border-b-0">
          <EndpointSidebar
            folders={project.folders}
            endpoints={allEndpoints}
            selectedEndpointId={selectedEndpointId}
            onSelectEndpoint={setSelectedEndpointId}
            onCreateFolder={() => {
              setFolderError("");
              setFolderDialogOpen(true);
            }}
            onCreateEndpoint={(folderId) => {
              setEndpointFolderId(folderId);
              setEndpointDialogOpen(true);
            }}
            onDeleteFolder={handleDeleteFolder}
            onReorder={handleReorder}
          />
        </div>

        {/* Detail */}
        <div className="hidden min-h-0 flex-1 overflow-hidden md:block">
          {selectedEndpoint ? (
            <EndpointDetail
              key={selectedEndpoint.id}
              endpoint={selectedEndpoint}
              projectBaseUrl={project.baseUrl}
              globalHeaders={project.globalHeaders ?? []}
              globalParams={project.globalParams ?? []}
              onSave={handleSaveEndpoint}
            />
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-zinc-400">
              选择一个接口查看详情，或创建新接口
            </div>
          )}
        </div>
      </div>


      {/* Mobile Endpoint Detail */}
      {!isDesktop && selectedEndpoint && (
        <Dialog open onOpenChange={(open) => !open && setSelectedEndpointId(null)}>
          <DialogContent className="h-[92dvh] max-w-[calc(100vw-1rem)] overflow-hidden p-0 md:hidden">
            <DialogHeader className="sr-only">
              <DialogTitle>{selectedEndpoint.name || selectedEndpoint.path}</DialogTitle>
            </DialogHeader>
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
      <Dialog
        open={folderDialogOpen}
        onOpenChange={(open) => {
          setFolderDialogOpen(open);
          if (!open) {
            setFolderError("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建文件夹</DialogTitle>
          </DialogHeader>
          <div>
            <label className="mb-1 block text-sm font-medium">文件夹名称</label>
            <Input
              value={folderName}
              onChange={(e) => {
                setFolderName(e.target.value);
                setFolderError("");
              }}
              placeholder="输入文件夹名称"
            />
            {folderError && (
              <p className="mt-1 text-xs text-red-500">{folderError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setFolderDialogOpen(false)}
            >
              取消
            </Button>
            <Button onClick={handleCreateFolder}>创建</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Endpoint Dialog */}
      <Dialog open={endpointDialogOpen} onOpenChange={setEndpointDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建接口</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">接口名称</label>
              <Input
                value={endpointName}
                onChange={(e) => setEndpointName(e.target.value)}
                placeholder="如：获取用户列表"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-medium">方法</label>
                <Select
                  value={endpointMethod}
                  onValueChange={setEndpointMethod}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HTTP_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <label className="mb-1 block text-sm font-medium">路径</label>
                <Input
                  value={endpointPath}
                  onChange={(e) => setEndpointPath(e.target.value)}
                  placeholder="/api/users"
                  className="font-mono"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEndpointDialogOpen(false)}
            >
              取消
            </Button>
            <Button onClick={handleCreateEndpoint}>创建</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
