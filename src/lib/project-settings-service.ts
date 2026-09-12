import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canManageProject } from "@/lib/permissions";
import { parseProjectSettings } from "@/lib/project-settings";
import { settingsSnapshot, type SettingsSnapshot } from "@/lib/settings-model";
import { differences, mergeDocuments, sameValue } from "@/lib/documents/merge";
import {
  lockDocumentProject,
  type DocumentActor,
  documentTransactionOptions,
} from "@/lib/documents/service";
import { DocumentError, requireVersion } from "@/lib/documents/http";
export const settingsInclude = {
  environments: { orderBy: { id: "asc" as const } },
  globalHeaders: { orderBy: { id: "asc" as const } },
  globalParams: { orderBy: { id: "asc" as const } },
};
function bounded(snapshot: SettingsSnapshot) {
  const text = JSON.stringify(snapshot);
  if (new TextEncoder().encode(text).length > 8 * 1024 * 1024)
    throw new DocumentError("项目配置不能超过 8 MB");
  return text;
}
export async function recordSettingsRevision(
  tx: Prisma.TransactionClient,
  projectId: string,
) {
  const project = await tx.project.findUniqueOrThrow({
    where: { id: projectId },
    include: settingsInclude,
  });
  await tx.projectSettingsRevision.upsert({
    where: {
      projectId_version: { projectId, version: project.settingsVersion },
    },
    create: {
      projectId,
      version: project.settingsVersion,
      snapshot: bounded(settingsSnapshot(project)),
    },
    update: {},
  });
  const old = await tx.projectSettingsRevision.findMany({
    where: { projectId },
    orderBy: { version: "desc" },
    skip: 20,
    select: { id: true },
  });
  if (old.length)
    await tx.projectSettingsRevision.deleteMany({
      where: { id: { in: old.map((r) => r.id) } },
    });
}
export async function bumpSettingsVersion(
  tx: Prisma.TransactionClient,
  projectId: string,
) {
  await tx.project.update({
    where: { id: projectId },
    data: { settingsVersion: { increment: 1 } },
  });
  await recordSettingsRevision(tx, projectId);
}
export async function saveProjectSettings(
  projectId: string,
  actor: DocumentActor,
  input: Record<string, unknown>,
) {
  return prisma.$transaction(async (tx) => {
    const project = await lockDocumentProject(tx, projectId, actor);
    const member = await tx.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId: actor.id,
          organizationId: project.organizationId,
        },
      },
    });
    const version = requireVersion(input.version);
    let parsed: Prisma.ProjectUpdateInput;
    try {
      parsed = parseProjectSettings(input);
    } catch (error) {
      throw new DocumentError(
        error instanceof Error ? error.message : "配置格式不正确",
      );
    }
    const patch: Record<string, unknown> = {};
    for (const field of ["name", "description", "baseUrl", "isPublic"] as const)
      if (input[field] !== undefined) patch[field] = parsed[field];
    for (const field of [
      "environments",
      "globalHeaders",
      "globalParams",
    ] as const)
      if (input[field] !== undefined)
        patch[field] = (parsed[field] as { create: unknown[] }).create;
    const currentProject = await tx.project.findUniqueOrThrow({
      where: { id: projectId },
      include: settingsInclude,
    });
    const current = settingsSnapshot(currentProject);
    const previous =
      version === project.settingsVersion
        ? current
        : await tx.projectSettingsRevision
            .findUnique({
              where: { projectId_version: { projectId, version } },
            })
            .then((r) =>
              r ? (JSON.parse(r.snapshot) as SettingsSnapshot) : undefined,
            );
    if (
      patch.isPublic !== undefined &&
      patch.isPublic !== (previous?.isPublic ?? current.isPublic) &&
      !canManageProject(member?.role)
    )
      throw new DocumentError("只有项目管理员可以更改文档访问范围", 403);
    const mine = { ...(previous || current), ...patch };
    const merged = previous
      ? mergeDocuments(previous, mine, current)
      : {
          value: current,
          conflicts: differences(current, mine).map((c) => ({
            path: c.path,
            mine: c.current,
            current: c.base,
          })),
        };
    if (merged.conflicts.length)
      throw new DocumentError(
        "项目设置已变化，请对比后再保存",
        409,
        "PROJECT_SETTINGS_CONFLICT",
        {
          section: "basic",
          label: "项目设置",
          version: currentProject.settingsVersion,
          baseAvailable: !!previous,
          proposed: merged.value,
          conflicts: merged.conflicts,
          current: currentProject,
        },
      );
    const value = merged.value as SettingsSnapshot;
    if (sameValue(value, current))
      return {
        ...currentProject,
        settingsMerged: version !== project.settingsVersion,
      };
    bounded(value);
    await recordSettingsRevision(tx, projectId);
    const changes = Object.fromEntries(
      Object.entries(value).filter(
        ([key, value]) =>
          !sameValue(value, current[key as keyof SettingsSnapshot]),
      ),
    );
    let data: Prisma.ProjectUpdateInput;
    try {
      data = parseProjectSettings(changes);
    } catch (error) {
      throw new DocumentError(
        error instanceof Error ? error.message : "合并后的配置不正确",
      );
    }
    const updated = await tx.project.update({
      where: { id: projectId },
      data: { ...data, settingsVersion: { increment: 1 } },
      include: settingsInclude,
    });
    await recordSettingsRevision(tx, projectId);
    return { ...updated, settingsMerged: version !== project.settingsVersion };
  }, documentTransactionOptions);
}
