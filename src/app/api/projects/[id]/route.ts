import { documentInclude } from "@/lib/documents/service";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { type ApiResponse } from "@/lib/utils";
import { getProjectAccess } from "@/lib/permissions";
import { sanitizeDocumentationProject } from "@/lib/documentation/privacy";
import {
  settingsInclude,
  saveProjectSettings,
} from "@/lib/project-settings-service";
import { readPublishedDocument } from "@/lib/publications/service";
import {
  documentBody,
  documentSuccess,
  documentFailure,
} from "@/lib/documents/http";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<ApiResponse>> {
  try {
    const session = await auth();
    const { id } = await params;

    const { project, permissions, membership } = await getProjectAccess(
      id,
      session?.user?.id,
    );

    if (!project) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 },
      );
    }

    if (!permissions.canRead) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }

    if (!membership) {
      try {
        return documentSuccess({
          ...(await readPublishedDocument(id, session?.user?.id)),
          permissions,
        });
      } catch (error) {
        return documentFailure(error);
      }
    }
    const endpointInclude = documentInclude;

    const fullProject = await prisma.$transaction(
      (tx) =>
        tx.project.findUnique({
          where: { id },
          include: {
            folders: {
              orderBy: { order: "asc" },
              include: {
                endpoints: {
                  where: { projectId: id, deletedAt: null },
                  orderBy: { order: "asc" },
                  include: endpointInclude,
                },
              },
            },
            endpoints: {
              where: { folderId: null, deletedAt: null },
              orderBy: { order: "asc" },
              include: endpointInclude,
            },
            specificationImports: { where: { active: true } },
            globalHeaders: settingsInclude.globalHeaders,
            globalParams: settingsInclude.globalParams,
            environments: settingsInclude.environments,
            createdBy: {
              select: { id: true, name: true },
            },
          },
        }),
      { isolationLevel: "RepeatableRead" },
    );

    return NextResponse.json(
      {
        success: true,
        data: fullProject && {
          ...(permissions.canReadConfiguration
            ? {
                ...fullProject,
                specificationImports: fullProject.specificationImports?.map(
                  ({ id, name, format, version, createdAt }) => ({
                    id,
                    name,
                    format,
                    version,
                    createdAt,
                  }),
                ),
              }
            : {
                ...sanitizeDocumentationProject(fullProject),
                isDraftPreview: true,
              }),
          permissions,
        },
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to fetch project" },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<ApiResponse>> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const { id } = await params;
    const { permissions } = await getProjectAccess(id, session.user.id);

    if (!permissions.canConfigure) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }

    try {
      return documentSuccess(
        await saveProjectSettings(
          id,
          session.user,
          await documentBody(request),
        ),
      );
    } catch (error) {
      return documentFailure(error);
    }
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to update project" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<ApiResponse>> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const { id } = await params;
    const { permissions } = await getProjectAccess(id, session.user.id);

    if (!permissions.canManage) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }

    await prisma.project.delete({ where: { id } });

    return NextResponse.json({ success: true, data: { id } });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to delete project" },
      { status: 500 },
    );
  }
}
