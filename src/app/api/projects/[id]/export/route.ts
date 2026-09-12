import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getProjectAccess } from "@/lib/permissions";
import { sanitizeDocumentationProject } from "@/lib/documentation/privacy";
import {
  exportOpenApi,
  exportPostman,
  serializeSpecification,
} from "@/lib/documentation/export";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  const { project, permissions } = await getProjectAccess(
    id,
    session?.user?.id,
  );
  if (!project)
    return NextResponse.json(
      { success: false, error: "Project not found" },
      { status: 404 },
    );
  if (!permissions.canRead)
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 },
    );
  const query = new URL(request.url).searchParams;
  const kind = query.get("format") || "openapi";
  const syntax = query.get("syntax") || "json";
  if (
    !["openapi", "postman"].includes(kind) ||
    !["json", "yaml"].includes(syntax) ||
    (kind === "postman" && syntax !== "json")
  )
    return NextResponse.json(
      { success: false, error: "Unsupported export format" },
      { status: 400 },
    );
  try {
    const data = await prisma.project.findUnique({
      where: { id },
      include: {
        folders: true,
        endpoints: {
          orderBy: { order: "asc" },
          include: {
            parameters: true,
            headers: true,
            requestBody: true,
            responses: true,
          },
        },
        globalHeaders: true,
        globalParams: true,
        environments: true,
      },
    });
    if (!data)
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 },
      );
    const source = permissions.canReadConfiguration
      ? data
      : sanitizeDocumentationProject(data);
    const document =
      kind === "postman" ? exportPostman(source) : exportOpenApi(source);
    return new Response(
      serializeSpecification(document, syntax as "json" | "yaml"),
      {
        headers: {
          "Content-Type":
            syntax === "yaml"
              ? "application/yaml; charset=utf-8"
              : "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="${kind}-${id}.${syntax === "yaml" ? "yaml" : "json"}"`,
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Export failed",
      },
      { status: 400 },
    );
  }
}
