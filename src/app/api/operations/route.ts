import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkReadiness } from "@/lib/operations/health";
import {
  DocumentError,
  documentFailure,
  documentSuccess,
} from "@/lib/documents/http";
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) throw new DocumentError("请先登录", 401);
    if (session.user.role !== "admin")
      throw new DocumentError("仅平台管理员可以查看运行状态", 403);
    const health = await checkReadiness();
    let counts = null;
    if (health.ready)
      counts = {
        organizations: await prisma.organization.count(),
        projects: await prisma.project.count(),
        endpoints: await prisma.apiEndpoint.count({
          where: { deletedAt: null },
        }),
        recycled: await prisma.apiEndpoint.count({
          where: { deletedAt: { not: null } },
        }),
        auditEvents: await prisma.auditEvent.count(),
      };
    return documentSuccess({
      health,
      counts,
      uptimeSeconds: Math.floor(process.uptime()),
      runtime: process.version,
      revision: /^[a-f0-9]{7,40}$/.test(process.env.APP_REVISION || "")
        ? process.env.APP_REVISION
        : null,
      memoryMegabytes: Math.round(process.memoryUsage().rss / 1024 / 1024),
    });
  } catch (error) {
    return documentFailure(error);
  }
}
