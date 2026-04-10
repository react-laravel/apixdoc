import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { type ApiResponse } from "@/lib/utils";

export async function POST(
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

    const { id: projectId } = await params;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 },
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
        { status: 403 },
      );
    }

    const body = await request.json();
    const {
      folders,
      endpoints,
    }: {
      folders?: Array<{ id: string; order: number; parentId?: string | null }>;
      endpoints?: Array<{
        id: string;
        order: number;
        folderId: string | null;
      }>;
    } = body;

    if (folders !== undefined && !Array.isArray(folders)) {
      return NextResponse.json(
        { success: false, error: "folders must be an array" },
        { status: 400 },
      );
    }

    if (endpoints !== undefined && !Array.isArray(endpoints)) {
      return NextResponse.json(
        { success: false, error: "endpoints must be an array" },
        { status: 400 },
      );
    }

    const folderUpdates = Array.isArray(folders) ? folders : [];
    const endpointUpdates = Array.isArray(endpoints) ? endpoints : [];

    if (folderUpdates.some((folder) => folder.parentId === folder.id)) {
      return NextResponse.json(
        { success: false, error: "A folder cannot be its own parent" },
        { status: 400 },
      );
    }

    const folderIdsToCheck = [
      ...new Set([
        ...folderUpdates.map((folder) => folder.id),
        ...folderUpdates.flatMap((folder) =>
          folder.parentId ? [folder.parentId] : [],
        ),
        ...endpointUpdates.flatMap((endpoint) =>
          endpoint.folderId ? [endpoint.folderId] : [],
        ),
      ]),
    ];
    const endpointIdsToCheck = [
      ...new Set(endpointUpdates.map((endpoint) => endpoint.id)),
    ];

    const [validFolders, validEndpoints] = await Promise.all([
      folderIdsToCheck.length === 0
        ? []
        : prisma.folder.findMany({
            where: {
              id: { in: folderIdsToCheck },
              projectId,
            },
            select: { id: true },
          }),
      endpointIdsToCheck.length === 0
        ? []
        : prisma.apiEndpoint.findMany({
            where: {
              id: { in: endpointIdsToCheck },
              projectId,
            },
            select: { id: true },
          }),
    ]);

    if (validFolders.length !== folderIdsToCheck.length) {
      return NextResponse.json(
        { success: false, error: "Invalid folder references" },
        { status: 400 },
      );
    }

    if (validEndpoints.length !== endpointIdsToCheck.length) {
      return NextResponse.json(
        { success: false, error: "Invalid endpoint references" },
        { status: 400 },
      );
    }

    const updates: Promise<unknown>[] = [];

    if (folders) {
      for (const f of folderUpdates) {
        updates.push(
          prisma.folder.update({
            where: { id: f.id },
            data: {
              order: f.order,
              ...(f.parentId !== undefined && { parentId: f.parentId }),
            },
          }),
        );
      }
    }

    if (endpoints) {
      for (const ep of endpointUpdates) {
        updates.push(
          prisma.apiEndpoint.update({
            where: { id: ep.id },
            data: { order: ep.order, folderId: ep.folderId },
          }),
        );
      }
    }

    await Promise.all(updates);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to reorder" },
      { status: 500 },
    );
  }
}
