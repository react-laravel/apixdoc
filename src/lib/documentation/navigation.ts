import type { Endpoint, Folder, Project } from "@/lib/types";

export function collectProjectEndpoints(
  project: Pick<Project, "endpoints" | "folders">,
): Endpoint[] {
  const map = new Map(
    project.endpoints.map((endpoint) => [endpoint.id, endpoint]),
  );
  const visited = new Set<Folder>();
  const pending = [...project.folders].reverse();
  while (pending.length) {
    const folder = pending.pop()!;
    if (visited.has(folder)) continue;
    visited.add(folder);
    folder.endpoints?.forEach((endpoint) => map.set(endpoint.id, endpoint));
    if (folder.children) pending.push(...[...folder.children].reverse());
  }
  return [...map.values()].filter((endpoint) => !endpoint.deletedAt);
}

export function indexDocumentationFolders(folders: Folder[]): Map<string, Folder> {
  const index = new Map<string, Folder>();
  const visited = new Set<Folder>();
  const pending = folders.map((folder) => ({ folder, parentId: null as string | null })).reverse();
  while (pending.length) {
    const { folder, parentId } = pending.pop()!;
    if (visited.has(folder)) continue;
    visited.add(folder);
    index.set(folder.id, {
      ...folder,
      parentId: folder.parentId === undefined ? parentId : folder.parentId,
    });
    if (folder.children) {
      pending.push(...folder.children.map((child) => ({ folder: child, parentId: folder.id })).reverse());
    }
  }
  return index;
}

export function folderPath(
  folderId: string | null,
  folders: Folder[],
  index = indexDocumentationFolders(folders),
): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  let id = folderId;
  while (id) {
    if (seen.has(id)) throw new Error("目录结构存在循环，请先修正目录");
    seen.add(id);
    const folder = index.get(id);
    if (!folder) break;
    names.unshift(folder.name);
    id = folder.parentId ?? null;
  }
  return names;
}

export function createDocumentationNavigation(
  project: Pick<Project, "endpoints" | "folders">,
) {
  const endpoints = collectProjectEndpoints(project);
  const folderIndex = indexDocumentationFolders(project.folders);
  const paths = new Map<string | null, string>([[null, "未分组"]]);
  for (const folderId of folderIndex.keys()) {
    try {
      paths.set(folderId, folderPath(folderId, project.folders, folderIndex).join(" / "));
    } catch {
      paths.set(folderId, "目录结构异常");
    }
  }
  return {
    endpoints,
    endpointById: new Map(endpoints.map((endpoint) => [endpoint.id, endpoint])),
    entries: endpoints.map((endpoint) => {
      const path = paths.get(endpoint.folderId) || "未分组";
      return {
        endpoint,
        folderPath: path,
        searchText: `${endpoint.method} ${endpoint.path} ${endpoint.name} ${path}`.toLowerCase(),
      };
    }),
  };
}
