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
      { status: 500 }
    );
  }
}

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

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 }
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
        { status: 403 }
      );
    }

    const body = await request.json();
    const { headers: headerList, params: paramList } = body;

    await prisma.$transaction([
      prisma.globalHeader.deleteMany({ where: { projectId: id } }),
      prisma.globalParam.deleteMany({ where: { projectId: id } }),
      ...(Array.isArray(headerList) && headerList.length > 0
        ? [
            prisma.globalHeader.createMany({
              data: headerList.map(
                (h: {
                  key: string;
                  value?: string;
                  description?: string;
                  enabled?: boolean;
                }) => ({
                  projectId: id,
                  key: h.key,
                  value: h.value || "",
                  description: h.description || "",
                  enabled: h.enabled !== false,
                })
              ),
            }),
          ]
        : []),
      ...(Array.isArray(paramList) && paramList.length > 0
        ? [
            prisma.globalParam.createMany({
              data: paramList.map(
                (p: {
                  name: string;
                  value?: string;
                  description?: string;
                  location?: string;
                  enabled?: boolean;
                }) => ({
                  projectId: id,
                  name: p.name,
                  value: p.value || "",
                  description: p.description || "",
                  location: p.location || "query",
                  enabled: p.enabled !== false,
                })
              ),
            }),
          ]
        : []),
    ]);

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
      { success: false, error: "Failed to update globals" },
      { status: 500 }
    );
  }
}
