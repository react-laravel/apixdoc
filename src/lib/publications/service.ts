import { appendAudit } from "@/lib/audit/write";
import type { AuditAction } from "@/lib/audit/model";
import { prisma } from "@/lib/prisma";
import { projectPermissions, canManageProject } from "@/lib/permissions";
import {
  lockDocumentProject,
  type DocumentActor,
  documentTransactionOptions,
} from "@/lib/documents/service";
import { DocumentError } from "@/lib/documents/http";
import {
  publicationDraft,
  ensurePublicationBaseline,
  previewFingerprint,
} from "./storage";
import type { Project } from "@/lib/types";
const summarySelect = {
  id: true,
  number: true,
  title: true,
  note: true,
  actorName: true,
  createdAt: true,
  revokedAt: true,
};
function versionMatches(actual: number, expected: unknown) {
  if (!Number.isSafeInteger(expected) || actual !== expected)
    throw new DocumentError(
      "发布状态已变化，请重新载入后确认",
      409,
      "PUBLICATION_CHANGED",
    );
}
export async function publicationStatus(
  id: string,
  actor: DocumentActor,
  before?: number,
) {
  return prisma.$transaction(async (tx) => {
    const project = await lockDocumentProject(tx, id, actor);
    let draft: Awaited<ReturnType<typeof publicationDraft>> | null = null;
    let draftError: string | null = null;
    try {
      draft = await publicationDraft(tx, id);
    } catch (error) {
      draftError =
        error instanceof Error ? error.message : "工作区暂时无法生成发布预览";
    }
    const current = project.publishedDocumentId
      ? await tx.publishedDocument.findFirst({
          where: {
            id: project.publishedDocumentId,
            projectId: id,
            revokedAt: null,
          },
        })
      : null;
    const rows = await tx.publishedDocument.findMany({
      where: { projectId: id, ...(before ? { number: { lt: before } } : {}) },
      orderBy: { number: "desc" },
      take: 21,
      select: summarySelect,
    });
    const items = rows.slice(0, 20);
    return {
      version: project.publicationVersion,
      fingerprint: draft
        ? previewFingerprint(draft.fingerprint, project.isPublic)
        : null,
      draftError,
      projectName: project.name,
      changed: !draft || !current || current.fingerprint !== draft.fingerprint,
      currentId: current?.id || null,
      currentTitle: current?.title || null,
      isPublic: project.isPublic,
      endpoints:
        draft?.content.endpoints.length ??
        (await tx.apiEndpoint.count({
          where: { projectId: id, deletedAt: null },
        })),
      folders:
        draft?.content.folders.length ??
        (await tx.folder.count({ where: { projectId: id } })),
      items,
      next: rows.length > 20 ? items.at(-1)!.number : null,
      events: await tx.publicationEvent.findMany({
        where: { projectId: id },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
    };
  }, documentTransactionOptions);
}
export async function changePublication(
  id: string,
  actor: DocumentActor,
  input: Record<string, unknown>,
) {
  return prisma.$transaction(async (tx) => {
    const project = await lockDocumentProject(tx, id, actor);
    const member = await tx.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId: actor.id,
          organizationId: project.organizationId,
        },
      },
    });
    if (!canManageProject(member?.role))
      throw new DocumentError("只有项目管理员可以发布或撤回文档", 403);
    versionMatches(project.publicationVersion, input.version);
    let publicationId: string | null = null;
    let affectedCount = 0;
    if (input.action === "publish") {
      const draft = await publicationDraft(tx, id);
      if (
        input.fingerprint !==
        previewFingerprint(draft.fingerprint, project.isPublic)
      )
        throw new DocumentError(
          "文档或访问范围在预览后已变化，请重新检查再发布",
          409,
          "DRAFT_CHANGED",
        );
      const title = typeof input.title === "string" ? input.title.trim() : "";
      const note = typeof input.note === "string" ? input.note.trim() : "";
      if (!title || title.length > 80 || note.length > 2000)
        throw new DocumentError(
          "请填写 1–80 字的版本名称，发布说明最多 2000 字",
        );
      const publication = await tx.publishedDocument.create({
        data: {
          projectId: id,
          number: project.publicationSequence + 1,
          title,
          note,
          content: draft.serialized,
          fingerprint: draft.fingerprint,
          actorName: actor.name || actor.email || "项目管理员",
        },
      });
      publicationId = publication.id;
      await tx.project.update({
        where: { id },
        data: {
          publicationInitialized: true,
          publishedDocumentId: publicationId,
          publicationSequence: { increment: 1 },
          publicationVersion: { increment: 1 },
        },
      });
    } else if (input.action === "withdraw") {
      if (input.confirmation !== project.name)
        throw new DocumentError("请输入项目名称，确认停止所有版本的分享");
      const revoked = await tx.publishedDocument.updateMany({
        where: { projectId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      affectedCount = revoked.count;
      await tx.project.update({
        where: { id },
        data: {
          publishedDocumentId: null,
          publicationInitialized: true,
          publicationVersion: { increment: 1 },
        },
      });
    } else if (input.action === "activate" || input.action === "revoke") {
      if (typeof input.publicationId !== "string")
        throw new DocumentError("请选择发布版本");
      const publication = await tx.publishedDocument.findFirst({
        where: { id: input.publicationId, projectId: id, revokedAt: null },
      });
      if (!publication)
        throw new DocumentError("此发布版本不存在或链接已撤销", 404);
      publicationId = publication.id;
      if (input.action === "activate")
        await tx.project.update({
          where: { id },
          data: {
            publishedDocumentId: publication.id,
            publicationVersion: { increment: 1 },
          },
        });
      else {
        await tx.publishedDocument.update({
          where: { id: publication.id },
          data: { revokedAt: new Date() },
        });
        await tx.project.update({
          where: { id },
          data: {
            ...(project.publishedDocumentId === publication.id
              ? { publishedDocumentId: null }
              : {}),
            publicationVersion: { increment: 1 },
          },
        });
      }
    } else throw new DocumentError("发布操作不正确");
    await tx.publicationEvent.create({
      data: {
        projectId: id,
        publicationId,
        action: String(input.action),
        actorName: actor.name || actor.email || "项目管理员",
      },
    });
    const auditedPublication = publicationId
      ? await tx.publishedDocument.findFirst({
          where: { id: publicationId, projectId: id },
          select: { number: true, title: true },
        })
      : null;
    await appendAudit(tx, {
      actor,
      projectId: id,
      action: `publication.${input.action}` as AuditAction,
      targetId: publicationId,
      targetName: auditedPublication?.title || project.name,
      metadata: auditedPublication
        ? { version: auditedPublication.number }
        : { affectedCount },
    });
    return { publicationId };
  }, documentTransactionOptions);
}
/** ACL and withdrawal state are live even when content is pinned to an older release. */
export async function readPublishedDocument(
  id: string,
  userId?: string,
  releaseId?: string,
): Promise<Project> {
  return prisma.$transaction(async (tx) => {
    let project = await tx.project.findUnique({ where: { id } });
    if (!project) throw new DocumentError("文档不存在", 404);
    const authorize = async () => {
      const member = userId
        ? await tx.organizationMember.findUnique({
            where: {
              userId_organizationId: {
                userId,
                organizationId: project!.organizationId,
              },
            },
          })
        : null;
      if (!projectPermissions(member?.role, project!.isPublic).canRead)
        throw new DocumentError("无权访问此文档", userId ? 403 : 401);
    };
    await authorize();
    // Normal readers never serialize behind a write lock. Only the one-time legacy capture needs it.
    if (project.publicationInitialized === false) {
      await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id" = ${id} FOR UPDATE`;
      project = await tx.project.findUnique({ where: { id } });
      if (!project) throw new DocumentError("文档不存在", 404);
      await authorize();
      project = await ensurePublicationBaseline(tx, project);
    }
    if (!project.publishedDocumentId)
      throw new DocumentError("文档尚未发布或分享已停止", 404, "NOT_PUBLISHED");
    const publication = await tx.publishedDocument.findFirst({
      where: {
        id: releaseId || project.publishedDocumentId,
        projectId: id,
        revokedAt: null,
      },
    });
    if (!publication) throw new DocumentError("发布版本不存在或已撤销", 404);
    return {
      ...JSON.parse(publication.content),
      isPublic: project.isPublic,
      publication: {
        id: publication.id,
        number: publication.number,
        title: publication.title,
        createdAt: publication.createdAt.toISOString(),
      },
    };
  }, documentTransactionOptions);
}
export async function readDraftDocument(id: string, actor: DocumentActor) {
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({ where: { id } });
    if (!project) throw new DocumentError("项目不存在", 404);
    const member = await tx.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId: actor.id,
          organizationId: project.organizationId,
        },
      },
    });
    if (!projectPermissions(member?.role).canRead)
      throw new DocumentError("仅项目成员可以查看内部预览", 403);
    return {
      ...(await publicationDraft(tx, id)).content,
      isDraftPreview: true,
    };
  }, documentTransactionOptions);
}

export async function readStoredPublication(
  id: string,
  releaseId: string,
  actor: DocumentActor,
): Promise<Project> {
  return prisma.$transaction(
    async (tx) => {
      const project = await tx.project.findUnique({ where: { id } });
      if (!project) throw new DocumentError("项目不存在", 404);
      const member = await tx.organizationMember.findUnique({
        where: {
          userId_organizationId: {
            userId: actor.id,
            organizationId: project.organizationId,
          },
        },
      });
      if (!projectPermissions(member?.role).canReadConfiguration)
        throw new DocumentError("仅编辑成员可以查看内部发布记录", 403);
      const publication = await tx.publishedDocument.findFirst({
        where: { id: releaseId, projectId: id },
      });
      if (!publication) throw new DocumentError("发布记录不存在", 404);
      return {
        ...JSON.parse(publication.content),
        isPublic: project.isPublic,
        isPublicationPreview: true,
        publicationRevoked: !!publication.revokedAt,
        publication: {
          id: publication.id,
          number: publication.number,
          title: publication.title,
          createdAt: publication.createdAt.toISOString(),
        },
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
