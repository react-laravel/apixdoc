import { documentInclude } from "@/lib/documents/service";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { type ApiResponse } from "@/lib/utils";
import { getProjectAccess } from "@/lib/permissions";
import { sanitizeDocumentationProject } from "@/lib/documentation/privacy";
import { parseProjectSettings } from "@/lib/project-settings";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<ApiResponse>> {
  try {
    const session = await auth();
    const { id } = await params;

    const { project, permissions } = await getProjectAccess(
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

    const endpointInclude = documentInclude;

    const fullProject = await prisma.project.findUnique({
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
        globalHeaders: true,
        globalParams: true,
        environments: true,
        createdBy: {
          select: { id: true, name: true },
        },
      },
    });

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
            : sanitizeDocumentationProject(fullProject)),
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
    const { permissions, project: currentProject } = await getProjectAccess(
      id,
      session.user.id,
    );

    if (!permissions.canConfigure) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }

    let data;
    try {
      const body = await request.json();
      if (
        body.isPublic !== undefined &&
        body.isPublic !== currentProject?.isPublic &&
        !permissions.canManage
      )
        return NextResponse.json(
          {
            success: false,
            error: "Only project managers can change visibility",
          },
          { status: 403 },
        );
      data = parseProjectSettings(body);
    } catch (error) {
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "设置格式不正确",
        },
        { status: 400 },
      );
    }

    const project = await prisma.project.update({
      where: { id },
      data,
      include: { environments: true, globalHeaders: true, globalParams: true },
    });

    return NextResponse.json({ success: true, data: project });
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
