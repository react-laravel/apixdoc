import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { type ApiResponse } from "@/lib/utils";

async function checkProjectAccess(
  projectId: string,
  userId?: string
): Promise<{
  project: Awaited<ReturnType<typeof prisma.project.findUnique>> | null;
  isMember: boolean;
}> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project || !userId) {
    return { project, isMember: false };
  }

  const member = await prisma.organizationMember.findUnique({
    where: {
      userId_organizationId: {
        userId,
        organizationId: project.organizationId,
      },
    },
  });

  return { project, isMember: !!member };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse>> {
  try {
    const session = await auth();
    const { id } = await params;

    const { project, isMember } = await checkProjectAccess(
      id,
      session?.user?.id
    );

    if (!project) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 }
      );
    }

    if (!project.isPublic && !isMember) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 }
      );
    }

    const endpointInclude = {
      parameters: true,
      headers: true,
      requestBody: true,
      responses: true,
    };

    const fullProject = await prisma.project.findUnique({
      where: { id },
      include: {
        folders: {
          orderBy: { order: "asc" },
          include: {
            endpoints: {
              orderBy: { order: "asc" },
              include: endpointInclude,
            },
          },
        },
        endpoints: {
          where: { folderId: null },
          orderBy: { order: "asc" },
          include: endpointInclude,
        },
        globalHeaders: true,
        globalParams: true,
        environments: true,
        createdBy: {
          select: { id: true, name: true },
        },
      },
    });

    return NextResponse.json({ success: true, data: fullProject });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to fetch project" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse>> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id } = await params;
    const { isMember } = await checkProjectAccess(id, session.user.id);

    if (!isMember) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, description, baseUrl, isPublic } = body;

    const project = await prisma.project.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(baseUrl !== undefined && { baseUrl }),
        ...(isPublic !== undefined && { isPublic }),
      },
    });

    return NextResponse.json({ success: true, data: project });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to update project" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse>> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id } = await params;
    const { isMember } = await checkProjectAccess(id, session.user.id);

    if (!isMember) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 }
      );
    }

    await prisma.project.delete({ where: { id } });

    return NextResponse.json({ success: true, data: { id } });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to delete project" },
      { status: 500 }
    );
  }
}
