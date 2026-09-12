"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api-fetch";
import {
  type Project,
  type Folder,
  type Endpoint,
  type FolderUpdate,
  type EndpointUpdate,
} from "@/lib/types";

// Keep one endpoint collection in client state, regardless of its folder depth.
function normalizeProject(project: Project): Project {
  const endpoints = new Map(
    project.endpoints.map((endpoint) => [endpoint.id, endpoint]),
  );
  const folders: Folder[] = [];
  const visit = (items: Folder[], parentId: string | null = null) => {
    for (const folder of items) {
      const {
        endpoints: children = [],
        children: nested = [],
        ...rest
      } = folder;
      folders.push({ ...rest, parentId: rest.parentId ?? parentId });
      children.forEach((endpoint) => endpoints.set(endpoint.id, endpoint));
      visit(nested, folder.id);
    }
  };
  visit(project.folders);
  return { ...project, folders, endpoints: [...endpoints.values()] };
}

export function useProjectPage() {
  const params = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedEndpointId, setSelectedEndpointId] = useState<string | null>(
    null,
  );
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestVersion = useRef(0);

  const fetchProject = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoadError(null);
    try {
      const data = await apiFetch<Project>(`/api/projects/${params.id}`);
      if (version !== requestVersion.current) return;
      setProject(data ? normalizeProject(data) : null);
    } catch (error) {
      if (version !== requestVersion.current) return;
      setLoadError(
        error instanceof Error ? error.message : "加载项目失败，请重试",
      );
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    setLoading(true);
    setProject(null);
    setSelectedEndpointId(null);
    setSaveError(null);
    fetchProject();
    return () => {
      requestVersion.current += 1;
    };
  }, [fetchProject]);

  const allEndpoints = useMemo(() => project?.endpoints ?? [], [project]);

  const selectedEndpoint = useMemo(
    () => allEndpoints.find((ep) => ep.id === selectedEndpointId) ?? null,
    [allEndpoints, selectedEndpointId],
  );

  const handleSelectEndpoint = useCallback((id: string | null) => {
    setSaveError(null);
    setSelectedEndpointId(id);
  }, []);

  const handleReorder = useCallback(
    async (
      folderUpdates: FolderUpdate[],
      endpointUpdates: EndpointUpdate[],
    ) => {
      if (!project) return;

      setSaveError(null);
      try {
        await apiFetch(`/api/projects/${project.id}/reorder`, {
          method: "POST",
          body: JSON.stringify({
            folders: folderUpdates.length > 0 ? folderUpdates : undefined,
            endpoints: endpointUpdates.length > 0 ? endpointUpdates : undefined,
          }),
        });
      } catch (error) {
        setSaveError(
          error instanceof Error ? error.message : "排序失败，请重试",
        );
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
        (folder) =>
          folder.name.trim().toLowerCase() === normalizedName.toLowerCase(),
      );
      if (exists) return "文件夹名称不能重复";

      try {
        const data = await apiFetch<{ id: string; name: string }>(
          "/api/folders",
          {
            method: "POST",
            body: JSON.stringify({
              name: normalizedName,
              projectId: project.id,
            }),
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

      if (
        !window.confirm(
          "确定要删除此文件夹及子文件夹吗？其中的接口会移至未分组。",
        )
      ) {
        return false;
      }

      setSaveError(null);
      try {
        await apiFetch(`/api/folders/${folderId}`, { method: "DELETE" });
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : "删除文件夹失败");
        return false;
      }

      await fetchProject();
      return true;
    },
    [project, fetchProject],
  );

  const handleRenameFolder = useCallback(
    async (folderId: string, newName: string) => {
      if (!project) return;
      setSaveError(null);
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
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : "重命名失败");
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
        setSelectedEndpointId(created.id);
        return { error: undefined };
      } catch (err) {
        return { error: err instanceof Error ? err.message : "创建接口失败" };
      }
    },
    [project],
  );

  const handleCopyEndpoint = useCallback(async () => {
    if (!project || !selectedEndpointId) return false;
    setSaveError(null);
    try {
      const created = await apiFetch<Endpoint>(
        `/api/endpoints/${selectedEndpointId}/copy`,
        { method: "POST" },
      );
      setProject((previous) =>
        previous?.id === project.id
          ? { ...previous, endpoints: [...previous.endpoints, created] }
          : previous,
      );
      setSelectedEndpointId(created.id);
      return true;
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "复制接口失败");
      return false;
    }
  }, [project, selectedEndpointId]);

  const handleDeleteEndpoint = useCallback(async () => {
    if (!project || !selectedEndpointId) return false;
    const endpoint = project.endpoints.find(
      (item) => item.id === selectedEndpointId,
    );
    if (
      !window.confirm(
        `确定删除接口「${endpoint?.name || endpoint?.path || ""}」及其参数、响应定义吗？`,
      )
    )
      return false;
    setSaveError(null);
    try {
      await apiFetch(`/api/endpoints/${selectedEndpointId}`, {
        method: "DELETE",
      });
      setProject((previous) =>
        previous?.id === project.id
          ? {
              ...previous,
              endpoints: previous.endpoints.filter(
                (item) => item.id !== selectedEndpointId,
              ),
            }
          : previous,
      );
      setSelectedEndpointId(null);
      return true;
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "删除接口失败");
      return false;
    }
  }, [project, selectedEndpointId]);

  const handleSaveEndpoint = useCallback(
    async (data: Partial<Endpoint>) => {
      if (!project || !selectedEndpointId) return false;
      setSaveError(null);
      const endpointUrl = `/api/endpoints/${selectedEndpointId}`;
      try {
        let patch: Partial<Endpoint>;
        if (data.parameters !== undefined) {
          patch = {
            parameters: await apiFetch<Endpoint["parameters"]>(
              `${endpointUrl}/params`,
              {
                method: "POST",
                body: JSON.stringify({ params: data.parameters }),
              },
            ),
          };
        } else if (data.requestBody) {
          patch = {
            requestBody: await apiFetch<Endpoint["requestBody"]>(
              `${endpointUrl}/body`,
              {
                method: "POST",
                body: JSON.stringify(data.requestBody),
              },
            ),
          };
        } else if (data.responses !== undefined) {
          patch = {
            responses: await apiFetch<Endpoint["responses"]>(
              `${endpointUrl}/responses`,
              {
                method: "POST",
                body: JSON.stringify({ responses: data.responses }),
              },
            ),
          };
        } else {
          patch = await apiFetch<Endpoint>(endpointUrl, {
            method: "PUT",
            body: JSON.stringify(
              Object.fromEntries(
                Object.entries(data).filter(([, value]) => value !== undefined),
              ),
            ),
          });
        }
        setProject((previous) =>
          previous?.id === project.id
            ? {
                ...previous,
                endpoints: previous.endpoints.map((endpoint) =>
                  endpoint.id === selectedEndpointId
                    ? { ...endpoint, ...patch }
                    : endpoint,
                ),
              }
            : previous,
        );
        return true;
      } catch (error) {
        setSaveError(
          error instanceof Error ? error.message : "网络错误，请稍后重试",
        );
        return false;
      }
    },
    [project, selectedEndpointId],
  );

  const handleSaveSettings = useCallback(
    async (data: Partial<Project>) => {
      if (!project) return false;

      setSaveError(null);
      try {
        const updated = await apiFetch<Partial<Project>>(
          `/api/projects/${project.id}`,
          {
            method: "PUT",
            body: JSON.stringify(data),
          },
        );
        setProject((prev) => (prev ? { ...prev, ...updated } : prev));
        return true;
      } catch (error) {
        setSaveError(
          error instanceof Error ? error.message : "保存项目设置失败",
        );
        return false;
      }
    },
    [project],
  );

  return {
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
  };
}
