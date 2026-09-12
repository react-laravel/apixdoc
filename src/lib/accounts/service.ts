import { createHash, randomBytes } from "node:crypto";
import { compare, hash } from "bcryptjs";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { appendAudit } from "@/lib/audit/write";
import type { AuditAction } from "@/lib/audit/model";
import { TeamError } from "@/lib/team/errors";
import { lockAccounts, activeAccount } from "./identity";
import {
  accountEmail,
  accountName,
  accountPassword,
  accountVersion,
} from "./validation";

type Tx = Prisma.TransactionClient;
const options = { maxWait: 5000, timeout: 15000 };
const safeSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  status: true,
  accountVersion: true,
  createdAt: true,
  deletedAt: true,
  resetExpiresAt: true,
} as const;
const resetFields = { resetTokenHash: null, resetExpiresAt: null };
async function administrator(tx: Tx, id: string) {
  const user = await activeAccount(tx, id);
  if (user.role !== "admin")
    throw new TeamError("仅平台管理员可以管理账号", 403);
  return user;
}
async function verifyPassword(password: unknown, stored: string) {
  if (
    typeof password !== "string" ||
    password.length > 1024 ||
    !(await compare(password, stored))
  )
    throw new TeamError("当前密码不正确", 403);
}
export async function keepAdministrator(
  tx: Tx,
  target: { id: string; role: string; status: string },
) {
  if (
    target.role === "admin" &&
    target.status === "active" &&
    !(await tx.user.count({
      where: { id: { not: target.id }, role: "admin", status: "active" },
    }))
  )
    throw new TeamError("至少需要保留一位正常的平台管理员", 409);
}
async function revokeInvitations(
  tx: Tx,
  actor: { id: string; name: string },
  target: { id: string; email: string },
) {
  const pending = await tx.organizationInvitation.findMany({
    where: {
      acceptedAt: null,
      revokedAt: null,
      OR: [
        { createdById: target.id },
        { email: { equals: target.email, mode: "insensitive" } },
      ],
    },
    orderBy: { organizationId: "asc" },
  });
  for (const invitation of pending) {
    await tx.$queryRaw`SELECT "id" FROM "Organization" WHERE "id" = ${invitation.organizationId} FOR UPDATE`;
    await tx.organizationInvitation.update({
      where: { id: invitation.id },
      data: { revokedAt: new Date() },
    });
    await tx.teamEvent.create({
      data: {
        organizationId: invitation.organizationId,
        actorId: actor.id,
        actorName: actor.name,
        action: "invitation-revoked",
        target: invitation.email,
        detail: "账号状态变更",
      },
    });
    await appendAudit(tx, {
      actor,
      organizationId: invitation.organizationId,
      action: "team.invitation-revoked",
      targetId: invitation.id,
      targetName: invitation.email,
    });
    await tx.organization.update({
      where: { id: invitation.organizationId },
      data: { teamVersion: { increment: 1 } },
    });
  }
}
async function recordAccountState(
  tx: Tx,
  actor: { id: string; name: string },
  target: { id: string; name: string },
  action: "user.disabled" | "user.enabled",
) {
  const memberships = await tx.organizationMember.findMany({
    where: { userId: target.id },
    orderBy: { organizationId: "asc" },
  });
  for (const member of memberships) {
    await tx.$queryRaw`SELECT "id" FROM "Organization" WHERE "id" = ${member.organizationId} FOR UPDATE`;
    await tx.teamEvent.create({
      data: {
        organizationId: member.organizationId,
        actorId: actor.id,
        actorName: actor.name,
        action:
          action === "user.disabled" ? "account-disabled" : "account-enabled",
        target: target.name,
      },
    });
    await appendAudit(tx, {
      actor,
      organizationId: member.organizationId,
      action,
      targetId: target.id,
      targetName: target.name,
    });
    await tx.organization.update({
      where: { id: member.organizationId },
      data: { teamVersion: { increment: 1 } },
    });
  }
}
async function removeMemberships(
  tx: Tx,
  actor: { id: string; name: string },
  target: { id: string; name: string },
) {
  if (
    await tx.organizationMember.count({
      where: { userId: target.id, role: "owner" },
    })
  )
    throw new TeamError("该账号仍是组织所有者，请先在团队页面转移所有权", 409);
  const memberships = await tx.organizationMember.findMany({
    where: { userId: target.id },
    orderBy: { organizationId: "asc" },
  });
  for (const member of memberships) {
    await tx.$queryRaw`SELECT "id" FROM "Organization" WHERE "id" = ${member.organizationId} FOR UPDATE`;
    await tx.teamEvent.create({
      data: {
        organizationId: member.organizationId,
        actorId: actor.id,
        actorName: actor.name,
        action: "account-deleted",
        target: target.name,
      },
    });
    await appendAudit(tx, {
      actor,
      organizationId: member.organizationId,
      action: "team.removed",
      targetId: target.id,
      targetName: target.name,
    });
    await tx.organization.update({
      where: { id: member.organizationId },
      data: { teamVersion: { increment: 1 } },
    });
  }
  await tx.organizationMember.deleteMany({ where: { userId: target.id } });
}
export async function readAccount(id: string) {
  return prisma.$transaction(async (tx) => {
    await activeAccount(tx, id);
    const account = await tx.user.findUniqueOrThrow({
      where: { id },
      select: safeSelect,
    });
    const ownerships = await tx.organizationMember.findMany({
      where: { userId: id, role: "owner" },
      select: { organization: { select: { id: true, name: true } } },
    });
    return { ...account, ownerships: ownerships.map((m) => m.organization) };
  });
}
export async function listAccounts(
  actorId: string,
  query: { q?: string; status?: string; cursor?: string },
) {
  return prisma.$transaction(
    async (tx) => {
      await administrator(tx, actorId);
      if ((query.q?.length || 0) > 200) throw new TeamError("搜索最多 200 字");
      if (
        query.status &&
        !["active", "disabled", "deleted"].includes(query.status)
      )
        throw new TeamError("账号状态不正确");
      if (query.cursor && !/^[A-Za-z0-9_-]{1,128}$/.test(query.cursor))
        throw new TeamError("分页标识不正确");
      const where: Prisma.UserWhereInput = {
        ...(query.status ? { status: query.status } : {}),
        ...(query.q
          ? {
              OR: [
                { name: { contains: query.q, mode: "insensitive" } },
                { email: { contains: query.q, mode: "insensitive" } },
              ],
            }
          : {}),
      };
      if (
        query.cursor &&
        !(await tx.user.findFirst({
          where: { ...where, id: query.cursor },
          select: { id: true },
        }))
      )
        throw new TeamError("列表已变化，请重新加载", 409);
      const rows = await tx.user.findMany({
        where,
        select: safeSelect,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 51,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      });
      const items = rows.slice(0, 50);
      return {
        items,
        total: await tx.user.count({ where }),
        next: rows.length > 50 ? items.at(-1)!.id : null,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export async function createAccount(
  actorId: string,
  input: Record<string, unknown>,
) {
  const email = accountEmail(input.email),
    name = accountName(input.name),
    password = accountPassword(input.password);
  const role = input.role ?? "user";
  if (role !== "admin" && role !== "user")
    throw new TeamError("账号角色不正确");
  // Check authority before expensive password hashing; recheck inside the transaction.
  await prisma.$transaction((tx) => administrator(tx, actorId));
  const encoded = await hash(password, 12);
  return prisma.$transaction(async (tx) => {
    await lockAccounts(tx);
    const actor = await administrator(tx, actorId);
    if (
      await tx.user.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
        select: { id: true },
      })
    )
      throw new TeamError("邮箱已存在；已删除账号可在用户管理中恢复", 409);
    const user = await tx.user.create({
      data: { email, name, password: encoded, role },
      select: safeSelect,
    });
    await appendAudit(tx, {
      actor,
      action: "user.created",
      targetId: user.id,
      targetName: user.name,
      metadata: { role },
    });
    return user;
  }, options);
}
export async function changeProfile(
  id: string,
  input: Record<string, unknown>,
) {
  const name = accountName(input.name);
  return prisma.$transaction(async (tx) => {
    await lockAccounts(tx);
    const user = await activeAccount(tx, id);
    accountVersion(user.accountVersion, input.version);
    if (name !== user.name) {
      await tx.user.update({
        where: { id },
        data: { name, accountVersion: { increment: 1 } },
      });
      await appendAudit(tx, {
        actor: user,
        action: "user.profile",
        targetId: id,
        targetName: name,
        metadata: { fields: ["name"] },
      });
    }
    return tx.user.findUniqueOrThrow({ where: { id }, select: safeSelect });
  }, options);
}
export async function changeSecurity(
  id: string,
  input: Record<string, unknown>,
) {
  if (!["password", "signout", "delete"].includes(String(input.action)))
    throw new TeamError("操作不正确");
  const nextPassword =
    input.action === "password" ? accountPassword(input.password) : undefined;
  const verified = await prisma.$transaction((tx) => activeAccount(tx, id));
  await verifyPassword(input.currentPassword, verified.password);
  if (nextPassword && (await compare(nextPassword, verified.password)))
    throw new TeamError("新密码不能与当前密码相同");
  const encoded = nextPassword ? await hash(nextPassword, 12) : undefined;
  return prisma.$transaction(async (tx) => {
    await lockAccounts(tx);
    const user = await activeAccount(tx, id);
    accountVersion(user.accountVersion, input.version);
    if (user.password !== verified.password)
      throw new TeamError("密码已变化，请重新登录", 409);
    let action: AuditAction = "user.sessions-revoked";
    const data: Prisma.UserUpdateInput = {
      accountVersion: { increment: 1 },
      sessionVersion: { increment: 1 },
      ...resetFields,
    };
    if (nextPassword) {
      data.password = encoded;
      action = "user.password-changed";
    }
    if (input.action === "delete") {
      if (input.confirmation !== user.email)
        throw new TeamError("请输入账号完整邮箱以确认删除");
      await keepAdministrator(tx, user);
      await removeMemberships(tx, user, user);
      await revokeInvitations(tx, user, user);
      data.status = "deleted";
      data.deletedAt = new Date();
      action = "user.deleted";
    }
    await tx.user.update({ where: { id }, data });
    await appendAudit(tx, {
      actor: user,
      action,
      targetId: id,
      targetName: user.name,
    });
    return { signedOut: true };
  }, options);
}
export async function manageAccount(
  actorId: string,
  targetId: string,
  input: Record<string, unknown>,
) {
  const verified = await prisma.$transaction((tx) =>
    administrator(tx, actorId),
  );
  await verifyPassword(input.currentPassword, verified.password);
  return prisma.$transaction(async (tx) => {
    await lockAccounts(tx);
    const actor = await administrator(tx, actorId);
    if (actorId === targetId)
      throw new TeamError("请通过个人设置管理自己的账号");
    const target = await tx.user.findUnique({ where: { id: targetId } });
    if (!target) throw new TeamError("账号不存在", 404);
    accountVersion(target.accountVersion, input.version);
    if (
      actor.password !== verified.password ||
      actor.sessionVersion !== verified.sessionVersion
    )
      throw new TeamError("登录状态已变化，请重新登录", 401);
    const data: Prisma.UserUpdateInput = { accountVersion: { increment: 1 } };
    let action: AuditAction;
    let recovery: { token: string; expiresAt: Date } | undefined;
    if (input.action === "disable") {
      if (target.status !== "active")
        throw new TeamError("只能停用正常账号", 409);
      await keepAdministrator(tx, target);
      data.status = "disabled";
      data.sessionVersion = { increment: 1 };
      Object.assign(data, resetFields);
      await revokeInvitations(tx, actor, target);
      action = "user.disabled";
      await recordAccountState(tx, actor, target, action);
    } else if (input.action === "enable") {
      if (target.status !== "disabled") throw new TeamError("账号未停用", 409);
      data.status = "active";
      action = "user.enabled";
      await recordAccountState(tx, actor, target, action);
    } else if (input.action === "delete") {
      if (target.status === "deleted") throw new TeamError("账号已删除", 409);
      if (input.confirmation !== target.email)
        throw new TeamError("请输入账号完整邮箱以确认删除");
      await keepAdministrator(tx, target);
      await removeMemberships(tx, actor, target);
      await revokeInvitations(tx, actor, target);
      data.status = "deleted";
      data.deletedAt = new Date();
      data.sessionVersion = { increment: 1 };
      Object.assign(data, resetFields);
      action = "user.deleted";
    } else if (input.action === "restore") {
      if (target.status !== "deleted") throw new TeamError("账号未删除", 409);
      data.status = "active";
      data.deletedAt = null;
      data.role = "user";
      data.sessionVersion = { increment: 1 };
      Object.assign(data, resetFields);
      action = "user.restored";
    } else if (input.action === "role") {
      if (
        target.status !== "active" ||
        !["user", "admin"].includes(String(input.role))
      )
        throw new TeamError("请选择正常账号和有效角色");
      if (target.role === input.role)
        return {
          account: await tx.user.findUniqueOrThrow({
            where: { id: targetId },
            select: safeSelect,
          }),
        };
      await keepAdministrator(tx, target);
      data.role = input.role as string;
      data.sessionVersion = { increment: 1 };
      Object.assign(data, resetFields);
      action = "user.role-changed";
    } else if (input.action === "recovery") {
      if (target.status !== "active")
        throw new TeamError("请先恢复或启用账号", 409);
      const token = randomBytes(32).toString("base64url"),
        expiresAt = new Date(Date.now() + 30 * 60000);
      data.resetTokenHash = createHash("sha256").update(token).digest("hex");
      data.resetExpiresAt = expiresAt;
      recovery = { token, expiresAt };
      action = "user.recovery-issued";
    } else if (input.action === "revoke-recovery") {
      Object.assign(data, resetFields);
      action = "user.recovery-revoked";
    } else throw new TeamError("操作不正确");
    const account = await tx.user.update({
      where: { id: targetId },
      data,
      select: safeSelect,
    });
    await appendAudit(tx, {
      actor,
      action,
      targetId,
      targetName: target.name,
      metadata:
        input.action === "role"
          ? { role: input.role, previousRole: target.role }
          : {},
    });
    return { account, ...(recovery ? { recovery } : {}) };
  }, options);
}
export async function recoverAccount(input: Record<string, unknown>) {
  if (
    typeof input.token !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(input.token)
  )
    throw new TeamError("恢复链接已失效，请联系平台管理员重新生成", 410);
  if (input.action !== "inspect" && input.action !== "reset")
    throw new TeamError("操作不正确");
  const tokenHash = createHash("sha256").update(input.token).digest("hex");
  const password =
    input.action === "reset" ? accountPassword(input.password) : null;
  const initial = await prisma.user.findUnique({
    where: { resetTokenHash: tokenHash },
  });
  if (
    !initial ||
    initial.status !== "active" ||
    !initial.resetExpiresAt ||
    initial.resetExpiresAt <= new Date()
  )
    throw new TeamError("恢复链接已失效，请联系平台管理员重新生成", 410);
  const encoded = password ? await hash(password, 12) : null;
  return prisma.$transaction(async (tx) => {
    await lockAccounts(tx);
    const user = await tx.user.findUnique({
      where: { resetTokenHash: tokenHash },
    });
    if (
      !user ||
      user.status !== "active" ||
      !user.resetExpiresAt ||
      user.resetExpiresAt <= new Date()
    )
      throw new TeamError("恢复链接已失效，请联系平台管理员重新生成", 410);
    if (!password) return { expiresAt: user.resetExpiresAt };
    await tx.user.update({
      where: { id: user.id },
      data: {
        password: encoded!,
        ...resetFields,
        sessionVersion: { increment: 1 },
        accountVersion: { increment: 1 },
      },
    });
    await appendAudit(tx, {
      actor: user,
      action: "user.password-reset",
      targetId: user.id,
      targetName: user.name,
    });
    return { reset: true };
  }, options);
}
