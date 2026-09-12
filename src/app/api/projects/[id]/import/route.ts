import {
  ensureFolderIsolation,
  lockDocumentProject,
  archiveDocumentInTransaction,
  recordDocumentRevision,
  documentInclude,
  bumpLayout,
} from "@/lib/documents/service";
import { DocumentError } from "@/lib/documents/http";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canEditContent, canManageProject } from "@/lib/permissions";
import { createImportPlan } from "@/lib/specification/import";
import { previewImport } from "@/lib/specification/preview";

const include = {
  folders: true,
  endpoints: {
    where: { deletedAt: null },
    include: {
      parameters: true,
      headers: true,
      requestBody: true,
      responses: true,
    },
  },
  specificationImports: { where: { active: true } },
  environments: true,
  globalHeaders: true,
  globalParams: true,
};
class ImportError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  const { id } = await params;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > 3 * 1024 * 1024)
      throw new ImportError("请求不能超过 3 MB");
    const body = JSON.parse(raw);
    if (
      typeof body.source !== "string" ||
      !["append", "replace"].includes(body.mode) ||
      !["preview", "commit"].includes(body.action)
    )
      throw new ImportError("导入参数不正确");
    const result = await prisma.$transaction(
      async (tx) => {
        await lockDocumentProject(tx, id, session.user!);
        const project = await tx.project.findUnique({ where: { id }, include });
        if (!project) throw new ImportError("Project not found", 404);
        const member = await tx.organizationMember.findUnique({
          where: {
            userId_organizationId: {
              userId: session.user!.id!,
              organizationId: project.organizationId,
            },
          },
        });
        if (
          !canEditContent(member?.role) ||
          (body.mode === "replace" && !canManageProject(member?.role))
        )
          throw new ImportError("Forbidden", 403);
        const plan = createImportPlan(body.source);
        const preview = previewImport(project, plan, body.mode);
        if (body.action === "preview") return preview.summary;
        if (body.revision !== preview.summary.revision)
          throw new ImportError(
            "项目在预览后已发生变化，请重新预览后导入",
            409,
          );
        if (body.mode === "replace" && body.confirmation !== project.name)
          throw new ImportError("请输入完整项目名称以确认替换");
        if (body.mode === "replace") {
          await ensureFolderIsolation(
            tx,
            id,
            project.folders.map((folder) => folder.id),
          );
          const oldEndpoints = await tx.apiEndpoint.findMany({
            where: { projectId: id, deletedAt: null },
            include: documentInclude,
          });
          for (const endpoint of oldEndpoints)
            await archiveDocumentInTransaction(
              tx,
              endpoint,
              session.user!,
              "replaced",
            );
          await tx.folder.deleteMany({ where: { projectId: id } });
          await tx.specificationImport.updateMany({
            where: { projectId: id, active: true },
            data: { active: false },
          });
        }
        const source = await tx.specificationImport.create({
          data: {
            projectId: id,
            name: plan.name,
            format: plan.format,
            version: plan.version,
            document: plan.document,
            pointers: JSON.stringify(
              plan.endpoints.map((e) => e.sourcePointer),
            ),
          },
        });
        const folders = body.mode === "append" ? [...project.folders] : [];
        for (const [index, endpoint] of preview.accepted.entries()) {
          let parentId: string | null = null;
          for (const name of endpoint.folderPath) {
            let folder = folders.find(
              (f) => f.name === name && f.parentId === parentId,
            );
            if (!folder) {
              folder = await tx.folder.create({
                data: { name, parentId, projectId: id, order: folders.length },
              });
              folders.push(folder);
            }
            parentId = folder.id;
          }
          const {
            folderPath,
            parameters,
            headers,
            requestBody,
            responses,
            ...fields
          } = endpoint;
          void folderPath;
          const created = await tx.apiEndpoint.create({
            data: {
              ...fields,
              projectId: id,
              folderId: parentId,
              createdById: session.user!.id!,
              sourceImportId: source.id,
              order:
                (body.mode === "append"
                  ? Math.max(-1, ...project.endpoints.map((e) => e.order)) + 1
                  : 0) + index,
              parameters: {
                create: parameters?.map((p, order) => ({ ...p, order })),
              },
              headers: {
                create: headers?.map((h, order) => ({ ...h, order })),
              },
              ...(requestBody ? { requestBody: { create: requestBody } } : {}),
              responses: {
                create: responses?.map((r, order) => ({ ...r, order })),
              },
            },
            include: documentInclude,
          });
          await recordDocumentRevision(tx, created, session.user!, "imported");
        }
        await bumpLayout(tx, id);
        if (body.importEnvironments === true && plan.environments.length) {
          const names = new Set(project.environments.map((env) => env.name));
          await tx.environment.createMany({
            data: plan.environments.map((env, index) => {
              let name = env.name;
              let suffix = 2;
              while (names.has(name)) name = `${env.name} (${suffix++})`;
              names.add(name);
              return {
                ...env,
                name,
                projectId: id,
                isDefault: project.environments.length === 0 && index === 0,
              };
            }),
          });
        }
        await tx.project.update({
          where: { id },
          data: { updatedAt: new Date() },
        });
        return { ...preview.summary, sourceId: source.id };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 60000,
        maxWait: 5000,
      },
    );
    return NextResponse.json(
      { success: true, data: result },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    const conflict =
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034";
    return NextResponse.json(
      {
        success: false,
        error: conflict
          ? "项目正在被其他人修改，请重新预览后导入"
          : error instanceof Error
            ? error.message
            : "导入失败",
      },
      {
        status: conflict
          ? 409
          : error instanceof ImportError || error instanceof DocumentError
            ? error.status
            : 400,
      },
    );
  }
}
