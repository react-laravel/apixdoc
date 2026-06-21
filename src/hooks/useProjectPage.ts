"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api-fetch";
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
      const data = await apiFetch<Project>(`/api/projects/${params.id}`);
      setProject(data);
    } catch {
      // network error — will retry on next navigation
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  // Memoize to avoid re-creating arrays on every render
  const allEndpoints = useMemo(() => {
    if (!project) return [];
    const collect = (folders: Folder[]): Endpoint[] =>
      folders.flatMap((f) => [
        ...(f.endpoints ?? []),
        ...collect(f.children ?? []),
      ]);
    return [...project.endpoints, ...collect(project.folders)];
  }, [project]);

  const selectedEndpoint = useMemo(
    () => allEndpoints.find((ep) => ep.id === selectedEndpointId) ?? null,
    [allEndpoints, selectedEndpointId],
  );

  const handleSelectEndpoint = useCallback(
    (id: string | null) => {
      setSaveError(null);
      setSelectedEndpointId(id);
    },
    [],
  );

  const handleReorder = useCallback(
    async (
      folderUpdates: FolderUpdate[],
      endpointUpdates: EndpointUpdate[],
    ) => {
      if (!project) return;

      try {
        await apiFetch(`/api/projects/${project.id}/reorder`, {
          method: "POST",
          body: JSON.stringify({
            folders: folderUpdates.length > 0 ? folderUpdates : undefined,
            endpoints: endpointUpdates.length > 0 ? endpointUpdates : undefined,
          }),
        });
      } catch {
        // network error — refetch to get server state
      }
      await fetchProject();
    },
    [project, fetchProject],
  );

  const handleCreateFolder = useCallback(
    async (name: string): Promise<string | null> => {
      if (!project) return null;

      const normalizedName = name.trim();
      if (!normalizedName) return null;

      const exists = project.folders.some(
        (folder) => folder.name.trim().toLowerCase() === normalizedName.toLowerCase(),
      );
      if (exists) return "文件夹名称不能重复";

      try {
        const data = await apiFetch<{ id: string; name: string }>(
          "/api/folders",
          {
            method: "POST",
            body: JSON.stringify({ name: normalizedName, projectId: project.id }),
          },
        );
        setProject((prev) =>
          prev
            ? {
                ...prev,
                folders: [...prev.folders, { id: data.id, name: data.name }],
              }
            : prev,
        );
        return null;
      } catch {
        return "创建文件夹失败";
      }
    },
    [project],
  );

  const handleDeleteFolder = useCallback(
    async (folderId: string) => {
      if (!project) return;

      if (!window.confirm("确定要删除此文件夹吗？子文件夹也会被删除。")) {
        return false;
      }

      try {
        await apiFetch(`/api/folders/${folderId}`, { method: "DELETE" });
      } catch {
        // network error — refetch to recover
      }

      // Snapshot the endpoint list before refetch
      const endpointsBefore = allEndpoints;
      if (selectedEndpointId) {
        const deletedFolderIds = new Set<string>();
        const collectDeletedFolderIds = (parentId: string) => {
          deletedFolderIds.add(parentId);
          project.folders
            .filter((folder) => folder.parentId === parentId)
            .forEach((folder) => collectDeletedFolderIds(folder.id));
        };
        collectDeletedFolderIds(folderId);

        const selectedEndpoint = endpointsBefore.find(
          (ep) => ep.id === selectedEndpointId,
        );
        if (
          selectedEndpoint?.folderId &&
          deletedFolderIds.has(selectedEndpoint.folderId)
        ) {
          setSelectedEndpointId(null);
        }
      }

      await fetchProject();
      return true;
    },
    [project, allEndpoints, selectedEndpointId, fetchProject],
  );

  const handleRenameFolder = useCallback(
    async (folderId: string, newName: string) => {
      if (!project) return;
      try {
        await apiFetch(`/api/folders/${folderId}`, {
          method: "PUT",
          body: JSON.stringify({ name: newName }),
        });
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
      } catch {
        // network error — no dedicated UI for rename failures
      }
    },
    [project],
  );

  const handleCreateEndpoint = useCallback(
    async (data: {
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
        const created = await apiFetch<Endpoint>("/api/endpoints", {
          method: "POST",
          body: JSON.stringify({
            name: data.name,
            method: data.method,
            path: data.path,
            description: data.description,
            projectId: project.id,
            folderId: data.folderId,
          }),
        });
        setProject((prev) =>
          prev ? { ...prev, endpoints: [...prev.endpoints, created] } : prev,
        );
        return { error: undefined };
      } catch (err) {
        return { error: err instanceof Error ? err.message : "创建接口失败" };
      }
    },
    [project],
  );

  const handleSaveEndpoint = useCallback(
    async (data: Partial<Endpoint>) => {
      if (!project || !selectedEndpointId) return;

      setSaveError(null);

      try {
        if (data.parameters) {
          const updated = await apiFetch<Endpoint["parameters"]>(
            `/api/endpoints/${selectedEndpointId}/params`,
            {
              method: "POST",
              body: JSON.stringify({ params: data.parameters }),
            },
          );
          setProject((prev) =>
            prev
              ? {
                  ...prev,
                  endpoints: prev.endpoints.map((ep) =>
                    ep.id === selectedEndpointId
                      ? { ...ep, parameters: updated }
                      : ep,
                  ),
                }
              : prev,
          );
          return;
        }

        if (data.requestBody) {
          const updated = await apiFetch<Endpoint["requestBody"]>(
            `/api/endpoints/${selectedEndpointId}/body`,
            {
              method: "POST",
              body: JSON.stringify(data.requestBody),
            },
          );
          setProject((prev) =>
            prev
              ? {
                  ...prev,
                  endpoints: prev.endpoints.map((ep) =>
                    ep.id === selectedEndpointId
                      ? { ...ep, requestBody: updated }
                      : ep,
                  ),
                }
              : prev,
          );
          return;
        }

        if (data.responses) {
          const updated = await apiFetch<Endpoint["responses"]>(
            `/api/endpoints/${selectedEndpointId}/responses`,
            {
              method: "POST",
              body: JSON.stringify({ responses: data.responses }),
            },
          );
          setProject((prev) =>
            prev
              ? {
                  ...prev,
                  endpoints: prev.endpoints.map((ep) =>
                    ep.id === selectedEndpointId
                      ? { ...ep, responses: updated }
                      : ep,
                  ),
                }
              : prev,
          );
          return;
        }

        // Basic info — only send defined fields
        const payload = Object.fromEntries(
          Object.entries(data).filter(([, v]) => v !== undefined),
        );
        const updated = await apiFetch<Endpoint>(
          `/api/endpoints/${selectedEndpointId}`,
          {
            method: "PUT",
            body: JSON.stringify(payload),
          },
        );
        setProject((prev) =>
          prev
            ? {
                ...prev,
                endpoints: prev.endpoints.map((ep) =>
                  ep.id === selectedEndpointId
                    ? { ...ep, ...updated }
                    : ep,
                ),
              }
            : prev,
        );
      } catch (err) {
        setSaveError(
          err instanceof Error ? err.message : "网络错误，请稍后重试",
        );
      }
    },
    [project, selectedEndpointId],
  );

  const handleSaveSettings = useCallback(
    async (data: Partial<Project>) => {
      if (!project) return;

      try {
        const updated = await apiFetch<Partial<Project>>(
          `/api/projects/${project.id}`,
          {
            method: "PUT",
            body: JSON.stringify(data),
          },
        );
        setProject((prev) => (prev ? { ...prev, ...updated } : prev));
      } catch {
        // network error
      }
    },
    [project],
  );

  return {
    project,
    loading,
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
    handleSaveSettings,
  };
}
