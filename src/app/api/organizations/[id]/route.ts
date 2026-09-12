import { appendAudit } from "@/lib/audit/write";
import { lockTeam, teamMember } from "@/lib/team/service";
import {
  TeamError,
  teamBody,
  teamFailure,
  teamSuccess,
} from "@/lib/team/errors";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { projectPermissions } from "@/lib/permissions";
import { type ApiResponse } from "@/lib/utils";

export async function GET(
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
        { status: 403 },
      );
    }

    const organization = await prisma.organization.findUnique({
      where: { id },
      include: {
        ...(member.role === "owner" || member.role === "admin"
          ? {
              invitations: {
                where: { acceptedAt: null, revokedAt: null },
                orderBy: { createdAt: "desc" as const },
                take: 100,
                select: {
                  id: true,
                  email: true,
                  role: true,
                  createdAt: true,
                  expiresAt: true,
                },
              },
              events: {
                orderBy: { createdAt: "desc" as const },
                take: 50,
                select: {
                  id: true,
                  actorName: true,
                  action: true,
                  target: true,
                  detail: true,
                  createdAt: true,
                },
              },
            }
          : {}),
        members: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          include: {
            user: {
              select: { id: true, email: true, name: true, status: true },
            },
          },
        },
      },
    });

    if (!organization) {
      return NextResponse.json(
        { success: false, error: "Organization not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        ...organization,
        currentRole: member.role,
        currentUserId: session.user.id,
        permissions: projectPermissions(member.role),
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to fetch organization" },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) throw new TeamError("请先登录", 401);
    const { id } = await params;
    const body = await teamBody(request);
    const data = await prisma.$transaction(async (tx) => {
      await lockTeam(tx, id);
      const member = await teamMember(tx, id, session.user.id);
      if (!member || !["owner", "admin"].includes(member.role))
        throw new TeamError("无权修改组织", 403);
      if (
        typeof body.name !== "string" ||
        !body.name.trim() ||
        body.name.trim().length > 100 ||
        (body.description !== undefined &&
          (typeof body.description !== "string" ||
            body.description.length > 2000))
      )
        throw new TeamError("请填写有效的组织名称与简介");
      const updated = await tx.organization.update({
        where: { id },
        data: {
          name: body.name.trim(),
          description:
            typeof body.description === "string" ? body.description : undefined,
          teamVersion: { increment: 1 },
        },
      });
      await appendAudit(tx, {
        actor: session.user!,
        organizationId: id,
        action: "organization.updated",
        targetId: id,
        targetName: updated.name,
        metadata: { fields: ["name", "description"] },
      });
      return updated;
    });
    return teamSuccess(data);
  } catch (error) {
    return teamFailure(error);
  }
}
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) throw new TeamError("请先登录", 401);
    const { id } = await params;
    await prisma.$transaction(async (tx) => {
      await lockTeam(tx, id);
      const member = await teamMember(tx, id, session.user.id);
      if (member?.role !== "owner")
        throw new TeamError("只有所有者可以删除组织", 403);
      const projects = await tx.project.findMany({
        where: { organizationId: id },
        select: { id: true, name: true },
      });
      for (const project of projects)
        await appendAudit(tx, {
          actor: session.user!,
          projectId: project.id,
          action: "project.deleted",
          targetId: project.id,
          targetName: project.name,
        });
      await appendAudit(tx, {
        actor: session.user!,
        organizationId: id,
        action: "organization.deleted",
        targetId: id,
        metadata: { affectedCount: projects.length },
      });
      await tx.organization.delete({ where: { id } });
    });
    return teamSuccess({ id });
  } catch (error) {
    return teamFailure(error);
  }
}
