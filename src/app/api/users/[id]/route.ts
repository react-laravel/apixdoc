import { appendAudit } from "@/lib/audit/write";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { lockTeam } from "@/lib/team/service";
import { TeamError, teamFailure, teamSuccess } from "@/lib/team/errors";
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) throw new TeamError("请先登录", 401);
    if (session.user.role !== "admin") throw new TeamError("无权删除用户", 403);
    const { id } = await params;
    if (id === session.user.id) throw new TeamError("不能删除自己的账号");
    await prisma.$transaction(async (tx) => {
      // Prevent new memberships while locking all existing organizations in a stable order.
      const users = await tx.$queryRaw<
        { id: string }[]
      >`SELECT "id" FROM "User" WHERE "id" = ${id} FOR UPDATE`;
      if (!users.length) throw new TeamError("用户不存在", 404);
      const memberships = await tx.organizationMember.findMany({
        where: { userId: id },
        orderBy: { organizationId: "asc" },
      });
      for (const membership of memberships)
        await lockTeam(tx, membership.organizationId);
      if (
        await tx.organizationMember.count({
          where: { userId: id, role: "owner" },
        })
      )
        throw new TeamError("该用户仍是组织所有者，请先完成所有权转移", 409);
      if (
        (await tx.project.count({ where: { createdById: id } })) ||
        (await tx.apiEndpoint.count({ where: { createdById: id } }))
      )
        throw new TeamError("该账号仍关联已创建的项目或接口，暂不能删除", 409);
      for (const member of memberships) {
        await tx.teamEvent.create({
          data: {
            organizationId: member.organizationId,
            actorId: session.user.id,
            actorName: session.user.name || session.user.email || "平台管理员",
            action: "account-deleted",
            target: id,
          },
        });
        await tx.organization.update({
          where: { id: member.organizationId },
          data: { teamVersion: { increment: 1 } },
        });
      }
      const target = await tx.user.findUnique({
        where: { id },
        select: { name: true },
      });
      await appendAudit(tx, {
        actor: session.user!,
        action: "user.deleted",
        targetId: id,
        targetName: target?.name,
      });
      for (const membership of memberships)
        await appendAudit(tx, {
          actor: session.user!,
          organizationId: membership.organizationId,
          action: "team.removed",
          targetId: id,
          targetName: target?.name,
        });
      await tx.user.delete({ where: { id } });
    });
    return teamSuccess({ id });
  } catch (error) {
    return teamFailure(error);
  }
}
