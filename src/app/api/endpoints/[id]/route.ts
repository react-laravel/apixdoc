import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { type ApiResponse } from "@/lib/utils";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse>> {
  try {
    const { id } = await params;

    const endpoint = await prisma.apiEndpoint.findUnique({
      where: { id },
      include: {
        parameters: true,
        headers: true,
        requestBody: true,
        responses: {
          orderBy: { statusCode: "asc" },
        },
        project: {
          select: { id: true, name: true, isPublic: true, organizationId: true },
        },
      },
    });

    if (!endpoint) {
      return NextResponse.json(
        { success: false, error: "Endpoint not found" },
        { status: 404 }
      );
    }

    if (!endpoint.project.isPublic) {
      const session = await auth();
      if (!session?.user) {
        return NextResponse.json(
          { success: false, error: "Unauthorized" },
          { status: 401 }
        );
      }

      const member = await prisma.organizationMember.findUnique({
        where: {
          userId_organizationId: {
            userId: session.user.id,
            organizationId: endpoint.project.organizationId,
          },
        },
      });

      if (!member) {
        return NextResponse.json(
          { success: false, error: "Forbidden" },
          { status: 403 }
        );
      }
    }

    return NextResponse.json({ success: true, data: endpoint });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to fetch endpoint" },
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

    const endpoint = await prisma.apiEndpoint.findUnique({
      where: { id },
      include: { project: true },
    });

    if (!endpoint) {
      return NextResponse.json(
        { success: false, error: "Endpoint not found" },
        { status: 404 }
      );
    }

    const member = await prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId: session.user.id,
          organizationId: endpoint.project.organizationId,
        },
      },
    });

    if (!member) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, method, path, description, folderId, order } = body;

    const updated = await prisma.apiEndpoint.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(method !== undefined && { method }),
        ...(path !== undefined && { path }),
        ...(description !== undefined && { description }),
        ...(folderId !== undefined && { folderId }),
        ...(order !== undefined && { order }),
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to update endpoint" },
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

    const endpoint = await prisma.apiEndpoint.findUnique({
      where: { id },
      include: { project: true },
    });

    if (!endpoint) {
      return NextResponse.json(
        { success: false, error: "Endpoint not found" },
        { status: 404 }
      );
    }

    const member = await prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId: session.user.id,
          organizationId: endpoint.project.organizationId,
        },
      },
    });

    if (!member) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 }
      );
    }

    await prisma.apiEndpoint.delete({ where: { id } });

    return NextResponse.json({ success: true, data: { id } });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to delete endpoint" },
      { status: 500 }
    );
  }
}
