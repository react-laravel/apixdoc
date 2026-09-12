import { createHash, randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { TeamError } from "./errors";
import {
  canInviteRole,
  canManageMember,
  isInvitedRole,
  ROLE_LABELS,
  type TeamRole,
} from "./roles";

type Tx = Prisma.TransactionClient;
export type TeamActor = {
  id: string;
  name?: string | null;
  email?: string | null;
};
const transactionOptions = { maxWait: 5000, timeout: 15000 };
export const invitationHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export function readInvitationToken(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value))
    throw new TeamError("邀请链接不正确或已失效", 404);
  return value;
}
export function normalizedEmail(value: unknown): string {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new TeamError("请填写有效邮箱");
  return email;
}
export async function lockTeam(tx: Tx, id: string) {
  const rows = await tx.$queryRaw<
    { id: string }[]
  >`SELECT "id" FROM "Organization" WHERE "id" = ${id} FOR UPDATE`;
  if (!rows.length) throw new TeamError("组织不存在", 404);
  return (await tx.organization.findUnique({ where: { id } }))!;
}
export async function teamMember(tx: Tx, id: string, userId: string) {
  return tx.organizationMember.findUnique({
    where: { userId_organizationId: { userId, organizationId: id } },
    include: { user: { select: { id: true, email: true, name: true } } },
  });
}
function checkVersion(actual: number, expected: unknown) {
  if (!Number.isInteger(expected) || actual !== expected)
    throw new TeamError("团队信息已变化，请刷新后重试", 409);
}
async function recordEvent(
  tx: Tx,
  orgId: string,
  actor: TeamActor,
  action: string,
  target: string,
  detail = "",
) {
  await tx.teamEvent.create({
    data: {
      organizationId: orgId,
      actorId: actor.id,
      actorName: actor.name || actor.email || "成员",
      action,
      target,
      detail,
    },
  });
  await tx.organization.update({
    where: { id: orgId },
    data: { teamVersion: { increment: 1 } },
  });
}
async function revokeIssuedInvitations(tx: Tx, orgId: string, userId: string) {
  await tx.organizationInvitation.updateMany({
    where: {
      organizationId: orgId,
      createdById: userId,
      acceptedAt: null,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });
}
export async function createInvitation(
  orgId: string,
  actor: TeamActor,
  input: Record<string, unknown>,
  renewId?: string,
) {
  return prisma.$transaction(async (tx) => {
    const org = await lockTeam(tx, orgId);
    const member = await teamMember(tx, orgId, actor.id);
    if (!member || !["owner", "admin"].includes(member.role))
      throw new TeamError("只有组织管理员可以邀请成员", 403);
    checkVersion(org.teamVersion, input.version);
    const previous = renewId
      ? await tx.organizationInvitation.findFirst({
          where: { id: renewId, organizationId: orgId },
        })
      : null;
    if (renewId && (!previous || previous.acceptedAt || previous.revokedAt))
      throw new TeamError("邀请状态已变化，请刷新后重试", 409);
    const email = previous?.email || normalizedEmail(input.email);
    const role = previous?.role || input.role || "member";
    if (!isInvitedRole(role)) throw new TeamError("邀请角色不正确");
    if (!canInviteRole(member.role, role))
      throw new TeamError("只有所有者可以邀请管理员", 403);
    const account = await tx.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
    });
    if (account && (await teamMember(tx, orgId, account.id)))
      throw new TeamError("该用户已经是组织成员", 409);
    const pending = await tx.organizationInvitation.findUnique({
      where: { organizationId_email: { organizationId: orgId, email } },
    });
    if (
      !renewId &&
      pending &&
      !pending.acceptedAt &&
      !pending.revokedAt &&
      pending.expiresAt > new Date()
    )
      throw new TeamError(
        "该邮箱已有待处理邀请，可在邀请列表中重新生成链接",
        409,
      );
    if (
      (await tx.teamEvent.count({
        where: {
          organizationId: orgId,
          actorId: actor.id,
          action: { in: ["invited", "renewed"] },
          createdAt: { gt: new Date(Date.now() - 3600000) },
        },
      })) >= 50
    )
      throw new TeamError("每小时最多生成 50 次邀请，请稍后重试", 429);
    if (
      !renewId &&
      (await tx.organizationInvitation.count({
        where: {
          organizationId: orgId,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      })) >= 100
    )
      throw new TeamError(
        "待处理邀请已达到 100 个，请先处理或撤销已有邀请",
        409,
      );
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 7 * 86400000);
    const invitation = await tx.organizationInvitation.upsert({
      where: { organizationId_email: { organizationId: orgId, email } },
      create: {
        organizationId: orgId,
        email,
        role,
        tokenHash: invitationHash(token),
        createdById: actor.id,
        expiresAt,
      },
      update: {
        role,
        tokenHash: invitationHash(token),
        createdById: actor.id,
        expiresAt,
        createdAt: new Date(),
        acceptedAt: null,
        acceptedById: null,
        revokedAt: null,
      },
      select: { id: true, email: true, role: true, expiresAt: true },
    });
    await recordEvent(
      tx,
      orgId,
      member.user,
      renewId ? "renewed" : "invited",
      email,
      ROLE_LABELS[role],
    );
    return { invitation, token };
  }, transactionOptions);
}
export async function revokeInvitation(
  orgId: string,
  invitationId: string,
  actor: TeamActor,
  input: Record<string, unknown>,
) {
  return prisma.$transaction(async (tx) => {
    const org = await lockTeam(tx, orgId);
    const member = await teamMember(tx, orgId, actor.id);
    if (!member || !["owner", "admin"].includes(member.role))
      throw new TeamError("无权撤销邀请", 403);
    checkVersion(org.teamVersion, input.version);
    const invite = await tx.organizationInvitation.findFirst({
      where: { id: invitationId, organizationId: orgId },
    });
    if (!invite || !canInviteRole(member.role, invite.role))
      throw new TeamError("无权撤销此邀请", 403);
    if (invite.acceptedAt || invite.revokedAt)
      throw new TeamError("邀请已处理，请刷新后重试", 409);
    await tx.organizationInvitation.update({
      where: { id: invitationId },
      data: { revokedAt: new Date() },
    });
    await recordEvent(
      tx,
      orgId,
      member.user,
      "invitation-revoked",
      invite.email,
    );
    return { id: invitationId };
  }, transactionOptions);
}
export async function changeMember(
  orgId: string,
  actor: TeamActor,
  action: "role" | "remove" | "leave" | "transfer",
  input: Record<string, unknown>,
) {
  return prisma.$transaction(async (tx) => {
    const org = await lockTeam(tx, orgId);
    const current = await teamMember(tx, orgId, actor.id);
    if (!current) throw new TeamError("你已不在此组织中", 403);
    checkVersion(org.teamVersion, input.version);
    const targetId =
      action === "leave"
        ? actor.id
        : typeof input.userId === "string"
          ? input.userId
          : "";
    const target = await teamMember(tx, orgId, targetId);
    if (!target) throw new TeamError("成员不存在", 404);
    if (action === "transfer") {
      if (current.role !== "owner")
        throw new TeamError("只有所有者可以转移所有权", 403);
      if (target.userId === actor.id || target.role === "owner")
        throw new TeamError("请选择其他非所有者成员");
      if (input.confirmation !== target.user.email)
        throw new TeamError("请输入接任者的完整邮箱以确认转移");
      await tx.organizationMember.update({
        where: { id: target.id },
        data: { role: "owner" },
      });
      await tx.organizationMember.update({
        where: { id: current.id },
        data: { role: "admin" },
      });
      await revokeIssuedInvitations(tx, orgId, actor.id);
      await recordEvent(
        tx,
        orgId,
        current.user,
        "ownership-transferred",
        target.user.email,
        "原所有者成为管理员",
      );
    } else if (action === "leave") {
      if (
        current.role === "owner" &&
        (await tx.organizationMember.count({
          where: { organizationId: orgId, role: "owner" },
        })) <= 1
      )
        throw new TeamError("请先转移所有权，再退出组织", 409);
      await tx.organizationMember.delete({ where: { id: current.id } });
      await revokeIssuedInvitations(tx, orgId, actor.id);
      await recordEvent(tx, orgId, current.user, "left", current.user.email);
    } else {
      if (target.userId === actor.id)
        throw new TeamError("不能在这里修改自己，请使用退出或所有权转移");
      if (!canManageMember(current.role, target.role))
        throw new TeamError("无权管理该成员", 403);
      if (action === "role") {
        if (
          !isInvitedRole(input.role) ||
          !canInviteRole(current.role, input.role)
        )
          throw new TeamError("无权分配该角色", 403);
        if (input.role === target.role) return { unchanged: true };
        await tx.organizationMember.update({
          where: { id: target.id },
          data: { role: input.role },
        });
        await revokeIssuedInvitations(tx, orgId, target.userId);
        await recordEvent(
          tx,
          orgId,
          current.user,
          "role-changed",
          target.user.email,
          `${ROLE_LABELS[target.role as TeamRole] || target.role} → ${ROLE_LABELS[input.role]}`,
        );
      } else {
        await tx.organizationMember.delete({ where: { id: target.id } });
        await revokeIssuedInvitations(tx, orgId, target.userId);
        await recordEvent(
          tx,
          orgId,
          current.user,
          "removed",
          target.user.email,
        );
      }
    }
    return { userId: target.userId };
  }, transactionOptions);
}
async function validInvitation(tx: Tx, token: string) {
  const invitation = await tx.organizationInvitation.findUnique({
    where: { tokenHash: invitationHash(token) },
    include: { organization: { select: { id: true, name: true } } },
  });
  if (!invitation) throw new TeamError("邀请链接不正确或已失效", 404);
  return invitation;
}
async function pendingInvitation(
  tx: Tx,
  invitation: Awaited<ReturnType<typeof validInvitation>>,
) {
  if (invitation.acceptedAt)
    throw new TeamError("此邀请已使用，请登录查看组织", 410);
  if (invitation.revokedAt || invitation.expiresAt <= new Date())
    throw new TeamError("邀请已撤销或过期，请联系管理员重新邀请", 410);
  const sender = invitation.createdById
    ? await teamMember(tx, invitation.organizationId, invitation.createdById)
    : null;
  if (!canInviteRole(sender?.role, invitation.role))
    throw new TeamError("邀请人权限已变化，请联系管理员重新邀请", 410);
}
export async function inspectInvitation(
  tokenValue: unknown,
  actor?: TeamActor,
) {
  const token = readInvitationToken(tokenValue);
  return prisma.$transaction(async (tx) => {
    const invitation = await validInvitation(tx, token);
    if (invitation.acceptedAt) {
      const membership =
        actor?.id === invitation.acceptedById
          ? await teamMember(tx, invitation.organizationId, actor.id)
          : null;
      return {
        status: membership ? "joined" : "used",
        organization: invitation.organization,
        email: invitation.email,
        role: membership?.role || invitation.role,
      };
    }
    await pendingInvitation(tx, invitation);
    const account = await tx.user.findFirst({
      where: { email: { equals: invitation.email, mode: "insensitive" } },
      select: { id: true },
    });
    return {
      status: "pending",
      organization: invitation.organization,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      accountExists: !!account,
      matchingAccount: actor ? actor.id === account?.id : false,
      authenticated: !!actor,
    };
  });
}
export async function acceptInvitation(
  tokenValue: unknown,
  actor: TeamActor | undefined,
  input: Record<string, unknown>,
) {
  const token = readInvitationToken(tokenValue);
  return prisma.$transaction(async (tx) => {
    const initial = await validInvitation(tx, token);
    await lockTeam(tx, initial.organizationId);
    const invitation = await validInvitation(tx, token);
    await pendingInvitation(tx, invitation);
    let account = await tx.user.findFirst({
      where: { email: { equals: invitation.email, mode: "insensitive" } },
    });
    if (actor && actor.id !== account?.id)
      throw new TeamError("请切换到邀请对应的账号后再加入", 403);
    if (account && !actor)
      throw new TeamError("此邮箱已有账号，请先登录再接受邀请", 409);
    const createdAccount = !account;
    if (!account) {
      const name = typeof input.name === "string" ? input.name.trim() : "";
      const password = typeof input.password === "string" ? input.password : "";
      if (!name || name.length > 80)
        throw new TeamError("请填写 1–80 字的姓名");
      if (password.length < 8) throw new TeamError("密码至少 8 位");
      if (new TextEncoder().encode(password).length > 72)
        throw new TeamError("密码过长，请缩短后重试");
      account = await tx.user.create({
        data: {
          name,
          email: invitation.email,
          password: await hash(password, 12),
          role: "user",
        },
      });
    }
    const existing = await teamMember(
      tx,
      invitation.organizationId,
      account.id,
    );
    if (!existing)
      await tx.organizationMember.create({
        data: {
          userId: account.id,
          organizationId: invitation.organizationId,
          role: invitation.role,
        },
      });
    await tx.organizationInvitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: new Date(), acceptedById: account.id },
    });
    await recordEvent(
      tx,
      invitation.organizationId,
      account,
      "joined",
      account.email,
      existing ? "保留现有角色" : ROLE_LABELS[invitation.role as TeamRole],
    );
    return {
      organizationId: invitation.organizationId,
      createdAccount,
      email: account.email,
    };
  }, transactionOptions);
}
