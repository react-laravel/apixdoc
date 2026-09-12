import type { Project } from "@/lib/types";
export function settingsSnapshot(
  project: Pick<
    Project,
    | "name"
    | "description"
    | "baseUrl"
    | "isPublic"
    | "environments"
    | "globalHeaders"
    | "globalParams"
  >,
) {
  return {
    name: project.name,
    description: project.description,
    baseUrl: project.baseUrl,
    isPublic: project.isPublic,
    environments: project.environments.map((e) => ({
      name: e.name,
      baseUrl: e.baseUrl,
      variables: e.variables,
      isDefault: !!e.isDefault,
    })),
    globalHeaders: project.globalHeaders.map((h) => ({
      key: h.key,
      value: h.value,
      description: h.description,
      enabled: h.enabled,
    })),
    globalParams: project.globalParams.map((p) => ({
      name: p.name,
      value: p.value,
      description: p.description,
      location: p.location,
      enabled: p.enabled,
    })),
  };
}
export type SettingsSnapshot = ReturnType<typeof settingsSnapshot>;
