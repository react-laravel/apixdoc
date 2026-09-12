import type { Endpoint, Folder, Project } from "@/lib/types";

export function collectProjectEndpoints(
  project: Pick<Project, "endpoints" | "folders">,
): Endpoint[] {
  const map = new Map(
    project.endpoints.map((endpoint) => [endpoint.id, endpoint]),
  );
  const visit = (folders: Folder[]) => {
    for (const folder of folders) {
      folder.endpoints?.forEach((endpoint) => map.set(endpoint.id, endpoint));
      if (folder.children) visit(folder.children);
    }
  };
  visit(project.folders);
  return [...map.values()].filter((endpoint) => !endpoint.deletedAt);
}
export function folderPath(
  folderId: string | null,
  folders: Folder[],
): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  let id = folderId;
  while (id) {
    if (seen.has(id)) throw new Error("目录结构存在循环，请先修正目录");
    seen.add(id);
    const folder = folders.find((item) => item.id === id);
    if (!folder) break;
    names.unshift(folder.name);
    id = folder.parentId ?? null;
  }
  return names;
}
