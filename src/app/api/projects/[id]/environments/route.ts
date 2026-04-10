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

    const environments = await prisma.environment.findMany({
      where: { projectId: id },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ success: true, data: environments });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to fetch environments" },
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
    const { environments } = body;

    if (!Array.isArray(environments)) {
      return NextResponse.json(
        { success: false, error: "environments must be an array" },
        { status: 400 }
      );
    }

    await prisma.$transaction([
      prisma.environment.deleteMany({ where: { projectId: id } }),
      prisma.environment.createMany({
        data: environments.map(
          (env: {
            name: string;
            baseUrl: string;
            variables?: string | object;
            isDefault?: boolean;
          }) => ({
            projectId: id,
            name: env.name,
            baseUrl: env.baseUrl,
            variables:
              typeof env.variables === "string"
                ? env.variables
                : JSON.stringify(env.variables || {}),
            isDefault: env.isDefault || false,
          })
        ),
      }),
    ]);

    const created = await prisma.environment.findMany({
      where: { projectId: id },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ success: true, data: created });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to update environments" },
      { status: 500 }
    );
  }
}
