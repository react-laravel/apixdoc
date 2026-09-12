"use client";

import {
  useEffect,
  useLayoutEffect,
  useState,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { useParams } from "next/navigation";
import type { DocumentSection } from "@/lib/documents/model";
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
  const routeId = useRef(params.id);
  useLayoutEffect(() => {
    routeId.current = params.id;
  }, [params.id]);

  const fetchProject = useCallback(async () => {
    if (routeId.current !== params.id) return;
    const version = ++requestVersion.current;
    setLoadError(null);
    try {
      const data = await apiFetch<Project>(`/api/projects/${params.id}`);
      if (version !== requestVersion.current || routeId.current !== params.id)
        return;
      setProject(data ? normalizeProject(data) : null);
    } catch (error) {
      if (version !== requestVersion.current || routeId.current !== params.id)
        return;
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
            version: project.layoutVersion,
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
        const data = await apiFetch<{
          id: string;
          name: string;
          layoutVersion: number;
        }>("/api/folders", {
          method: "POST",
          body: JSON.stringify({
            name: normalizedName,
            projectId: project.id,
          }),
        });
        setProject((prev) =>
          prev
            ? {
                ...prev,
                layoutVersion: data.layoutVersion,
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
        await apiFetch(`/api/folders/${folderId}`, {
          method: "DELETE",
          body: JSON.stringify({ version: project.layoutVersion }),
        });
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
          body: JSON.stringify({
            name: newName,
            version: project.layoutVersion,
          }),
        });
        await fetchProject();
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : "重命名失败");
      }
    },
    [project, fetchProject],
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
          prev && (!created.projectId || prev.id === created.projectId)
            ? {
                ...prev,
                layoutVersion:
                  created.projectLayoutVersion ?? prev.layoutVersion,
                endpoints: [...prev.endpoints, created],
              }
            : prev,
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
        {
          method: "POST",
          body: JSON.stringify({
            version: project.endpoints.find((e) => e.id === selectedEndpointId)
              ?.version,
          }),
        },
      );
      setProject((previous) =>
        previous?.id === project.id
          ? {
              ...previous,
              layoutVersion:
                created.projectLayoutVersion ?? previous.layoutVersion,
              endpoints: [...previous.endpoints, created],
            }
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
        `将接口「${endpoint?.name || endpoint?.path || ""}」移入回收站吗？未保存的修改不会保留。`,
      )
    )
      return false;
    setSaveError(null);
    try {
      const removed = await apiFetch<{ layoutVersion: number }>(
        `/api/endpoints/${selectedEndpointId}`,
        {
          method: "DELETE",
          body: JSON.stringify({ version: endpoint?.version }),
        },
      );
      setProject((previous) =>
        previous?.id === project.id
          ? {
              ...previous,
              layoutVersion: removed.layoutVersion,
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

  const applyEndpoint = useCallback((updated: Endpoint) => {
    if (updated.projectId && updated.projectId !== routeId.current) return;
    setProject((previous) =>
      previous && (!updated.projectId || previous.id === updated.projectId)
        ? {
            ...previous,
            layoutVersion:
              updated.projectLayoutVersion ?? previous.layoutVersion,
            endpoints: previous.endpoints.some((e) => e.id === updated.id)
              ? previous.endpoints.map((e) =>
                  e.id === updated.id ? updated : e,
                )
              : [...previous.endpoints, updated],
          }
        : previous,
    );
  }, []);
  const handleSaveEndpoint = useCallback(
    async (
      data: Partial<Endpoint>,
      version: number,
      section: DocumentSection,
    ) => {
      if (!project || !selectedEndpointId) throw new Error("请先选择接口");
      setSaveError(null);
      const suffix = section === "basic" ? "" : `/${section}`;
      const updated = await apiFetch<Endpoint>(
        `/api/endpoints/${selectedEndpointId}${suffix}`,
        {
          method: section === "basic" ? "PUT" : "POST",
          body: JSON.stringify({ ...data, version }),
        },
      );
      applyEndpoint(updated);
      return updated;
    },
    [project, selectedEndpointId, applyEndpoint],
  );
  const handleDocumentRestored = useCallback(
    async (updated: Endpoint) => {
      if (updated.projectId && updated.projectId !== routeId.current) return;
      applyEndpoint(updated);
      setSelectedEndpointId(updated.id);
      await fetchProject();
    },
    [applyEndpoint, fetchProject],
  );

  const handleSaveSettings = useCallback(
    async (data: Partial<Project>, version: number) => {
      if (!project) throw new Error("项目尚未加载");
      setSaveError(null);
      const updated = await apiFetch<Project>(`/api/projects/${project.id}`, {
        method: "PUT",
        body: JSON.stringify({ ...data, version }),
      });
      setProject((previous) =>
        previous?.id === project.id ? { ...previous, ...updated } : previous,
      );
      return updated;
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
    handleDocumentRestored,
    handleCopyEndpoint,
    handleDeleteEndpoint,
    handleSaveSettings,
  };
}
