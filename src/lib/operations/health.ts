import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "@/lib/prisma";
import { logFailure } from "./failures";
export interface Readiness {
  ready: boolean;
  checkedAt: string;
  database: "ok" | "unavailable";
  migrations: "ok" | "pending" | "failed" | "unavailable";
  pendingCount: number;
  failedCount: number;
  requestId?: string;
}
let expected: Promise<string[]> | undefined;
function migrations() {
  return (expected ||= readdir(join(process.cwd(), "prisma", "migrations"), {
    withFileTypes: true,
  }).then((entries) =>
    entries
      .filter((entry) => entry.isDirectory() && /^\d+_/.test(entry.name))
      .map((entry) => entry.name),
  ));
}
export function createReadinessCheck(
  probe: () => Promise<Readiness>,
  ttl = 5000,
) {
  let cached: Readiness | undefined;
  let expires = 0;
  let pending: Promise<Readiness> | undefined;
  return async () => {
    if (cached && Date.now() < expires) return cached;
    if (pending) return pending;
    pending = probe()
      .then((result) => {
        cached = result;
        expires = Date.now() + ttl;
        return result;
      })
      .finally(() => {
        pending = undefined;
      });
    return pending;
  };
}
export const checkReadiness = createReadinessCheck(async () => {
  const checkedAt = new Date().toISOString();
  try {
    const names = await migrations();
    if (!names.length) throw new Error("Missing migration manifest");
    const result = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SET LOCAL statement_timeout = '2000ms'`;
        const records = await tx.$queryRaw<
          {
            migration_name: string;
            finished_at: Date | null;
            rolled_back_at: Date | null;
          }[]
        >`SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"`;
        const applied = new Set(
          records
            .filter((r) => r.finished_at && !r.rolled_back_at)
            .map((r) => r.migration_name),
        );
        const failedCount = records.filter(
          (r) => !r.finished_at && !r.rolled_back_at,
        ).length;
        const pendingCount = names.filter((name) => !applied.has(name)).length;
        if (!pendingCount && !failedCount) {
          await tx.project.findFirst({
            select: {
              id: true,
              settingsVersion: true,
              publicationVersion: true,
            },
          });
          await tx.auditEvent.findFirst({
            select: { id: true, metadata: true },
          });
        }
        return { pendingCount, failedCount };
      },
      { maxWait: 1500, timeout: 4000 },
    );
    return {
      ready: !result.pendingCount && !result.failedCount,
      checkedAt,
      database: "ok",
      migrations: result.failedCount
        ? "failed"
        : result.pendingCount
          ? "pending"
          : "ok",
      ...result,
    };
  } catch (error) {
    return {
      ready: false,
      checkedAt,
      database: "unavailable",
      migrations: "unavailable",
      pendingCount: 0,
      failedCount: 0,
      requestId: logFailure(error, "readiness"),
    };
  }
});
