"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  type Project,
  type Folder,
  type Endpoint,
  type FolderUpdate,
  type EndpointUpdate,
} from "@/lib/types";

export function useProjectPage() {
  const params = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedEndpointId, setSelectedEndpointId] = useState<string | null>(
    null,
  );
  const [saveError, setSaveError] = useState<string | null>(null);

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

  // Recursively collect endpoints from all folders (including nested)
  const collectFolderEndpoints = (folders: Folder[]): Endpoint[] =>
    folders.flatMap((f) => [
      ...(f.endpoints ?? []),
      ...collectFolderEndpoints(f.children ?? []),
    ]);

  const allEndpoints = project
    ? [...project.endpoints, ...collectFolderEndpoints(project.folders)]
    : [];

  const selectedEndpoint = allEndpoints.find(
    (ep) => ep.id === selectedEndpointId,
  );

  const handleSelectEndpoint = (id: string | null) => {
    setSaveError(null);
    setSelectedEndpointId(id);
  };

  const handleReorder = async (
    folderUpdates: FolderUpdate[],
    endpointUpdates: EndpointUpdate[],
  ) => {
    if (!project) return;

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

  const handleCreateFolder = async (name: string) => {
    if (!project) return;

    const normalizedName = name.trim();
    if (!normalizedName) return;

    const exists = project.folders.some(
      (folder) => folder.name.trim().toLowerCase() === normalizedName.toLowerCase(),
    );
    if (exists) {
      return "文件夹名称不能重复";
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
      } else {
        return json.error || "创建文件夹失败";
      }
    } catch {
      return "创建文件夹失败";
    }
    return null;
  };

  const handleDeleteFolder = async (folderId: string) => {
    if (!project) return;

    if (!window.confirm("确定要删除此文件夹吗？子文件夹也会被删除。")) {
      return false;
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
      return true;
    } catch {
      await fetchProject();
      return false;
    }
  };

  const handleRenameFolder = async (folderId: string, newName: string) => {
    if (!project) return;
    try {
      const res = await fetch(`/api/folders/${folderId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      const json = await res.json();
      if (json.success) {
        setProject((prev) =>
          prev
            ? {
                ...prev,
                folders: prev.folders.map((f) =>
                  f.id === folderId ? { ...f, name: newName } : f,
                ),
              }
            : prev,
        );
      }
    } catch {
      // handled silently
    }
  };

  const handleCreateEndpoint = async (data: {
    name: string;
    method: string;
    path: string;
    description: string;
    folderId: string | null;
  }): Promise<{ error?: string }> => {
    if (!data.path.trim() || !project) {
      return { error: "请填写接口路径" };
    }

    try {
      const res = await fetch("/api/endpoints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          method: data.method,
          path: data.path,
          description: data.description,
          projectId: project.id,
          folderId: data.folderId,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setProject((prev) =>
          prev ? { ...prev, endpoints: [...prev.endpoints, json.data] } : prev,
        );
        return { error: undefined };
      }
      return { error: json.error || "创建接口失败" };
    } catch {
      return { error: "创建接口失败" };
    }
  };

  const handleSaveEndpoint = async (data: Partial<Endpoint>) => {
    if (!project || !selectedEndpointId) return;

    setSaveError(null);

    try {
      if (data.parameters) {
        const res = await fetch(
          `/api/endpoints/${selectedEndpointId}/params`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ params: data.parameters }),
          },
        );
        const json = await res.json();
        if (!json.success) {
          setSaveError(json.error || "保存参数失败");
          return;
        }
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
        return;
      }

      if (data.requestBody) {
        const res = await fetch(`/api/endpoints/${selectedEndpointId}/body`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data.requestBody),
        });
        const json = await res.json();
        if (!json.success) {
          setSaveError(json.error || "保存请求体失败");
          return;
        }
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
        if (!json.success) {
          setSaveError(json.error || "保存响应失败");
          return;
        }
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
        return;
      }

      const res = await fetch(`/api/endpoints/${selectedEndpointId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!json.success) {
        setSaveError(json.error || "保存失败");
        return;
      }
      const updatedFields = Object.fromEntries(
        Object.entries(json.data).filter(([, v]) => v !== undefined),
      );
      setProject((prev) =>
        prev
          ? {
              ...prev,
              endpoints: prev.endpoints.map((ep) =>
                ep.id === selectedEndpointId
                  ? { ...ep, ...updatedFields }
                  : ep,
              ),
            }
          : prev,
      );
    } catch {
      setSaveError("网络错误，请稍后重试");
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
      }
    } catch {
      // handled silently
    }
  };

  return {
    project,
    loading,
    selectedEndpointId,
    selectedEndpoint,
    allEndpoints,
    saveError,
    fetchProject,
    handleSelectEndpoint,
    handleReorder,
    handleCreateFolder,
    handleDeleteFolder,
    handleRenameFolder,
    handleCreateEndpoint,
    handleSaveEndpoint,
    handleSaveSettings,
    setSaveError,
  };
}
