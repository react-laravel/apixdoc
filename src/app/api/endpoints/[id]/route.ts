import { documentActor } from "@/lib/documents/routes";
import {
  documentInclude,
  updateDocument,
  archiveDocument,
} from "@/lib/documents/service";
import {
  documentSuccess,
  documentFailure,
  documentBody,
} from "@/lib/documents/http";
import { readPublishedDocument } from "@/lib/publications/service";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getProjectAccess } from "@/lib/permissions";
import { sanitizeDocumentationEndpoint } from "@/lib/documentation/privacy";
import { type ApiResponse } from "@/lib/utils";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse<ApiResponse>> {
  try {
    const { id } = await params;

    const endpoint = await prisma.$transaction(
      (tx) =>
        tx.apiEndpoint.findUnique({
          where: { id },
          include: {
            ...documentInclude,
            project: {
              select: {
                id: true,
                name: true,
                isPublic: true,
                organizationId: true,
              },
            },
          },
        }),
      { isolationLevel: "RepeatableRead" },
    );

    if (!endpoint) {
      return NextResponse.json(
        { success: false, error: "Endpoint not found" },
        { status: 404 },
      );
    }

    const session = await auth();
    const { permissions, membership } = await getProjectAccess(
      endpoint.project.id,
      session?.user?.id,
    );
    if (!permissions.canRead)
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    if (!membership) {
      try {
        const published = await readPublishedDocument(
          endpoint.project.id,
          session?.user?.id,
        );
        const item = published.endpoints.find((item) => item.id === id);
        return item
          ? documentSuccess(item)
          : NextResponse.json(
              { success: false, error: "接口未发布" },
              { status: 404 },
            );
      } catch (error) {
        return documentFailure(error);
      }
    }
    if (endpoint.deletedAt)
      return NextResponse.json(
        {
          success: false,
          error: permissions.canReadConfiguration
            ? "接口已移入回收站"
            : "接口不存在",
        },
        { status: permissions.canReadConfiguration ? 410 : 404 },
      );
    return NextResponse.json({
      success: true,
      data: permissions.canReadConfiguration
        ? endpoint
        : sanitizeDocumentationEndpoint(endpoint),
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to fetch endpoint" },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const actor = await documentActor(id);
    return documentSuccess(
      await updateDocument(id, actor, "basic", await documentBody(request)),
    );
  } catch (error) {
    return documentFailure(error);
  }
}
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const actor = await documentActor(id);
    return documentSuccess(
      await archiveDocument(id, actor, await documentBody(request)),
    );
  } catch (error) {
    return documentFailure(error);
  }
}
