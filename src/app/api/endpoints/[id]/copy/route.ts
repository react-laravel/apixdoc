import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getProjectAccess } from "@/lib/permissions";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  const { id } = await params;
  const source = await prisma.apiEndpoint.findUnique({
    where: { id },
    include: {
      parameters: true,
      headers: true,
      requestBody: true,
      responses: true,
    },
  });
  if (!source)
    return NextResponse.json(
      { success: false, error: "Endpoint not found" },
      { status: 404 },
    );
  const { permissions } = await getProjectAccess(
    source.projectId,
    session.user.id,
  );
  if (!permissions.canEdit)
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 },
    );
  try {
    const folder = source.folderId
      ? await prisma.folder.findFirst({
          where: { id: source.folderId, projectId: source.projectId },
          select: { id: true },
        })
      : null;
    const created = await prisma.apiEndpoint.create({
      data: {
        sourceImportId: source.sourceImportId,
        sourcePointer: source.sourcePointer,
        sourceDefinition: source.sourceDefinition,
        sourceBaseline: source.sourceBaseline,
        serverUrl: source.serverUrl,
        auth: source.auth,
        projectId: source.projectId,
        folderId: folder?.id ?? null,
        createdById: session.user.id,
        name: `${source.name || source.path} 副本`,
        method: source.method,
        path: source.path,
        description: source.description,
        order: source.order + 1,
        parameters: {
          create: source.parameters.map(
            ({
              name,
              type,
              required,
              description,
              example,
              location,
              schema,
            }) => ({
              schema,
              name,
              type,
              required,
              description,
              example,
              location,
            }),
          ),
        },
        headers: {
          create: source.headers.map(
            ({ key, value, description, required }) => ({
              key,
              value,
              description,
              required,
            }),
          ),
        },
        ...(source.requestBody
          ? {
              requestBody: {
                create: {
                  content: source.requestBody.content,
                  contentType: source.requestBody.contentType,
                  schema: source.requestBody.schema,
                  example: source.requestBody.example,
                },
              },
            }
          : {}),
        responses: {
          create: source.responses.map(
            ({
              statusCode,
              statusKey,
              description,
              contentType,
              schema,
              example,
            }) => ({
              statusCode,
              statusKey,
              description,
              contentType,
              schema,
              example,
            }),
          ),
        },
      },
      include: {
        parameters: true,
        headers: true,
        requestBody: true,
        responses: true,
      },
    });
    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to copy endpoint" },
      { status: 500 },
    );
  }
}
