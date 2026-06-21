import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { isOrganizationMemberRole } from "@/lib/security";
import { type ApiResponse } from "@/lib/utils";

export async function POST(
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

    const currentMember = await prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId: session.user.id,
          organizationId: id,
        },
      },
    });

    if (
      !currentMember ||
      (currentMember.role !== "owner" && currentMember.role !== "admin")
    ) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { email, role } = body;
    const normalizedRole =
      typeof role === "string" ? role.toLowerCase() : "member";
    const normalizedEmail =
      typeof email === "string" ? email.trim().toLowerCase() : "";

    if (!normalizedEmail) {
      return NextResponse.json(
        { success: false, error: "Email is required" },
        { status: 400 }
      );
    }

    if (!isOrganizationMemberRole(normalizedRole)) {
      return NextResponse.json(
        { success: false, error: "Invalid role" },
        { status: 400 }
      );
    }

    if (normalizedRole === "owner" && currentMember.role !== "owner") {
      return NextResponse.json(
        { success: false, error: "Only the owner can assign the owner role" },
        { status: 403 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (!user) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }

    const existingMember = await prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: id,
        },
      },
    });

    if (existingMember) {
      return NextResponse.json(
        { success: false, error: "User is already a member" },
        { status: 409 }
      );
    }

    const member = await prisma.organizationMember.create({
      data: {
        userId: user.id,
        organizationId: id,
        role: normalizedRole,
      },
      include: {
        user: {
          select: { id: true, email: true, name: true },
        },
      },
    });

    return NextResponse.json(
      { success: true, data: member },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to add member" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
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

    const currentMember = await prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId: session.user.id,
          organizationId: id,
        },
      },
    });

    if (
      !currentMember ||
      (currentMember.role !== "owner" && currentMember.role !== "admin")
    ) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }

    let body: { userId?: string };
    try {
      body = (await request.json()) as { userId?: string };
    } catch {
      return NextResponse.json(
        { success: false, error: "userId is required in request body" },
        { status: 400 },
      );
    }
    const { userId } = body;

    if (!userId) {
      return NextResponse.json(
        { success: false, error: "userId is required" },
        { status: 400 }
      );
    }

    const targetMember = await prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId,
          organizationId: id,
        },
      },
    });

    if (!targetMember) {
      return NextResponse.json(
        { success: false, error: "Member not found" },
        { status: 404 }
      );
    }

    if (targetMember.role === "owner") {
      return NextResponse.json(
        { success: false, error: "Cannot remove the owner" },
        { status: 400 }
      );
    }

    await prisma.organizationMember.delete({
      where: { id: targetMember.id },
    });

    return NextResponse.json({ success: true, data: { userId } });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to remove member" },
      { status: 500 }
    );
  }
}
