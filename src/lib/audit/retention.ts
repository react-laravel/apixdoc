import { prisma } from "@/lib/prisma";
import { appendAudit } from "./write";
export function retentionOptions(args: string[], now = new Date()) {
  for (const arg of args)
    if (
      arg !== "--apply" &&
      !/^--days=\d+$/.test(arg) &&
      !/^--organization=[A-Za-z0-9_-]{1,128}$/.test(arg)
    )
      throw new Error("参数仅支持 --apply、--days=天数、--organization=组织ID");
  const days = Number(
    args.find((arg) => arg.startsWith("--days="))?.slice(7) || 180,
  );
  if (!Number.isInteger(days) || days < 1 || days > 3650)
    throw new Error("保留天数应为 1–3650");
  return {
    apply: args.includes("--apply"),
    days,
    organizationId: args
      .find((arg) => arg.startsWith("--organization="))
      ?.slice(15),
    before: new Date(now.getTime() - days * 86400000),
  };
}
export async function auditRetention(
  options: ReturnType<typeof retentionOptions>,
) {
  const where = {
    createdAt: { lt: options.before },
    ...(options.organizationId
      ? { organizationId: options.organizationId }
      : {}),
  };
  const matched = await prisma.auditEvent.count({ where });
  if (!options.apply)
    return {
      matched,
      removed: 0,
      preview: true,
      before: options.before.toISOString(),
    };
  let removed = 0;
  while (true) {
    const count = await prisma.$transaction(async (tx) => {
      const rows = await tx.auditEvent.findMany({
        where,
        orderBy: { id: "asc" },
        select: { id: true },
        take: 500,
      });
      if (!rows.length) return 0;
      const result = await tx.auditEvent.deleteMany({
        where: { ...where, id: { in: rows.map((row) => row.id) } },
      });
      if (result.count)
        await appendAudit(tx, {
          action: "audit.retention",
          actor: { name: "审计维护" },
          organizationId: options.organizationId,
          metadata: { removedCount: result.count, days: options.days },
        });
      return result.count;
    });
    removed += count;
    if (!count) break;
  }
  return {
    matched,
    removed,
    preview: false,
    before: options.before.toISOString(),
  };
}
