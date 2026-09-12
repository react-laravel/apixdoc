import { DocumentError } from "@/lib/documents/http";
import { createHash } from "node:crypto";
import type { Prisma, Project as StoredProject } from "@prisma/client";
import { documentInclude } from "@/lib/documents/include";
import { sanitizeDocumentationProject } from "@/lib/documentation/privacy";
import type { Project } from "@/lib/types";
export const publicationInclude = {
  folders: { orderBy: [{ order: "asc" as const }, { id: "asc" as const }] },
  endpoints: {
    where: { deletedAt: null },
    orderBy: [{ order: "asc" as const }, { id: "asc" as const }],
    include: documentInclude,
  },
  specificationImports: { where: { active: true } },
};
export function publicationFingerprint(project: Project) {
  const { isPublic: _access, ...content } = project;
  void _access;
  return createHash("sha256").update(JSON.stringify(content)).digest("hex");
}
export function previewFingerprint(
  contentFingerprint: string,
  isPublic: boolean,
) {
  return createHash("sha256")
    .update(JSON.stringify([contentFingerprint, isPublic]))
    .digest("hex");
}
export async function publicationDraft(
  tx: Prisma.TransactionClient,
  id: string,
) {
  const project = await tx.project.findUniqueOrThrow({
    where: { id },
    include: publicationInclude,
  });
  const content = sanitizeDocumentationProject(project);
  const serialized = JSON.stringify(content);
  if (new TextEncoder().encode(serialized).length > 32 * 1024 * 1024)
    throw new DocumentError("发布文档超过 32 MB，请拆分项目或减少示例内容");
  return { content, serialized, fingerprint: publicationFingerprint(content) };
}
/** Existing workspaces get one sanitized baseline before their first read or write after migration. */
export async function ensurePublicationBaseline(
  tx: Prisma.TransactionClient,
  project: StoredProject,
): Promise<StoredProject> {
  if (project.publicationInitialized !== false) return project;
  const draft = await publicationDraft(tx, project.id);
  const document = await tx.publishedDocument.create({
    data: {
      projectId: project.id,
      number: project.publicationSequence + 1,
      title: "升级基线",
      note: "升级前文档的首次保留版本",
      content: draft.serialized,
      fingerprint: draft.fingerprint,
      actorName: "升级基线",
    },
  });
  await tx.publicationEvent.create({
    data: {
      projectId: project.id,
      publicationId: document.id,
      action: "baseline",
      actorName: "升级基线",
    },
  });
  return tx.project.update({
    where: { id: project.id },
    data: {
      publicationInitialized: true,
      publishedDocumentId: document.id,
      publicationSequence: { increment: 1 },
      publicationVersion: { increment: 1 },
    },
  });
}
