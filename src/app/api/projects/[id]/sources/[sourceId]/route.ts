import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getProjectAccess } from "@/lib/permissions";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; sourceId: string }> },
) {
  const { id, sourceId } = await params;
  const session = await auth();
  const { permissions } = await getProjectAccess(id, session?.user?.id);
  if (!permissions.canReadConfiguration)
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 },
    );
  const source = await prisma.specificationImport.findFirst({
    where: { id: sourceId, projectId: id },
  });
  if (!source)
    return NextResponse.json(
      { success: false, error: "Source not found" },
      { status: 404 },
    );
  const syntax = /^\s*[\[{]/.test(source.document) ? "json" : "yaml";
  return new Response(source.document, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="source-${source.id}.${syntax}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
