import { operationFailure } from "@/lib/operations/failures";
import { appendAudit } from "@/lib/audit/write";
import { readPublishedDocument } from "@/lib/publications/service";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canEditContent } from "@/lib/permissions";
import { type ApiResponse } from "@/lib/utils";

export async function GET(
  request: Request,
): Promise<NextResponse<ApiResponse>> {
  try {
    const session = await auth();
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organizationId");

    if (!organizationId) {
      return NextResponse.json(
        { success: false, error: "organizationId is required" },
        { status: 400 },
      );
    }

    const isMember = session?.user
      ? await prisma.organizationMember.findUnique({
          where: {
            userId_organizationId: {
              userId: session.user.id,
              organizationId,
            },
          },
        })
      : null;

    const projects = await prisma.project.findMany({
      where: {
        organizationId,
        ...(isMember ? {} : { isPublic: true }),
      },
      include: {
        createdBy: {
          select: { id: true, name: true },
        },
        _count: {
          select: { endpoints: { where: { deletedAt: null } }, folders: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!isMember) {
      const published = [];
      for (const project of projects) {
        try {
          const document = await readPublishedDocument(
            project.id,
            session?.user?.id,
          );
          published.push({
            id: document.id,
            name: document.name,
            description: document.description,
            baseUrl: document.baseUrl,
            isPublic: document.isPublic,
            createdAt: project.createdAt,
            _count: {
              endpoints: document.endpoints.length,
              folders: document.folders.length,
            },
          });
        } catch {
          /* Unpublished entries are not part of the public catalog. */
        }
      }
      return NextResponse.json(
        { success: true, data: published },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    return NextResponse.json({ success: true, data: projects });
  } catch (error) {
    return operationFailure(error, "projects");
  }
}

export async function POST(
  request: Request,
): Promise<NextResponse<ApiResponse>> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const body = await request.json();
    const { name, description, organizationId, baseUrl } = body;

    if (!name || !organizationId) {
      return NextResponse.json(
        { success: false, error: "Name and organizationId are required" },
        { status: 400 },
      );
    }

    const member = await prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId: session.user.id,
          organizationId,
        },
      },
    });

    if (!canEditContent(member?.role)) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }

    const project = await prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          name,
          description: description || "",
          baseUrl: baseUrl || "",
          organizationId,
          createdById: session.user.id,
        },
      });
      await appendAudit(tx, {
        actor: session.user!,
        projectId: created.id,
        action: "project.created",
        targetId: created.id,
        targetName: created.name,
      });
      return created;
    });

    return NextResponse.json({ success: true, data: project }, { status: 201 });
  } catch (error) {
    return operationFailure(error, "projects");
  }
}
