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
    const { contentType, schema, example } = body;

    const requestBody = await prisma.requestBody.upsert({
      where: { endpointId: id },
      update: {
        ...(contentType !== undefined && { contentType }),
        ...(schema !== undefined && {
          schema: typeof schema === "string" ? schema : JSON.stringify(schema),
        }),
        ...(example !== undefined && {
          example:
            typeof example === "string" ? example : JSON.stringify(example),
        }),
      },
      create: {
        endpointId: id,
        contentType: contentType || "application/json",
        schema:
          typeof schema === "string"
            ? schema
            : JSON.stringify(schema || {}),
        example:
          typeof example === "string"
            ? example
            : JSON.stringify(example || {}),
      },
    });

    return NextResponse.json({ success: true, data: requestBody });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to update request body" },
      { status: 500 }
    );
  }
}
