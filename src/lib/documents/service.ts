import { ensurePublicationBaseline } from "@/lib/publications/storage";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canEditContent } from "@/lib/permissions";
import {
  documentSnapshot,
  documentSection,
  type DocumentSnapshot,
  type DocumentSection,
} from "./model";
import { expandBodyMerge, finishBodyMerge } from "./body-merge";
import { differences, mergeDocuments, sameValue } from "./merge";
import { normalizeSection } from "./validation";
import { DocumentError, requireVersion } from "./http";
import { serializeSpecification } from "@/lib/documentation/export";
import {
  exportImportedOpenApi,
  exportImportedPostman,
} from "@/lib/specification/export";
import type { Endpoint } from "@/lib/types";
export type DocumentActor = {
  id: string;
  name?: string | null;
  email?: string | null;
};
export type DocumentTx = Prisma.TransactionClient;
import { documentInclude } from "./include";
export { documentInclude } from "./include";
export type StoredEndpoint = Prisma.ApiEndpointGetPayload<{
  include: typeof documentInclude;
}>;
export const documentTransactionOptions = { maxWait: 5000, timeout: 60000 };
export async function lockDocumentProject(
  tx: DocumentTx,
  projectId: string,
  actor: DocumentActor,
) {
  const rows = await tx.$queryRaw<
    { id: string }[]
  >`SELECT "id" FROM "Project" WHERE "id" = ${projectId} FOR UPDATE`;
  if (!rows.length) throw new DocumentError("项目不存在", 404);
  const project = (await tx.project.findUnique({ where: { id: projectId } }))!;
  const member = await tx.organizationMember.findUnique({
    where: {
      userId_organizationId: {
        userId: actor.id,
        organizationId: project.organizationId,
      },
    },
  });
  if (!canEditContent(member?.role))
    throw new DocumentError("无权编辑或查看此项目的历史内容", 403);
  return ensurePublicationBaseline(tx, project);
}
export async function authorizedEndpoint(
  tx: DocumentTx,
  id: string,
  actor: DocumentActor,
) {
  const reference = await tx.apiEndpoint.findUnique({
    where: { id },
    select: { projectId: true },
  });
  if (!reference) throw new DocumentError("接口不存在", 404);
  const project = await lockDocumentProject(tx, reference.projectId, actor);
  const endpoint = await tx.apiEndpoint.findUnique({
    where: { id },
    include: documentInclude,
  });
  if (!endpoint) throw new DocumentError("接口不存在", 404);
  return { endpoint, project };
}
async function snapshot(tx: DocumentTx, endpoint: StoredEndpoint) {
  return documentSnapshot(
    endpoint,
    await tx.folder.findMany({ where: { projectId: endpoint.projectId } }),
  );
}
function encodeSnapshot(value: DocumentSnapshot) {
  const text = JSON.stringify(value);
  if (new TextEncoder().encode(text).length > 8 * 1024 * 1024)
    throw new DocumentError("单个接口内容不能超过 8 MB，请拆分内容");
  return text;
}
export async function recordDocumentRevision(
  tx: DocumentTx,
  endpoint: StoredEndpoint,
  actor: DocumentActor | null,
  action: string,
) {
  await tx.endpointRevision.create({
    data: {
      endpointId: endpoint.id,
      version: endpoint.version,
      action,
      actorId: actor?.id || null,
      actorName: actor?.name || actor?.email || "历史基线",
      snapshot: encodeSnapshot(await snapshot(tx, endpoint)),
    },
  });
  const old = await tx.endpointRevision.findMany({
    where: { endpointId: endpoint.id },
    orderBy: { version: "desc" },
    skip: 50,
    select: { id: true },
  });
  if (old.length)
    await tx.endpointRevision.deleteMany({
      where: { id: { in: old.map((r) => r.id) } },
    });
}
export async function ensureDocumentBaseline(
  tx: DocumentTx,
  endpoint: StoredEndpoint,
) {
  const found = await tx.endpointRevision.findUnique({
    where: {
      endpointId_version: {
        endpointId: endpoint.id,
        version: endpoint.version,
      },
    },
    select: { id: true },
  });
  if (!found) await recordDocumentRevision(tx, endpoint, null, "baseline");
}
export async function ensureFolderIsolation(
  tx: DocumentTx,
  projectId: string,
  folderIds: string[],
) {
  if (!folderIds.length) return;
  const foreignFolders = await tx.folder.count({
    where: { parentId: { in: folderIds }, projectId: { not: projectId } },
  });
  const foreignEndpoints = await tx.apiEndpoint.count({
    where: { folderId: { in: folderIds }, projectId: { not: projectId } },
  });
  if (foreignFolders || foreignEndpoints)
    throw new DocumentError("目录存在跨项目关联，请先修正关联再删除", 409);
}
export async function bumpLayout(tx: DocumentTx, projectId: string) {
  return tx.project.update({
    where: { id: projectId },
    data: { layoutVersion: { increment: 1 } },
  });
}
async function folderValid(
  tx: DocumentTx,
  projectId: string,
  folderId: string | null,
) {
  return (
    !folderId ||
    !!(await tx.folder.findFirst({
      where: { id: folderId, projectId },
      select: { id: true },
    }))
  );
}
async function applySnapshot(
  tx: DocumentTx,
  id: string,
  value: DocumentSnapshot,
  section?: DocumentSection,
) {
  if (!section || section === "params") {
    await tx.endpointParam.deleteMany({ where: { endpointId: id } });
    if (value.parameters.length)
      await tx.endpointParam.createMany({
        data: value.parameters.map((p, order) => ({
          ...p,
          order,
          endpointId: id,
        })),
      });
  }
  if (!section || section === "headers") {
    await tx.endpointHeader.deleteMany({ where: { endpointId: id } });
    if (value.headers.length)
      await tx.endpointHeader.createMany({
        data: value.headers.map((h, order) => ({
          ...h,
          order,
          endpointId: id,
        })),
      });
  }
  if (!section || section === "body") {
    if (!value.requestBody)
      await tx.requestBody.deleteMany({ where: { endpointId: id } });
    else
      await tx.requestBody.upsert({
        where: { endpointId: id },
        create: { ...value.requestBody, endpointId: id },
        update: value.requestBody,
      });
  }
  if (!section || section === "responses") {
    await tx.endpointResponse.deleteMany({ where: { endpointId: id } });
    if (value.responses.length)
      await tx.endpointResponse.createMany({
        data: value.responses.map((r, order) => ({
          ...r,
          order,
          endpointId: id,
        })),
      });
  }
  return tx.apiEndpoint.update({
    where: { id },
    data: {
      ...(!section || section === "basic"
        ? {
            name: value.name,
            method: value.method,
            path: value.path,
            description: value.description,
            folderId: value.folderId,
            order: value.order,
          }
        : {}),
      version: { increment: 1 },
      deletedAt: null,
    },
    include: documentInclude,
  });
}
export async function updateDocument(
  id: string,
  actor: DocumentActor,
  section: DocumentSection,
  input: Record<string, unknown>,
) {
  return prisma.$transaction(async (tx) => {
    const { endpoint, project } = await authorizedEndpoint(tx, id, actor);
    if (endpoint.deletedAt)
      throw new DocumentError(
        "接口已移入回收站，你的修改尚未保存",
        410,
        "DOCUMENT_DELETED",
      );
    const version = requireVersion(input.version);
    const patch = normalizeSection(section, input);
    const current = await snapshot(tx, endpoint);
    const currentSection = documentSection(current, section);
    let value = { ...currentSection, ...patch };
    let merged = false;
    if (version !== endpoint.version) {
      const revision = await tx.endpointRevision.findUnique({
        where: { endpointId_version: { endpointId: id, version } },
      });
      const base = revision
        ? documentSection(JSON.parse(revision.snapshot), section)
        : undefined;
      const mine = { ...(base || currentSection), ...patch };
      const prepared =
        section === "body" && base
          ? expandBodyMerge(base, mine, currentSection)
          : { base, mine, current: currentSection, expanded: false };
      const result = base
        ? mergeDocuments(prepared.base, prepared.mine, prepared.current)
        : {
            value: currentSection,
            conflicts: differences(currentSection, mine).map((change) => ({
              path: change.path,
              mine: change.current,
              current: change.base,
            })),
          };
      if (!revision && sameValue(mine, currentSection))
        return {
          ...endpoint,
          projectLayoutVersion: project.layoutVersion,
          saveMerged: true,
        };
      if (result.conflicts.length || !revision)
        throw new DocumentError(
          "此处内容已被修改，请对比后再保存",
          409,
          "DOCUMENT_CONFLICT",
          {
            section,
            version: endpoint.version,
            baseAvailable: !!revision,
            bodyExpanded: prepared.expanded,
            conflicts: result.conflicts,
            proposed: result.value,
            current: endpoint,
          },
        );
      value = finishBodyMerge(
        result.value as Record<string, unknown>,
        prepared.expanded,
      );
      merged = true;
    }
    const next = { ...current, ...value } as DocumentSnapshot;
    if (!(await folderValid(tx, endpoint.projectId, next.folderId)))
      throw new DocumentError("目录已不存在，请重新选择", 409);
    encodeSnapshot(next);
    if (sameValue(currentSection, value))
      return {
        ...endpoint,
        projectLayoutVersion: project.layoutVersion,
        saveMerged: merged,
      };
    await ensureDocumentBaseline(tx, endpoint);
    const updated = await applySnapshot(tx, id, next, section);
    const layout =
      current.folderId !== next.folderId || current.order !== next.order
        ? await bumpLayout(tx, endpoint.projectId)
        : project;
    await recordDocumentRevision(tx, updated, actor, section);
    return {
      ...updated,
      projectLayoutVersion: layout.layoutVersion,
      saveMerged: merged,
    };
  }, documentTransactionOptions);
}
export async function archiveDocumentInTransaction(
  tx: DocumentTx,
  endpoint: StoredEndpoint,
  actor: DocumentActor,
  action = "deleted",
) {
  await ensureDocumentBaseline(tx, endpoint);
  const archived = await tx.apiEndpoint.update({
    where: { id: endpoint.id },
    data: { deletedAt: new Date(), version: { increment: 1 } },
    include: documentInclude,
  });
  await recordDocumentRevision(tx, archived, actor, action);
  return archived;
}
export async function archiveDocument(
  id: string,
  actor: DocumentActor,
  input: Record<string, unknown>,
) {
  return prisma.$transaction(async (tx) => {
    const { endpoint } = await authorizedEndpoint(tx, id, actor);
    if (requireVersion(input.version) !== endpoint.version)
      throw new DocumentError(
        "接口已变化，请重新载入后再移入回收站",
        409,
        "DOCUMENT_CHANGED",
      );
    if (endpoint.deletedAt) throw new DocumentError("接口已在回收站中", 410);
    const updated = await archiveDocumentInTransaction(tx, endpoint, actor);
    const layout = await bumpLayout(tx, endpoint.projectId);
    return {
      id,
      version: updated.version,
      layoutVersion: layout.layoutVersion,
    };
  }, documentTransactionOptions);
}
export async function createDocument(
  projectId: string,
  actor: DocumentActor,
  input: Record<string, unknown>,
) {
  return prisma.$transaction(async (tx) => {
    await lockDocumentProject(tx, projectId, actor);
    const fields = normalizeSection("basic", {
      ...input,
      method: input.method || "GET",
    });
    if (!fields.name || !fields.path || !fields.method)
      throw new DocumentError("请填写名称、方法与路径");
    const folderId = typeof input.folderId === "string" ? input.folderId : null;
    if (!(await folderValid(tx, projectId, folderId)))
      throw new DocumentError("目录不正确");
    const last = await tx.apiEndpoint.aggregate({
      where: { projectId, deletedAt: null },
      _max: { order: true },
    });
    const endpoint = await tx.apiEndpoint.create({
      data: {
        projectId,
        createdById: actor.id,
        folderId,
        name: String(fields.name),
        method: String(fields.method),
        path: String(fields.path),
        description: String(fields.description || ""),
        order: (last._max.order ?? -1) + 1,
      },
      include: documentInclude,
    });
    await recordDocumentRevision(tx, endpoint, actor, "created");
    const layout = await bumpLayout(tx, projectId);
    return { ...endpoint, projectLayoutVersion: layout.layoutVersion };
  }, documentTransactionOptions);
}
export async function copyDocument(
  id: string,
  actor: DocumentActor,
  input: Record<string, unknown>,
) {
  return prisma.$transaction(async (tx) => {
    const { endpoint: source } = await authorizedEndpoint(tx, id, actor);
    if (source.deletedAt) throw new DocumentError("接口已移入回收站", 410);
    if (
      input.version !== undefined &&
      requireVersion(input.version) !== source.version
    )
      throw new DocumentError("接口已变化，请刷新后再复制", 409);
    const content = await snapshot(tx, source);
    if (!(await folderValid(tx, source.projectId, content.folderId)))
      content.folderId = null;
    const created = await tx.apiEndpoint.create({
      data: {
        projectId: source.projectId,
        createdById: actor.id,
        name: `${source.name || source.path} 副本`,
        method: source.method,
        path: source.path,
        description: source.description,
        folderId: content.folderId,
        order: source.order + 1,
        serverUrl: source.serverUrl,
        auth: source.auth,
        sourceImportId: source.sourceImportId,
        sourcePointer: source.sourcePointer,
        sourceDefinition: source.sourceDefinition,
        sourceBaseline: source.sourceBaseline,
        parameters: {
          create: content.parameters.map((p, order) => ({ ...p, order })),
        },
        headers: {
          create: content.headers.map((h, order) => ({ ...h, order })),
        },
        responses: {
          create: content.responses.map((r, order) => ({ ...r, order })),
        },
        ...(content.requestBody
          ? { requestBody: { create: content.requestBody } }
          : {}),
      },
      include: documentInclude,
    });
    await recordDocumentRevision(tx, created, actor, "copied");
    const layout = await bumpLayout(tx, source.projectId);
    return { ...created, projectLayoutVersion: layout.layoutVersion };
  }, documentTransactionOptions);
}
export async function readDocumentHistory(
  id: string,
  actor: DocumentActor,
  beforeVersion?: number,
) {
  return prisma.$transaction(async (tx) => {
    const { endpoint } = await authorizedEndpoint(tx, id, actor);
    const rows = await tx.endpointRevision.findMany({
      where: {
        endpointId: id,
        ...(beforeVersion ? { version: { lt: beforeVersion } } : {}),
      },
      orderBy: { version: "desc" },
      take: 21,
      select: {
        id: true,
        version: true,
        action: true,
        actorName: true,
        createdAt: true,
      },
    });
    const items = rows.slice(0, 20);
    return {
      items,
      next: rows.length > 20 ? items.at(-1)!.version : null,
      version: endpoint.version,
      deletedAt: endpoint.deletedAt,
    };
  }, documentTransactionOptions);
}
export async function readDocumentRevision(
  id: string,
  revisionId: string,
  actor: DocumentActor,
) {
  return prisma.$transaction(async (tx) => {
    const { endpoint } = await authorizedEndpoint(tx, id, actor);
    const revision = await tx.endpointRevision.findFirst({
      where: { id: revisionId, endpointId: id },
    });
    if (!revision) throw new DocumentError("此版本不存在或已超过保留范围", 404);
    return {
      revision: {
        id: revision.id,
        version: revision.version,
        action: revision.action,
        actorName: revision.actorName,
        createdAt: revision.createdAt,
      },
      snapshot: JSON.parse(revision.snapshot) as DocumentSnapshot,
      current: await snapshot(tx, endpoint),
      version: endpoint.version,
      deletedAt: endpoint.deletedAt,
    };
  }, documentTransactionOptions);
}
export async function restoreDocument(
  id: string,
  revisionId: string | undefined,
  actor: DocumentActor,
  input: Record<string, unknown>,
) {
  return prisma.$transaction(async (tx) => {
    const { endpoint, project } = await authorizedEndpoint(tx, id, actor);
    if (requireVersion(input.version) !== endpoint.version)
      throw new DocumentError(
        "接口在对比后又发生了变化，请重新对比再恢复",
        409,
        "DOCUMENT_CHANGED",
      );
    const revision = revisionId
      ? await tx.endpointRevision.findFirst({
          where: { id: revisionId, endpointId: id },
        })
      : null;
    if (revisionId && !revision)
      throw new DocumentError("此版本不存在或已超过保留范围", 404);
    const content: DocumentSnapshot = revision
      ? JSON.parse(revision.snapshot)
      : await snapshot(tx, endpoint);
    if (!revision && !endpoint.deletedAt)
      throw new DocumentError("接口不在回收站中");
    if (input.path !== undefined)
      Object.assign(content, normalizeSection("basic", { path: input.path }));
    let notice = "";
    if (!(await folderValid(tx, endpoint.projectId, content.folderId))) {
      content.folderId = null;
      notice = "原目录已不存在，接口已恢复到根目录";
    }
    if (
      endpoint.deletedAt ||
      endpoint.path !== content.path ||
      endpoint.method !== content.method
    ) {
      const duplicate = await tx.apiEndpoint.findFirst({
        where: {
          projectId: endpoint.projectId,
          deletedAt: null,
          path: content.path,
          method: content.method,
          NOT: { id },
        },
        select: { id: true },
      });
      if (duplicate)
        throw new DocumentError(
          "已有相同方法和路径的接口，请填写新的恢复路径",
          409,
          "RESTORE_PATH_CONFLICT",
        );
    }
    if (endpoint.sourceImportId) {
      const source = await tx.specificationImport.findFirst({
        where: { id: endpoint.sourceImportId, projectId: endpoint.projectId },
      });
      if (source && !source.active) {
        const data = await tx.project.findUniqueOrThrow({
          where: { id: endpoint.projectId },
          include: {
            folders: true,
            endpoints: {
              where: { deletedAt: null, NOT: { id } },
              include: documentInclude,
            },
            specificationImports: { where: { active: true } },
            environments: true,
            globalHeaders: true,
            globalParams: true,
          },
        });
        const candidate = {
          ...endpoint,
          ...content,
          deletedAt: null,
        } as Endpoint;
        const preview = {
          ...data,
          endpoints: [...data.endpoints, candidate],
          specificationImports: [
            ...data.specificationImports,
            { ...source, active: true },
          ],
        };
        try {
          if (source.format === "openapi") exportImportedOpenApi(preview);
          else exportImportedPostman(preview);
        } catch (error) {
          throw new DocumentError(
            error instanceof Error ? error.message : "规范定义冲突，暂不能恢复",
            409,
          );
        }
        await tx.specificationImport.update({
          where: { id: source.id },
          data: { active: true },
        });
      }
    }
    await ensureDocumentBaseline(tx, endpoint);
    const updated = await applySnapshot(tx, id, content);
    await recordDocumentRevision(tx, updated, actor, "restored");
    const layout =
      endpoint.deletedAt ||
      endpoint.folderId !== content.folderId ||
      endpoint.order !== content.order
        ? await bumpLayout(tx, endpoint.projectId)
        : project;
    return {
      ...updated,
      projectLayoutVersion: layout.layoutVersion,
      restoreNotice: notice,
    };
  }, documentTransactionOptions);
}
export async function recycleBin(
  projectId: string,
  actor: DocumentActor,
  query = "",
  cursor?: string,
) {
  return prisma.$transaction(async (tx) => {
    const project = await lockDocumentProject(tx, projectId, actor);
    const where = {
      projectId,
      deletedAt: { not: null },
      ...(query
        ? {
            OR: [
              {
                name: {
                  contains: query.slice(0, 200),
                  mode: "insensitive" as const,
                },
              },
              {
                path: {
                  contains: query.slice(0, 200),
                  mode: "insensitive" as const,
                },
              },
            ],
          }
        : {}),
    };
    if (
      cursor &&
      !(await tx.apiEndpoint.findFirst({
        where: { ...where, id: cursor },
        select: { id: true },
      }))
    )
      throw new DocumentError("回收站列表已变化，请重新加载", 409);
    const rows = await tx.apiEndpoint.findMany({
      where,
      orderBy: [{ deletedAt: "desc" }, { id: "asc" }],
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        name: true,
        method: true,
        path: true,
        version: true,
        deletedAt: true,
        revisions: {
          orderBy: { version: "desc" },
          take: 1,
          select: { actorName: true, action: true },
        },
      },
      take: 51,
    });
    const items = rows.slice(0, 50).map(({ revisions, ...row }) => ({
      ...row,
      actorName: revisions[0]?.actorName || "",
      action: revisions[0]?.action || "deleted",
    }));
    return {
      items,
      next: rows.length > 50 ? items.at(-1)!.id : null,
      total: await tx.apiEndpoint.count({ where }),
      layoutVersion: project.layoutVersion,
    };
  }, documentTransactionOptions);
}

export async function exportDocumentRevision(
  id: string,
  revisionId: string,
  actor: DocumentActor,
) {
  return prisma.$transaction(async (tx) => {
    const { endpoint, project } = await authorizedEndpoint(tx, id, actor);
    const revision = await tx.endpointRevision.findFirst({
      where: { id: revisionId, endpointId: id },
    });
    if (!revision)
      throw new DocumentError("历史版本不存在或已超过保留范围", 404);
    const content = JSON.parse(revision.snapshot) as DocumentSnapshot;
    const source = endpoint.sourceImportId
      ? await tx.specificationImport.findFirst({
          where: { id: endpoint.sourceImportId, projectId: endpoint.projectId },
        })
      : null;
    const folders = content.folderLabel.map((name, index) => ({
      id: `history-folder-${index}`,
      parentId: index ? `history-folder-${index - 1}` : null,
      name,
    }));
    const preview = {
      ...project,
      folders,
      endpoints: [
        {
          ...endpoint,
          ...content,
          folderId: folders.at(-1)?.id || null,
          deletedAt: null,
        },
      ],
      specificationImports: source ? [{ ...source, active: true }] : [],
      environments: [],
      globalHeaders: [],
      globalParams: [],
    };
    try {
      return {
        version: revision.version,
        document: serializeSpecification(
          source?.format === "postman"
            ? exportImportedPostman(preview)
            : exportImportedOpenApi(preview),
          "json",
        ),
      };
    } catch (error) {
      throw new DocumentError(
        error instanceof Error ? error.message : "导出失败",
      );
    }
  }, documentTransactionOptions);
}
