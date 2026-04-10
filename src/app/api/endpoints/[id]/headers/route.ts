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
    const { headers: headerList } = body;

    if (!Array.isArray(headerList)) {
      return NextResponse.json(
        { success: false, error: "headers must be an array" },
        { status: 400 }
      );
    }

    await prisma.$transaction([
      prisma.endpointHeader.deleteMany({ where: { endpointId: id } }),
      prisma.endpointHeader.createMany({
        data: headerList.map(
          (h: {
            key: string;
            value?: string;
            description?: string;
            required?: boolean;
          }) => ({
            endpointId: id,
            key: h.key,
            value: h.value || "",
            description: h.description || "",
            required: h.required || false,
          })
        ),
      }),
    ]);

    const created = await prisma.endpointHeader.findMany({
      where: { endpointId: id },
    });

    return NextResponse.json({ success: true, data: created });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to update headers" },
      { status: 500 }
    );
  }
}
