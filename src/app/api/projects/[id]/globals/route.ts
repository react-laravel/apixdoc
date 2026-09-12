import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { canConfigureProject } from "@/lib/permissions";
import { canReadProjectConfiguration } from "@/lib/project-membership";
import { saveProjectSettings } from "@/lib/project-settings-service";
import {
  documentBody,
  documentSuccess,
  documentFailure,
} from "@/lib/documents/http";
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

    const { version, headers, globalParams } = await prisma.$transaction(
      async (tx) => {
        const version =
          (
            await tx.project.findUnique({
              where: { id },
              select: { settingsVersion: true },
            })
          )?.settingsVersion || 1;
        const headers = await tx.globalHeader.findMany({
          where: { projectId: id },
        });
        const globalParams = await tx.globalParam.findMany({
          where: { projectId: id },
        });
        return { version, headers, globalParams };
      },
      { isolationLevel: "RepeatableRead" },
    );
    return NextResponse.json(
      {
        success: true,
        settingsVersion: version,
        data: { headers, params: globalParams },
      },
      {
        headers: {
          "Cache-Control": "private, no-store",
          "X-Settings-Version": String(version),
        },
      },
    );
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

    try {
      const body = await documentBody(request);
      return documentSuccess(
        await saveProjectSettings(id, session.user, {
          version: body.version,
          globalHeaders: body.headers,
          globalParams: body.params,
        }),
      );
    } catch (error) {
      return documentFailure(error);
    }
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to update globals" },
      { status: 500 },
    );
  }
}
