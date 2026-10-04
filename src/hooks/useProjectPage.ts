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

type ProjectScope = { id: string; active: boolean };

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
  const projectRequest = useRef<AbortController | null>(null);
  const routeScope = useRef<ProjectScope>({ id: params.id, active: false });
  const selectionVersion = useRef(0);
  const cancelProjectRequest = useCallback(() => {
    requestVersion.current += 1;
    projectRequest.current?.abort();
    projectRequest.current = null;
  }, []);

  useLayoutEffect(() => {
    const scope = { id: params.id, active: true };
    routeScope.current = scope;
    selectionVersion.current += 1;
    return () => {
      scope.active = false;
      cancelProjectRequest();
    };
  }, [params.id, cancelProjectRequest]);

  const getScope = useCallback(
    (projectId?: string) => {
      const scope = routeScope.current;
      return scope.active && scope.id === params.id &&
        (!projectId || scope.id === projectId) ? scope : null;
    },
    [params.id],
  );

  const isCurrentScope = useCallback(
    (scope: ProjectScope) => scope.active && routeScope.current === scope,
    [],
  );

  const fetchProject = useCallback(async () => {
    const scope = getScope();
    if (!scope) return;
    cancelProjectRequest();
    const controller = new AbortController();
    projectRequest.current = controller;
    const version = ++requestVersion.current;
    setLoadError(null);
    try {
      const data = await apiFetch<Project>(`/api/projects/${scope.id}`, {
        signal: controller.signal,
      });
      if (version !== requestVersion.current || !isCurrentScope(scope)) return;
      setProject(data ? normalizeProject(data) : null);
    } catch (error) {
      if (version !== requestVersion.current || !isCurrentScope(scope)) return;
      setLoadError(
        error instanceof Error ? error.message : "加载项目失败，请重试",
      );
    } finally {
      if (version === requestVersion.current && isCurrentScope(scope)) {
        projectRequest.current = null;
        setLoading(false);
      }
    }
  }, [getScope, isCurrentScope, cancelProjectRequest]);

  useEffect(() => {
    setLoading(true);
    setProject(null);
    setSelectedEndpointId(null);
    setSaveError(null);
    fetchProject();
  }, [fetchProject]);

  const allEndpoints = useMemo(
    () => project?.endpoints ?? [],
    [project?.endpoints],
  );
  const endpointsById = useMemo(
    () => new Map(allEndpoints.map((endpoint) => [endpoint.id, endpoint])),
    [allEndpoints],
  );

  const selectedEndpoint = useMemo(
    () =>
      selectedEndpointId ? endpointsById.get(selectedEndpointId) ?? null : null,
    [endpointsById, selectedEndpointId],
  );

  const handleSelectEndpoint = useCallback((id: string | null) => {
    selectionVersion.current += 1;
    setSaveError(null);
    setSelectedEndpointId(id);
  }, []);

  const handleReorder = useCallback(
    async (
      folderUpdates: FolderUpdate[],
      endpointUpdates: EndpointUpdate[],
    ) => {
      const scope = getScope(project?.id);
      if (!project || !scope) return;

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
        if (!isCurrentScope(scope)) return;
        setSaveError(
          error instanceof Error ? error.message : "排序失败，请重试",
        );
      }
      if (!isCurrentScope(scope)) return;
      await fetchProject();
    },
    [project, fetchProject, getScope, isCurrentScope],
  );

  const handleCreateFolder = useCallback(
    async (name: string): Promise<string | null> => {
      const scope = getScope(project?.id);
      if (!project || !scope) return null;

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
        if (!isCurrentScope(scope)) return null;
        cancelProjectRequest();
        setProject((prev) =>
          prev?.id === project.id
            ? {
                ...prev,
                layoutVersion: Math.max(
                  prev.layoutVersion ?? 0,
                  data.layoutVersion ?? 0,
                ),
                folders: [...prev.folders, { id: data.id, name: data.name }],
              }
            : prev,
        );
        return null;
      } catch (error) {
        if (!isCurrentScope(scope)) return null;
        return error instanceof Error ? error.message : "创建文件夹失败";
      }
    },
    [project, getScope, isCurrentScope, cancelProjectRequest],
  );

  const handleDeleteFolder = useCallback(
    async (folderId: string) => {
      const scope = getScope(project?.id);
      if (!project || !scope) return;

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
        if (!isCurrentScope(scope)) return false;
        setSaveError(error instanceof Error ? error.message : "删除文件夹失败");
        return false;
      }

      if (!isCurrentScope(scope)) return false;
      await fetchProject();
      return true;
    },
    [project, fetchProject, getScope, isCurrentScope],
  );

  const handleRenameFolder = useCallback(
    async (folderId: string, newName: string) => {
      const scope = getScope(project?.id);
      if (!project || !scope) return;
      setSaveError(null);
      try {
        await apiFetch(`/api/folders/${folderId}`, {
          method: "PUT",
          body: JSON.stringify({
            name: newName,
            version: project.layoutVersion,
          }),
        });
        if (!isCurrentScope(scope)) return;
        await fetchProject();
      } catch (error) {
        if (!isCurrentScope(scope)) return;
        setSaveError(error instanceof Error ? error.message : "重命名失败");
      }
    },
    [project, fetchProject, getScope, isCurrentScope],
  );

  const handleCreateEndpoint = useCallback(
    async (data: {
      name: string;
      method: string;
      path: string;
      description: string;
      folderId: string | null;
    }): Promise<{ error?: string }> => {
      const scope = getScope(project?.id);
      if (!data.path.trim() || !project || !scope) {
        return { error: "请填写接口路径" };
      }
      const selection = selectionVersion.current;

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
        if (!isCurrentScope(scope)) return {};
        cancelProjectRequest();
        setProject((prev) =>
          prev?.id === project.id &&
          (!created.projectId || prev.id === created.projectId)
            ? {
                ...prev,
                layoutVersion: Math.max(
                  created.projectLayoutVersion ?? 0,
                  prev.layoutVersion ?? 0,
                ),
                endpoints: [...prev.endpoints, created],
              }
            : prev,
        );
        if (selectionVersion.current === selection)
          setSelectedEndpointId(created.id);
        return { error: undefined };
      } catch (err) {
        if (!isCurrentScope(scope)) return {};
        return { error: err instanceof Error ? err.message : "创建接口失败" };
      }
    },
    [project, getScope, isCurrentScope, cancelProjectRequest],
  );

  const handleCopyEndpoint = useCallback(async () => {
    const scope = getScope(project?.id);
    if (!project || !selectedEndpointId || !scope) return false;
    const selection = selectionVersion.current;
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
      if (!isCurrentScope(scope)) return false;
      cancelProjectRequest();
      setProject((previous) =>
        previous?.id === project.id
          ? {
              ...previous,
              layoutVersion: Math.max(
                created.projectLayoutVersion ?? 0,
                previous.layoutVersion ?? 0,
              ),
              endpoints: [...previous.endpoints, created],
            }
          : previous,
      );
      if (selectionVersion.current === selection)
        setSelectedEndpointId(created.id);
      return true;
    } catch (error) {
      if (!isCurrentScope(scope)) return false;
      setSaveError(error instanceof Error ? error.message : "复制接口失败");
      return false;
    }
  }, [
    project, selectedEndpointId, getScope, isCurrentScope, cancelProjectRequest,
  ]);

  const handleDeleteEndpoint = useCallback(async () => {
    const scope = getScope(project?.id);
    if (!project || !selectedEndpointId || !scope) return false;
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
      if (!isCurrentScope(scope)) return false;
      cancelProjectRequest();
      setProject((previous) =>
        previous?.id === project.id
          ? {
              ...previous,
              layoutVersion: Math.max(
                removed.layoutVersion,
                previous.layoutVersion ?? 0,
              ),
              endpoints: previous.endpoints.filter(
                (item) => item.id !== selectedEndpointId,
              ),
            }
          : previous,
      );
      setSelectedEndpointId((current) =>
        current === selectedEndpointId ? null : current,
      );
      return true;
    } catch (error) {
      if (!isCurrentScope(scope)) return false;
      setSaveError(error instanceof Error ? error.message : "删除接口失败");
      return false;
    }
  }, [
    project, selectedEndpointId, getScope, isCurrentScope, cancelProjectRequest,
  ]);

  const applyEndpoint = useCallback(
    (updated: Endpoint, scope: ProjectScope, projectId: string) => {
      if (
        !isCurrentScope(scope) ||
        (updated.projectId && updated.projectId !== projectId)
      ) return;
      // A read started before this acknowledgement may contain an older snapshot.
      cancelProjectRequest();
      setProject((previous) => {
        if (previous?.id !== projectId) return previous;
        const existing = previous.endpoints.find((e) => e.id === updated.id);
        if ((existing?.version ?? 0) > (updated.version ?? 0)) return previous;
        return {
          ...previous,
          layoutVersion: Math.max(
            updated.projectLayoutVersion ?? 0,
            previous.layoutVersion ?? 0,
          ),
          endpoints: existing
            ? previous.endpoints.map((e) => e.id === updated.id ? updated : e)
            : [...previous.endpoints, updated],
        };
      });
    },
    [isCurrentScope, cancelProjectRequest],
  );
  const handleSaveEndpoint = useCallback(
    async (
      data: Partial<Endpoint>,
      version: number,
      section: DocumentSection,
    ) => {
      const scope = getScope(project?.id);
      if (!project || !selectedEndpointId || !scope)
        throw new Error("请先选择接口");
      setSaveError(null);
      const suffix = section === "basic" ? "" : `/${section}`;
      const updated = await apiFetch<Endpoint>(
        `/api/endpoints/${selectedEndpointId}${suffix}`,
        {
          method: section === "basic" ? "PUT" : "POST",
          body: JSON.stringify({ ...data, version }),
        },
      );
      applyEndpoint(updated, scope, project.id);
      return updated;
    },
    [project, selectedEndpointId, applyEndpoint, getScope],
  );
  const handleDocumentRestored = useCallback(
    async (updated: Endpoint) => {
      const scope = getScope(project?.id);
      if (
        !project || !scope ||
        (updated.projectId && updated.projectId !== project.id)
      ) return;
      applyEndpoint(updated, scope, project.id);
      setSelectedEndpointId(updated.id);
      await fetchProject();
    },
    [project, applyEndpoint, fetchProject, getScope],
  );

  const handleSaveSettings = useCallback(
    async (data: Partial<Project>, version: number) => {
      const scope = getScope(project?.id);
      if (!project || !scope) throw new Error("项目尚未加载");
      setSaveError(null);
      const updated = await apiFetch<Project>(`/api/projects/${project.id}`, {
        method: "PUT",
        body: JSON.stringify({ ...data, version }),
      });
      if (isCurrentScope(scope)) {
        cancelProjectRequest();
        setProject((previous) =>
          previous?.id === project.id &&
          (previous.settingsVersion ?? 0) <= (updated.settingsVersion ?? 0)
            ? {
                ...previous,
                ...updated,
                layoutVersion: Math.max(
                  previous.layoutVersion ?? 0,
                  updated.layoutVersion ?? 0,
                ),
              }
            : previous,
        );
      }
      return updated;
    },
    [project, getScope, isCurrentScope, cancelProjectRequest],
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
