import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";
import { appendAudit } from "@/lib/audit/write";
export class BootstrapError extends Error {}
export function bootstrapCredentials(email: unknown, password: unknown) {
  const normalized =
    typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || normalized.length > 254)
    throw new BootstrapError("初始化管理员必须设置有效的 ADMIN_EMAIL");
  if (
    typeof password !== "string" ||
    password.length < 12 ||
    new TextEncoder().encode(password).length > 72
  )
    throw new BootstrapError(
      "初始化管理员必须设置 ADMIN_PASSWORD，至少 12 位且不超过 72 字节",
    );
  return { email: normalized, password };
}
export async function bootstrapAdministrator() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const existing = email
    ? await prisma.user.findUnique({
        where: { email },
        select: { id: true, role: true },
      })
    : await prisma.user.findFirst({
        where: { role: "admin" },
        select: { id: true, role: true },
      });
  if (existing) {
    if (existing.role !== "admin")
      throw new BootstrapError("该邮箱已被普通账号使用，不会自动提升权限");
    return { created: false };
  }
  const credentials = bootstrapCredentials(
    process.env.ADMIN_EMAIL,
    process.env.ADMIN_PASSWORD,
  );
  const password = await hash(credentials.password, 12);
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: credentials.email,
        name: "Admin",
        password,
        role: "admin",
      },
    });
    await appendAudit(tx, {
      actor: { name: "初始化" },
      action: "user.created",
      targetId: user.id,
      targetName: user.name,
      metadata: { role: "admin" },
    });
  });
  return { created: true };
}
