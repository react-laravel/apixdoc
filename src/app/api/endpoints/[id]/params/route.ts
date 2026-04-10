import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
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

    const endpoint = await prisma.apiEndpoint.findUnique({
      where: { id },
      include: { project: true },
    });

    if (!endpoint) {
      return NextResponse.json(
        { success: false, error: "Endpoint not found" },
        { status: 404 }
      );
    }

    const member = await prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId: session.user.id,
          organizationId: endpoint.project.organizationId,
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
    const { params: paramList } = body;

    if (!Array.isArray(paramList)) {
      return NextResponse.json(
        { success: false, error: "params must be an array" },
        { status: 400 }
      );
    }

    await prisma.$transaction([
      prisma.endpointParam.deleteMany({ where: { endpointId: id } }),
      prisma.endpointParam.createMany({
        data: paramList.map(
          (p: {
            name: string;
            type?: string;
            required?: boolean;
            description?: string;
            example?: string;
            location?: string;
          }) => ({
            endpointId: id,
            name: p.name,
            type: p.type || "string",
            required: p.required || false,
            description: p.description || "",
            example: p.example || "",
            location: p.location || "query",
          })
        ),
      }),
    ]);

    const created = await prisma.endpointParam.findMany({
      where: { endpointId: id },
    });

    return NextResponse.json({ success: true, data: created });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to update parameters" },
      { status: 500 }
    );
  }
}
