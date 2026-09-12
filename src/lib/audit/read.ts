import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DocumentError } from "@/lib/documents/http";
import { AUDIT_ACTIONS, auditDetail, type AuditRow } from "./model";
export interface AuditQuery {
  organizationId?: string;
  projectId?: string;
  actorId?: string;
  action?: string;
  q?: string;
  from?: string;
  to?: string;
  cursor?: string;
}
function id(value: string | undefined) {
  if (value && !/^[A-Za-z0-9_-]{1,128}$/.test(value))
    throw new DocumentError("筛选标识格式不正确");
  return value;
}
function date(value: string | undefined) {
  if (!value) return undefined;
  if (
    value.length > 40 ||
    !/^\d{4}-\d{2}-\d{2}T/.test(value) ||
    !Number.isFinite(new Date(value).getTime())
  )
    throw new DocumentError("日期格式不正确");
  return new Date(value);
}
async function access(tx: Prisma.TransactionClient, userId: string) {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { role: true, status: true },
  });
  if (!user || user.status !== "active")
    throw new DocumentError("请先登录", 401);
  const admin = user.role === "admin";
  const managed = admin
    ? []
    : await tx.organizationMember.findMany({
        where: { userId, role: { in: ["owner", "admin"] } },
        select: { organizationId: true },
      });
  return { admin, ids: managed.map((m) => m.organizationId) };
}
export async function auditScopes(userId: string) {
  return prisma.$transaction(
    async (tx) => {
      const allowed = await access(tx, userId);
      const organizations = await tx.organization.findMany({
        where: allowed.admin ? {} : { id: { in: allowed.ids } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });
      const projects = await tx.project.findMany({
        where: allowed.admin ? {} : { organizationId: { in: allowed.ids } },
        select: { id: true, name: true, organizationId: true },
        orderBy: { name: "asc" },
      });
      return {
        canRead: allowed.admin || allowed.ids.length > 0,
        isPlatformAdmin: allowed.admin,
        organizations,
        projects,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export async function readAudit(
  userId: string,
  query: AuditQuery,
  exporting = false,
) {
  return prisma.$transaction(
    async (tx) => {
      const allowed = await access(tx, userId);
      if (!allowed.admin && !allowed.ids.length)
        throw new DocumentError("只有组织管理员可以查看操作记录", 403);
      const organizationId = id(query.organizationId),
        projectId = id(query.projectId),
        actorId = id(query.actorId),
        cursor = id(query.cursor);
      if (
        organizationId &&
        !allowed.admin &&
        !allowed.ids.includes(organizationId)
      )
        throw new DocumentError("无权查看该组织的记录", 403);
      if (projectId) {
        const project =
          (await tx.project.findUnique({
            where: { id: projectId },
            select: { organizationId: true },
          })) ||
          (await tx.auditEvent.findFirst({
            where: { projectId },
            select: { organizationId: true },
          }));
        if (!project) throw new DocumentError("项目记录不存在", 404);
        if (organizationId && project.organizationId !== organizationId)
          throw new DocumentError("项目不属于所选组织");
        if (
          !allowed.admin &&
          (!project.organizationId ||
            !allowed.ids.includes(project.organizationId))
        )
          throw new DocumentError("无权查看该项目的记录", 403);
      }
      if (query.action && !Object.hasOwn(AUDIT_ACTIONS, query.action))
        throw new DocumentError("操作类型不正确");
      if ((query.q?.length || 0) > 200)
        throw new DocumentError("搜索内容最多 200 字");
      const from = date(query.from),
        to = date(query.to);
      if (from && to && from > to)
        throw new DocumentError("开始时间不能晚于结束时间");
      const where: Prisma.AuditEventWhereInput = {
        ...(allowed.admin ? {} : { organizationId: { in: allowed.ids } }),
        ...(organizationId ? { organizationId } : {}),
        ...(projectId ? { projectId } : {}),
        ...(actorId ? { actorId } : {}),
        ...(query.action ? { action: query.action } : {}),
        ...(from || to
          ? {
              createdAt: {
                ...(from ? { gte: from } : {}),
                ...(to ? { lte: to } : {}),
              },
            }
          : {}),
        ...(query.q
          ? {
              OR: [
                "actorName",
                "targetName",
                "projectName",
                "organizationName",
              ].map((field) => ({
                [field]: { contains: query.q, mode: "insensitive" },
              })),
            }
          : {}),
      };
      if (
        cursor &&
        !(await tx.auditEvent.findFirst({
          where: { ...where, id: cursor },
          select: { id: true },
        }))
      )
        throw new DocumentError("记录列表已变化，请重新加载", 409);
      const limit = exporting ? 5000 : 50;
      const rows = await tx.auditEvent.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        ...(cursor && !exporting ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (exporting && rows.length > limit)
        throw new DocumentError("导出最多 5000 条，请缩小筛选范围");
      const items = rows.slice(0, limit);
      return {
        items,
        next: rows.length > limit ? items.at(-1)!.id : null,
        total: await tx.auditEvent.count({ where }),
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export function auditCsv(rows: AuditRow[]): string {
  const cell = (value: string) => {
    const safe = /^[\s]*[=+\-@]/.test(value) ? "'" + value : value;
    return '"' + safe.replace(/"/g, '""') + '"';
  };
  const lines = [
    ["时间（UTC）", "组织", "项目", "操作者", "操作", "对象", "详情"],
    ...rows.map((row) => [
      new Date(row.createdAt).toISOString(),
      row.organizationName,
      row.projectName,
      row.actorName,
      AUDIT_ACTIONS[row.action] || row.action,
      row.targetName,
      auditDetail(row.metadata),
    ]),
  ];
  return "\uFEFF" + lines.map((row) => row.map(cell).join(",")).join("\r\n");
}
