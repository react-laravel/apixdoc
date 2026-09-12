import { appendAudit } from "@/lib/audit/write";
import { prisma } from "@/lib/prisma";
import {
  ensureFolderIsolation,
  lockDocumentProject,
  documentInclude,
  ensureDocumentBaseline,
  recordDocumentRevision,
  bumpLayout,
  documentTransactionOptions,
  type DocumentActor,
} from "./service";
import { DocumentError, requireVersion } from "./http";
export async function changeLayout(
  projectId: string,
  actor: DocumentActor,
  input: Record<string, unknown>,
  action: "reorder" | "create" | "update" | "delete",
  folderId?: string,
) {
  return prisma.$transaction(async (tx) => {
    const project = await lockDocumentProject(tx, projectId, actor);
    if (
      action !== "create" &&
      requireVersion(input.version) !== project.layoutVersion
    )
      throw new DocumentError(
        "目录已被修改，请刷新后重试",
        409,
        "LAYOUT_CHANGED",
      );
    const folders = await tx.folder.findMany({ where: { projectId } });
    const current = folderId
      ? folders.find((f) => f.id === folderId)
      : undefined;
    if (folderId && !current) throw new DocumentError("目录不存在", 404);
    const proposed = folders.map((f) => ({ ...f }));
    const removed = new Set<string>();
    let endpointUpdates: {
      id: string;
      order: number;
      folderId: string | null;
    }[] = [];
    const edits: {
      id: string;
      order?: number;
      parentId?: string | null;
      name?: string;
    }[] = [];
    if (action === "reorder") {
      if (
        (input.folders !== undefined && !Array.isArray(input.folders)) ||
        (input.endpoints !== undefined && !Array.isArray(input.endpoints))
      )
        throw new DocumentError("目录排序格式不正确");
      for (const value of (input.folders as typeof edits) || []) {
        if (
          !value ||
          typeof value !== "object" ||
          typeof value.id !== "string" ||
          Object.keys(value).some(
            (key) => !["id", "order", "parentId"].includes(key),
          )
        )
          throw new DocumentError("目录排序包含不支持的字段");
        if (
          value.parentId !== undefined &&
          value.parentId !== null &&
          typeof value.parentId !== "string"
        )
          throw new DocumentError("父目录不正确");
        edits.push({
          id: value.id,
          ...(value.order !== undefined ? { order: value.order } : {}),
          ...(value.parentId !== undefined
            ? { parentId: value.parentId || null }
            : {}),
        });
      }
      endpointUpdates = ((input.endpoints as typeof endpointUpdates) || []).map(
        (value) => {
          if (
            !value ||
            typeof value !== "object" ||
            typeof value.id !== "string" ||
            Object.keys(value).some(
              (key) => !["id", "order", "folderId"].includes(key),
            )
          )
            throw new DocumentError("接口排序包含不支持的字段");
          return {
            id: value.id,
            order: value.order,
            folderId: value.folderId || null,
          };
        },
      );
    } else if (action === "update" || action === "create") {
      const name =
        typeof input.name === "string" ? input.name.trim() : current?.name;
      if (!name || name.length > 100)
        throw new DocumentError("请填写 1–100 字的目录名称");
      if (
        (action === "create" || name !== current?.name) &&
        folders.some(
          (f) =>
            f.id !== folderId &&
            f.name.trim().toLowerCase() === name.toLowerCase(),
        )
      )
        throw new DocumentError("目录名称已存在", 409);
      if (action === "create") {
        const parentId =
          input.parentId == null || input.parentId === ""
            ? null
            : String(input.parentId);
        if (parentId && !folders.some((f) => f.id === parentId))
          throw new DocumentError("父目录不正确");
        const created = await tx.folder.create({
          data: {
            projectId,
            name,
            parentId,
            order: Math.max(-1, ...folders.map((f) => f.order)) + 1,
          },
        });
        await appendAudit(tx, {
          actor,
          projectId,
          action: "folder.created",
          targetId: created.id,
          targetName: created.name,
        });
        const updatedProject = await bumpLayout(tx, projectId);
        return { ...created, layoutVersion: updatedProject.layoutVersion };
      }
      edits.push({
        id: folderId!,
        name,
        ...(input.parentId !== undefined
          ? { parentId: (input.parentId || null) as string | null }
          : {}),
        ...(input.order !== undefined ? { order: Number(input.order) } : {}),
      });
    } else {
      removed.add(folderId!);
      let previous = -1;
      while (previous !== removed.size) {
        previous = removed.size;
        for (const folder of folders)
          if (folder.parentId && removed.has(folder.parentId))
            removed.add(folder.id);
      }
    }
    if (
      edits.length > 5000 ||
      endpointUpdates.length > 5000 ||
      new Set(edits.map((f) => f.id)).size !== edits.length ||
      new Set(endpointUpdates.map((e) => e.id)).size !== endpointUpdates.length
    )
      throw new DocumentError("排序列表过大或有重复项");
    for (const edit of edits) {
      const item = proposed.find((f) => f.id === edit.id);
      if (!item) throw new DocumentError("目录引用不正确");
      if (
        edit.order !== undefined &&
        (!Number.isSafeInteger(edit.order) || edit.order < 0)
      )
        throw new DocumentError("排序值不正确");
      Object.assign(item, edit);
    }
    for (const folder of proposed) {
      const visited = new Set<string>();
      let id: string | null = folder.id;
      while (id) {
        if (visited.has(id)) throw new DocumentError("目录不能相互包含");
        visited.add(id);
        const parent = proposed.find((f) => f.id === id);
        if (!parent) throw new DocumentError("父目录引用不正确");
        id = parent.parentId;
      }
    }
    for (const edit of endpointUpdates)
      if (
        !Number.isSafeInteger(edit.order) ||
        edit.order < 0 ||
        (edit.folderId !== null && !folders.some((f) => f.id === edit.folderId))
      )
        throw new DocumentError("接口目录或排序不正确");
    const endpoints = await tx.apiEndpoint.findMany({
      where: { projectId, deletedAt: null },
      include: documentInclude,
    });
    if (
      endpointUpdates.some((edit) => !endpoints.some((e) => e.id === edit.id))
    )
      throw new DocumentError("接口引用不正确");
    const actualEdits = edits
      .map((edit) => {
        const previous = folders.find((folder) => folder.id === edit.id)!;
        return {
          id: edit.id,
          ...(edit.name !== undefined && edit.name !== previous.name
            ? { name: edit.name }
            : {}),
          ...(edit.parentId !== undefined && edit.parentId !== previous.parentId
            ? { parentId: edit.parentId }
            : {}),
          ...(edit.order !== undefined && edit.order !== previous.order
            ? { order: edit.order }
            : {}),
        };
      })
      .filter((edit) => Object.keys(edit).length > 1);
    if (
      !actualEdits.length &&
      !removed.size &&
      !endpointUpdates.some((edit) => {
        const previous = endpoints.find((endpoint) => endpoint.id === edit.id)!;
        return (
          previous.folderId !== edit.folderId || previous.order !== edit.order
        );
      })
    )
      return { id: folderId, layoutVersion: project.layoutVersion };
    const ancestryChanged = (id: string | null): boolean => {
      const seen = new Set<string>();
      while (id && !seen.has(id)) {
        seen.add(id);
        if (
          removed.has(id) ||
          actualEdits.some(
            (e) =>
              e.id === id && (e.name !== undefined || e.parentId !== undefined),
          )
        )
          return true;
        id = folders.find((f) => f.id === id)?.parentId || null;
      }
      return false;
    };
    if (removed.size) await ensureFolderIsolation(tx, projectId, [...removed]);
    const affected = endpoints.filter(
      (e) =>
        ancestryChanged(e.folderId) ||
        endpointUpdates.some(
          (update) =>
            update.id === e.id &&
            (update.folderId !== e.folderId || update.order !== e.order),
        ),
    );
    for (const endpoint of affected) await ensureDocumentBaseline(tx, endpoint);
    for (const edit of actualEdits) {
      const { id, ...data } = edit;
      await tx.folder.update({ where: { id }, data });
    }
    if (removed.size)
      await tx.folder.deleteMany({
        where: { id: { in: [...removed] }, projectId },
      });
    for (const endpoint of affected) {
      const edit = endpointUpdates.find((e) => e.id === endpoint.id);
      const updated = await tx.apiEndpoint.update({
        where: { id: endpoint.id },
        data: {
          ...(edit ? { folderId: edit.folderId, order: edit.order } : {}),
          version: { increment: 1 },
        },
        include: documentInclude,
      });
      await recordDocumentRevision(tx, updated, actor, "moved");
    }
    await appendAudit(tx, {
      actor,
      projectId,
      action:
        action === "delete"
          ? "folder.deleted"
          : action === "update"
            ? "folder.updated"
            : "project.reordered",
      targetId: folderId,
      targetName: current?.name,
      metadata: {
        affectedCount: affected.length,
        fields:
          action === "reorder"
            ? ["order", "parentId", "folderId"]
            : Object.keys(input).filter((key) => key !== "version"),
      },
    });
    const updatedProject = await bumpLayout(tx, projectId);
    return { id: folderId, layoutVersion: updatedProject.layoutVersion };
  }, documentTransactionOptions);
}
