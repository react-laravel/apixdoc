import type { SidebarEndpoint, SidebarFolder } from "@/lib/types";

// Build these indexes once per project update, rather than scanning the entire
// project again for every folder render and drag event.
export function createSidebarIndex(
  folders: SidebarFolder[],
  endpoints: SidebarEndpoint[],
) {
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  const endpointById = new Map(endpoints.map((endpoint) => [endpoint.id, endpoint]));
  const foldersByParent = new Map<string | null, SidebarFolder[]>();
  const endpointsByFolder = new Map<string | null, SidebarEndpoint[]>();
  const folderPathById = new Map<string, string>();

  for (const folder of folders) {
    const parentId = folder.parentId ?? null;
    const siblings = foldersByParent.get(parentId) ?? [];
    siblings.push(folder);
    foldersByParent.set(parentId, siblings);
  }
  for (const endpoint of endpoints) {
    const siblings = endpointsByFolder.get(endpoint.folderId) ?? [];
    siblings.push(endpoint);
    endpointsByFolder.set(endpoint.folderId, siblings);
  }

  function folderPath(folderId: string, visited = new Set<string>()): string {
    const cached = folderPathById.get(folderId);
    if (cached !== undefined) return cached;
    const folder = folderById.get(folderId);
    if (!folder || visited.has(folderId)) return "";
    visited.add(folderId);
    const parentPath = folder.parentId ? folderPath(folder.parentId, visited) : "";
    const path = parentPath ? `${parentPath} / ${folder.name}` : folder.name;
    folderPathById.set(folderId, path);
    return path;
  }

  for (const folder of folders) folderPath(folder.id);

  const searchEntries = endpoints.map((endpoint) => {
    const folderPath = endpoint.folderId
      ? (folderPathById.get(endpoint.folderId) ?? "")
      : "未分组";
    return {
      endpoint,
      searchText: [endpoint.name, endpoint.path, endpoint.method, folderPath]
        .join(" ")
        .toLowerCase(),
    };
  });

  return {
    folderById,
    endpointById,
    foldersByParent,
    endpointsByFolder,
    folderPathById,
    searchEntries,
  };
}

export function hasFolderAncestor(
  folderId: string,
  ancestorId: string,
  folderById: Map<string, SidebarFolder>,
): boolean {
  const visited = new Set<string>();
  let parentId = folderById.get(folderId)?.parentId;
  while (parentId && !visited.has(parentId)) {
    if (parentId === ancestorId) return true;
    visited.add(parentId);
    parentId = folderById.get(parentId)?.parentId;
  }
  return false;
}
