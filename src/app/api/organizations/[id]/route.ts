import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { type ApiResponse } from "@/lib/utils";

export async function GET(
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
    const member = await prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId: session.user.id,
          organizationId: id,
        },
      },
    });

    if (!member) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 }
      );
    }

    const organization = await prisma.organization.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, email: true, name: true },
            },
          },
        },
      },
    });

    if (!organization) {
      return NextResponse.json(
        { success: false, error: "Organization not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: organization });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to fetch organization" },
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
    const member = await prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId: session.user.id,
          organizationId: id,
        },
      },
    });

    if (!member || (member.role !== "owner" && member.role !== "admin")) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, description } = body;

    const organization = await prisma.organization.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
      },
    });

    return NextResponse.json({ success: true, data: organization });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to update organization" },
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

    const member = await prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId: session.user.id,
          organizationId: id,
        },
      },
    });

    if (!member || member.role !== "owner") {
      return NextResponse.json(
        { success: false, error: "Only the owner can delete an organization" },
        { status: 403 }
      );
    }

    await prisma.organization.delete({ where: { id } });

    return NextResponse.json({ success: true, data: { id } });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to delete organization" },
      { status: 500 }
    );
  }
}
