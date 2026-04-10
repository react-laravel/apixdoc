import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { type ApiResponse } from "@/lib/utils";

export async function POST(
  request: Request
): Promise<NextResponse<ApiResponse>> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { name, projectId, parentId } = body;

    if (!name || !projectId) {
      return NextResponse.json(
        { success: false, error: "Name and projectId are required" },
        { status: 400 }
      );
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 }
      );
    }

    const member = await prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId: session.user.id,
          organizationId: project.organizationId,
        },
      },
    });

    if (!member) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 }
      );
    }

    if (parentId) {
      const parentFolder = await prisma.folder.findFirst({
        where: { id: parentId, projectId },
        select: { id: true },
      });

      if (!parentFolder) {
        return NextResponse.json(
          { success: false, error: "Invalid parent folder" },
          { status: 400 }
        );
      }
    }

    const folder = await prisma.folder.create({
      data: {
        name,
        projectId,
        parentId: parentId || null,
      },
    });

    return NextResponse.json(
      { success: true, data: folder },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to create folder" },
      { status: 500 }
    );
  }
}
