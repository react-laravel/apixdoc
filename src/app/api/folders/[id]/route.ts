import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { type ApiResponse } from "@/lib/utils";

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

    const folder = await prisma.folder.findUnique({
      where: { id },
      include: { project: true },
    });

    if (!folder) {
      return NextResponse.json(
        { success: false, error: "Folder not found" },
        { status: 404 },
      );
    }

    const member = await prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId: session.user.id,
          organizationId: folder.project.organizationId,
        },
      },
    });

    if (!member) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const { name, order, parentId } = body;

    if (parentId === id) {
      return NextResponse.json(
        { success: false, error: "A folder cannot be its own parent" },
        { status: 400 },
      );
    }

    if (parentId) {
      const parentFolder = await prisma.folder.findFirst({
        where: { id: parentId, projectId: folder.projectId },
        select: { id: true },
      });

      if (!parentFolder) {
        return NextResponse.json(
          { success: false, error: "Invalid parent folder" },
          { status: 400 },
        );
      }
    }

    const updated = await prisma.folder.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(order !== undefined && { order }),
        ...(parentId !== undefined && { parentId }),
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to update folder" },
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

    const folder = await prisma.folder.findUnique({
      where: { id },
      include: { project: true },
    });

    if (!folder) {
      return NextResponse.json(
        { success: false, error: "Folder not found" },
        { status: 404 },
      );
    }

    const member = await prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId: session.user.id,
          organizationId: folder.project.organizationId,
        },
      },
    });

    if (!member) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }

    await prisma.folder.delete({ where: { id } });

    return NextResponse.json({ success: true, data: { id } });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to delete folder" },
      { status: 500 },
    );
  }
}
