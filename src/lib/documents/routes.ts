import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canEditContent } from "@/lib/permissions";
import { DocumentError } from "./http";
/** Fail closed before reading request content; services repeat authorization after obtaining their lock. */
export async function documentActor(endpointId?: string, projectId?: string) {
  const session = await auth();
  if (!session?.user?.id) throw new DocumentError("请先登录", 401);
  if (endpointId) {
    const endpoint = await prisma.apiEndpoint.findUnique({
      where: { id: endpointId },
      include: { project: true },
    });
    if (!endpoint) throw new DocumentError("接口不存在", 404);
    projectId = endpoint.projectId;
    const member = await prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId: session.user.id,
          organizationId: endpoint.project.organizationId,
        },
      },
    });
    if (!canEditContent(member?.role))
      throw new DocumentError("无权操作此接口", 403);
  } else if (projectId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });
    if (!project) throw new DocumentError("项目不存在", 404);
    const member = await prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: {
          userId: session.user.id,
          organizationId: project.organizationId,
        },
      },
    });
    if (!canEditContent(member?.role))
      throw new DocumentError("无权操作此项目", 403);
  }
  return session.user;
}
