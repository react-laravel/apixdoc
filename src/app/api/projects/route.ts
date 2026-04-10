import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { type ApiResponse } from "@/lib/utils";

export async function GET(
  request: Request
): Promise<NextResponse<ApiResponse>> {
  try {
    const session = await auth();
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organizationId");

    if (!organizationId) {
      return NextResponse.json(
        { success: false, error: "organizationId is required" },
        { status: 400 }
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
          select: { endpoints: true, folders: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: projects });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to fetch projects" },
      { status: 500 }
    );
  }
}

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
    const { name, description, organizationId, baseUrl } = body;

    if (!name || !organizationId) {
      return NextResponse.json(
        { success: false, error: "Name and organizationId are required" },
        { status: 400 }
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

    if (!member) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 }
      );
    }

    const project = await prisma.project.create({
      data: {
        name,
        description: description || "",
        baseUrl: baseUrl || "",
        organizationId,
        createdById: session.user.id,
      },
    });

    return NextResponse.json(
      { success: true, data: project },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to create project" },
      { status: 500 }
    );
  }
}
