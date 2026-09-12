import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canConfigureProject } from "@/lib/permissions";
import { canReadProjectConfiguration } from "@/lib/project-membership";
import { parseProjectSettings } from "@/lib/project-settings";
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
    if (!(await canReadProjectConfiguration(id, session.user.id)))
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );

    const environments = await prisma.environment.findMany({
      where: { projectId: id },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ success: true, data: environments });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to fetch environments" },
      { status: 500 },
    );
  }
}

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

    const { id } = await params;

    const project = await prisma.project.findUnique({ where: { id } });
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

    if (!canConfigureProject(member?.role)) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const { environments } = body;

    if (!Array.isArray(environments)) {
      return NextResponse.json(
        { success: false, error: "environments must be an array" },
        { status: 400 },
      );
    }

    let data;
    try {
      data = parseProjectSettings({ environments });
    } catch (error) {
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "环境配置不正确",
        },
        { status: 400 },
      );
    }
    const updated = await prisma.project.update({
      where: { id },
      data,
      include: { environments: { orderBy: { name: "asc" } } },
    });
    return NextResponse.json({ success: true, data: updated.environments });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to update environments" },
      { status: 500 },
    );
  }
}
