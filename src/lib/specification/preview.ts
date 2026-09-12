import { createHash } from "node:crypto";
import { collectProjectEndpoints } from "@/lib/documentation/navigation";
import type { Project } from "@/lib/types";
import type { ImportPlan } from "./types";
import { exportImportedOpenApi, exportImportedPostman } from "./export";

export function projectRevision(project: Project): string {
  // Stable keys and rows make previews independent of database return order.
  const stable = (value: unknown): unknown => {
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value))
      return value
        .map(stable)
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => [k, stable(v)]),
      );
    return value;
  };
  return createHash("sha256")
    .update(JSON.stringify(stable(project)))
    .digest("hex");
}
export function previewImport(
  project: Project,
  plan: ImportPlan,
  mode: "append" | "replace",
) {
  const current = collectProjectEndpoints(project);
  const keys = new Set(
    mode === "append"
      ? current.map((e) => `${e.method.toUpperCase()} ${e.path}`)
      : [],
  );
  const accepted: ImportPlan["endpoints"] = [];
  const conflicts: string[] = [];
  for (const endpoint of plan.endpoints) {
    const key = `${endpoint.method} ${endpoint.path}`;
    if (keys.has(key)) conflicts.push(key);
    else {
      accepted.push(endpoint);
      keys.add(key);
    }
  }
  const source = {
    id: "preview-source",
    name: plan.name,
    format: plan.format,
    version: plan.version,
    document: plan.document,
    pointers: JSON.stringify(plan.endpoints.map((e) => e.sourcePointer)),
  };
  const preview: Project = {
    ...project,
    folders: project.folders.map((f) => ({ ...f, endpoints: [] })),
    endpoints: [
      ...(mode === "append" ? current : []),
      ...accepted.map((e, i) => ({
        ...e,
        id: `preview-${i}`,
        folderId: null,
        sourceImportId: source.id,
      })),
    ],
    specificationImports: [
      ...(mode === "append" ? project.specificationImports || [] : []),
      source,
    ],
  };
  // Prove same-format export can merge all imported definitions before committing.
  if (plan.format === "openapi") exportImportedOpenApi(preview);
  else exportImportedPostman(preview);
  return {
    accepted,
    summary: {
      name: plan.name,
      format: plan.format,
      version: plan.version,
      total: plan.endpoints.length,
      imported: accepted.length,
      skipped: conflicts.length,
      conflicts: conflicts.slice(0, 100),
      removed: mode === "replace" ? current.length : 0,
      folders: new Set(
        accepted
          .map((e) => JSON.stringify(e.folderPath))
          .filter((p) => p !== "[]"),
      ).size,
      environments: plan.environments.length,
      warnings: plan.warnings,
      revision: createHash("sha256")
        .update(JSON.stringify([projectRevision(project), mode, plan.document]))
        .digest("hex"),
    },
  };
}
