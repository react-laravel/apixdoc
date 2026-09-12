import { operationFailure } from "@/lib/operations/failures";
import { appendAudit } from "@/lib/audit/write";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { type ApiResponse } from "@/lib/utils";

export async function GET(): Promise<NextResponse<ApiResponse>> {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const organizations = await prisma.organization.findMany({
      where: {
        members: { some: { userId: session.user.id } },
      },
      include: {
        _count: { select: { members: true, projects: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: organizations });
  } catch (error) {
    return operationFailure(error, "organizations");
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
    const { name, description } = body;

    if (!name) {
      return NextResponse.json(
        { success: false, error: "Name is required" },
        { status: 400 },
      );
    }

    const organization = await prisma.$transaction(async (tx) => {
      const created = await tx.organization.create({
        data: {
          name,
          description: description || "",
          members: {
            create: {
              userId: session.user.id,
              role: "owner",
            },
          },
        },
        include: {
          _count: { select: { members: true, projects: true } },
        },
      });
      await appendAudit(tx, {
        actor: session.user!,
        organizationId: created.id,
        action: "organization.created",
        targetId: created.id,
        targetName: created.name,
      });
      return created;
    });

    return NextResponse.json(
      { success: true, data: organization },
      { status: 201 },
    );
  } catch (error) {
    return operationFailure(error, "organizations");
  }
}
