import { prisma } from "@/lib/prisma";
import { documentActor } from "@/lib/documents/routes";
import { changeLayout } from "@/lib/documents/layout";
import {
  DocumentError,
  documentSuccess,
  documentFailure,
  documentBody,
} from "@/lib/documents/http";
async function write(
  request: Request,
  id: string,
  action: "update" | "delete",
) {
  try {
    const actor = await documentActor();
    const folder = await prisma.folder.findUnique({ where: { id } });
    if (!folder) throw new DocumentError("目录不存在", 404);
    await documentActor(undefined, folder.projectId);
    return documentSuccess(
      await changeLayout(
        folder.projectId,
        actor,
        await documentBody(request),
        action,
        id,
      ),
    );
  } catch (error) {
    return documentFailure(error);
  }
}
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return write(request, (await params).id, "update");
}
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return write(request, (await params).id, "delete");
}
