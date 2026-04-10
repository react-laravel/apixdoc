import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isHttpRequestMethod } from "@/lib/security";
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
    const { name, method, path, description, projectId, folderId } = body;
    const normalizedMethod =
      typeof method === "string" ? method.toUpperCase() : "";

    if (!name || !normalizedMethod || !path || !projectId) {
      return NextResponse.json(
        {
          success: false,
          error: "Name, method, path, and projectId are required",
        },
        { status: 400 }
      );
    }

    if (!isHttpRequestMethod(normalizedMethod)) {
      return NextResponse.json(
        { success: false, error: "Unsupported HTTP method" },
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

    if (folderId) {
      const folder = await prisma.folder.findFirst({
        where: { id: folderId, projectId },
        select: { id: true },
      });

      if (!folder) {
        return NextResponse.json(
          { success: false, error: "Invalid folder" },
          { status: 400 }
        );
      }
    }

    const endpoint = await prisma.apiEndpoint.create({
      data: {
        name,
        method: normalizedMethod,
        path,
        description: description || "",
        projectId,
        folderId: folderId || null,
        createdById: session.user.id,
      },
    });

    return NextResponse.json(
      { success: true, data: endpoint },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to create endpoint" },
      { status: 500 }
    );
  }
}
