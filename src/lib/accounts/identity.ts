import type { Prisma } from "@prisma/client";
import { TeamError } from "@/lib/team/errors";
// Shared with membership/ownership creation. Always acquire before organization locks.
export async function lockAccounts(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(192837465, 1)`;
}
export async function activeAccount(tx: Prisma.TransactionClient, id: string) {
  const user = await tx.user.findUnique({ where: { id } });
  if (!user || user.status !== "active")
    throw new TeamError("账号不可用，请重新登录", 401);
  return user;
}
