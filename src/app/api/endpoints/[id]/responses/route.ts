import { parseDocumentJson } from "@/lib/documentation/json";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canEditContent } from "@/lib/permissions";
import { type ApiResponse } from "@/lib/utils";

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

    const endpoint = await prisma.apiEndpoint.findUnique({
      where: { id },
      include: { project: true },
    });

    if (!endpoint) {
      return NextResponse.json(
        { success: false, error: "Endpoint not found" },
        { status: 404 },
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

    if (!canEditContent(member?.role)) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const { responses } = body;

    if (!Array.isArray(responses)) {
      return NextResponse.json(
        { success: false, error: "responses must be an array" },
        { status: 400 },
      );
    }

    if (
      responses.some(
        (r) =>
          !/^(?:[1-5]\d\d|[1-5]XX|default)$/.test(
            r.statusKey || String(r.statusCode),
          ),
      )
    )
      return NextResponse.json(
        { success: false, error: "响应码应为 100–599、1XX–5XX 或 default" },
        { status: 400 },
      );
    try {
      for (const r of responses)
        if (typeof r.schema === "string") parseDocumentJson(r.schema || "{}");
    } catch {
      return NextResponse.json(
        { success: false, error: "响应 Schema 必须为有效 JSON" },
        { status: 400 },
      );
    }
    await prisma.$transaction([
      prisma.endpointResponse.deleteMany({ where: { endpointId: id } }),
      prisma.endpointResponse.createMany({
        data: responses.map(
          (r: {
            statusCode: number;
            statusKey?: string;
            description?: string;
            contentType?: string;
            schema?: string | object;
            example?: string | object;
          }) => ({
            endpointId: id,
            statusCode: r.statusKey
              ? /^\d{3}$/.test(r.statusKey)
                ? Number(r.statusKey)
                : 0
              : r.statusCode,
            statusKey: r.statusKey || "",
            description: r.description || "",
            contentType: r.contentType ?? "application/json",
            schema:
              typeof r.schema === "string"
                ? r.schema
                : JSON.stringify(r.schema || {}),
            example:
              typeof r.example === "string"
                ? r.example
                : JSON.stringify(r.example || {}),
          }),
        ),
      }),
    ]);

    const created = await prisma.endpointResponse.findMany({
      where: { endpointId: id },
      orderBy: { statusCode: "asc" },
    });

    return NextResponse.json({ success: true, data: created });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to update responses" },
      { status: 500 },
    );
  }
}
