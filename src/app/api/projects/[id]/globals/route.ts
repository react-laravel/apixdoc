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

    const [headers, globalParams] = await Promise.all([
      prisma.globalHeader.findMany({ where: { projectId: id } }),
      prisma.globalParam.findMany({ where: { projectId: id } }),
    ]);

    return NextResponse.json({
      success: true,
      data: { headers, params: globalParams },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to fetch globals" },
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
    const { headers: headerList, params: paramList } = body;

    let data;
    try {
      data = parseProjectSettings({
        globalHeaders: headerList,
        globalParams: paramList,
      });
    } catch (error) {
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "全局配置不正确",
        },
        { status: 400 },
      );
    }
    const updated = await prisma.project.update({
      where: { id },
      data,
      include: { globalHeaders: true, globalParams: true },
    });
    return NextResponse.json({
      success: true,
      data: { headers: updated.globalHeaders, params: updated.globalParams },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to update globals" },
      { status: 500 },
    );
  }
}
