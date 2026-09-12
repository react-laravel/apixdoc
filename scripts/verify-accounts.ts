import "dotenv/config";
import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { compare, hash } from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import {
  createAccount,
  readAccount,
  listAccounts,
  changeProfile,
  changeSecurity,
  manageAccount,
  recoverAccount,
} from "../src/lib/accounts/service";
import {
  createInvitation,
  acceptInvitation,
  changeMember,
} from "../src/lib/team/service";
async function main() {
  if (
    !["localhost", "127.0.0.1"].includes(
      new URL(process.env.DATABASE_URL!).hostname,
    )
  )
    throw new Error("Local database required");
  const ids: string[] = [],
    orgs: string[] = [];
  const suffix = randomUUID().slice(0, 8),
    password = "AccountsQA-" + randomUUID();
  const blocked = (promise: Promise<unknown>, status: number) =>
    assert.rejects(
      promise,
      (error: unknown) =>
        !!error &&
        typeof error === "object" &&
        "status" in error &&
        error.status === status,
    );
  try {
    const admin = await prisma.user.create({
      data: {
        email: `account-admin-${suffix}@example.test`,
        name: "Account admin",
        role: "admin",
        password: await hash(password, 10),
      },
    });
    ids.push(admin.id);
    const member = await createAccount(admin.id, {
      email: `account-member-${suffix}@example.test`,
      name: "Account member",
      password,
      role: "user",
    });
    ids.push(member.id);
    const other = await createAccount(admin.id, {
      email: `account-other-${suffix}@example.test`,
      name: "Account other",
      password,
      role: "admin",
    });
    ids.push(other.id);
    const version = async (id = member.id) =>
      (await prisma.user.findUniqueOrThrow({ where: { id } })).accountVersion;
    const manage = (action: string, extra: Record<string, unknown> = {}) =>
      version().then((v) =>
        manageAccount(admin.id, member.id, {
          action,
          version: v,
          currentPassword: password,
          ...extra,
        }),
      );
    await blocked(listAccounts(member.id, {}), 403);
    await blocked(
      createAccount(member.id, {
        email: `no-${suffix}@example.test`,
        name: "No",
        password,
      }),
      403,
    );
    await blocked(
      createAccount(admin.id, {
        email: member.email,
        name: "Duplicate",
        password,
      }),
      409,
    );
    const listing = await listAccounts(admin.id, { q: suffix });
    assert.equal(listing.items.length, 3);
    assert(!JSON.stringify(listing).includes("password"));
    assert(!JSON.stringify(listing).includes("sessionVersion"));
    const before = await version();
    const profile = await changeProfile(member.id, {
      name: "Changed name",
      version: before,
    });
    assert.equal(profile.name, "Changed name");
    await blocked(
      changeProfile(member.id, { name: "stale", version: before }),
      409,
    );
    const current = await version();
    await blocked(
      changeSecurity(member.id, {
        action: "password",
        currentPassword: "incorrect",
        password: "A-new-password",
        version: current,
      }),
      403,
    );
    assert.equal(await version(), current);
    await changeSecurity(member.id, {
      action: "password",
      currentPassword: password,
      password: "New-Account-Password",
      version: current,
    });
    const stored = await prisma.user.findUniqueOrThrow({
      where: { id: member.id },
    });
    assert(await compare("New-Account-Password", stored.password));
    assert.equal(stored.sessionVersion, 1);
    const recovery = await manage("recovery");
    assert(recovery.recovery);
    assert.notEqual(
      (await prisma.user.findUniqueOrThrow({ where: { id: member.id } }))
        .resetTokenHash,
      recovery.recovery.token,
    );
    const rotated = await manage("recovery");
    assert(rotated.recovery);
    await blocked(
      recoverAccount({ token: recovery.recovery.token, action: "inspect" }),
      410,
    );
    const resets = await Promise.allSettled(
      [1, 2].map(() =>
        recoverAccount({
          token: rotated.recovery!.token,
          action: "reset",
          password,
        }),
      ),
    );
    assert.equal(resets.filter((r) => r.status === "fulfilled").length, 1);
    await blocked(
      recoverAccount({
        token: rotated.recovery.token,
        action: "reset",
        password,
      }),
      410,
    );
    const expired = await manage("recovery");
    await prisma.user.update({
      where: { id: member.id },
      data: { resetExpiresAt: new Date(0) },
    });
    await blocked(
      recoverAccount({ token: expired.recovery!.token, action: "inspect" }),
      410,
    );
    const revoked = await manage("recovery");
    await manage("revoke-recovery");
    await blocked(
      recoverAccount({ token: revoked.recovery!.token, action: "inspect" }),
      410,
    );
    const org = await prisma.organization.create({
      data: {
        name: "Account integration " + suffix,
        members: {
          create: [
            { userId: admin.id, role: "owner" },
            { userId: member.id, role: "admin" },
            { userId: other.id, role: "member" },
          ],
        },
      },
    });
    orgs.push(org.id);
    const teamVersion = async () =>
      (await prisma.organization.findUniqueOrThrow({ where: { id: org.id } }))
        .teamVersion;
    const invite = await createInvitation(org.id, member, {
      email: `account-invite-${suffix}@example.test`,
      role: "viewer",
      version: await teamVersion(),
    });
    const project = await prisma.project.create({
      data: {
        name: "Retained project",
        organizationId: org.id,
        createdById: member.id,
      },
    });
    await prisma.apiEndpoint.create({
      data: {
        name: "Retained endpoint",
        method: "GET",
        path: "/retained",
        projectId: project.id,
        createdById: member.id,
      },
    });
    await blocked(
      manageAccount(admin.id, member.id, {
        action: "disable",
        version: await version(),
        currentPassword: "incorrect",
      }),
      403,
    );
    await manage("role", { role: "admin" });
    assert.equal((await readAccount(member.id)).role, "admin");
    await manage("role", { role: "user" });
    const beforeSession = (
      await prisma.user.findUniqueOrThrow({ where: { id: member.id } })
    ).sessionVersion;
    await manage("disable");
    await blocked(readAccount(member.id), 401);
    await blocked(
      createInvitation(org.id, member, {
        email: `x-${suffix}@example.test`,
        version: await teamVersion(),
      }),
      401,
    );
    await blocked(
      changeMember(org.id, admin, "transfer", {
        userId: member.id,
        confirmation: member.email,
        version: await teamVersion(),
      }),
      409,
    );
    await blocked(
      acceptInvitation(invite.token, undefined, { name: "No", password }),
      410,
    );
    await manage("enable");
    assert(
      (await prisma.user.findUniqueOrThrow({ where: { id: member.id } }))
        .sessionVersion > beforeSession,
    );
    const ownerOrg = await prisma.organization.create({
      data: {
        name: "Owned " + suffix,
        members: { create: { userId: member.id, role: "owner" } },
      },
    });
    orgs.push(ownerOrg.id);
    await blocked(manage("delete", { confirmation: member.email }), 409);
    await prisma.organization.delete({ where: { id: ownerOrg.id } });
    const pending = await createInvitation(org.id, admin, {
      email: `pending-${suffix}@example.test`,
      version: await teamVersion(),
    });
    await manage("delete", { confirmation: member.email });
    assert.equal(
      await prisma.organizationMember.count({ where: { userId: member.id } }),
      0,
    );
    assert(await prisma.project.findUnique({ where: { id: project.id } }));
    assert.equal(
      await prisma.apiEndpoint.count({ where: { createdById: member.id } }),
      1,
    );
    await blocked(
      createAccount(admin.id, { email: member.email, name: "Reuse", password }),
      409,
    );
    await manage("restore");
    assert.equal((await readAccount(member.id)).role, "user");
    assert.equal(
      await prisma.organizationMember.count({ where: { userId: member.id } }),
      0,
    );
    const inviteBack = await createInvitation(org.id, admin, {
      email: member.email,
      role: "member",
      version: await teamVersion(),
    });
    await acceptInvitation(inviteBack.token, member, {});
    assert.equal(
      await prisma.organizationMember.count({ where: { userId: member.id } }),
      1,
    );
    await changeSecurity(member.id, {
      action: "signout",
      currentPassword: password,
      version: await version(),
    });
    await blocked(
      manageAccount(admin.id, admin.id, {
        action: "disable",
        currentPassword: password,
        version: await version(admin.id),
      }),
      400,
    );
    // Competing admins cannot disable one another after losing their own authority.
    const cross = await Promise.allSettled([
      manageAccount(admin.id, other.id, {
        action: "disable",
        currentPassword: password,
        version: await version(other.id),
      }),
      manageAccount(other.id, admin.id, {
        action: "disable",
        currentPassword: password,
        version: await version(admin.id),
      }),
    ]);
    assert.equal(cross.filter((r) => r.status === "fulfilled").length, 1);
    await changeSecurity(member.id, {
      action: "delete",
      currentPassword: password,
      version: await version(),
      confirmation: member.email,
    });
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: member.id } }))
        .status,
      "deleted",
    );
    assert.equal(
      await prisma.organizationMember.count({ where: { userId: member.id } }),
      0,
    );
    const activeAdmin =
      (await prisma.user.findUniqueOrThrow({ where: { id: admin.id } }))
        .status === "active"
        ? admin
        : other;
    const extra = Array.from({ length: 51 }, (_, i) => ({
      id: randomUUID(),
      email: `pagination-${suffix}-${i}@example.test`,
      name: "Pagination",
      password: admin.password,
    }));
    ids.push(...extra.map((user) => user.id));
    await prisma.user.createMany({ data: extra });
    const firstPage = await listAccounts(activeAdmin.id, { q: suffix });
    assert.equal(firstPage.items.length, 50);
    assert(firstPage.next);
    const secondPage = await listAccounts(activeAdmin.id, {
      q: suffix,
      cursor: firstPage.next,
    });
    assert.equal(
      new Set([...firstPage.items, ...secondPage.items].map((user) => user.id))
        .size,
      54,
    );
    const deletedPage = await listAccounts(activeAdmin.id, {
      q: suffix,
      status: "deleted",
    });
    assert.deepEqual(
      deletedPage.items.map((user) => user.id),
      [member.id],
    );
    const audit = await prisma.auditEvent.findMany({
      where: { OR: [{ actorId: { in: ids } }, { targetId: { in: ids } }] },
    });
    const text = JSON.stringify(audit);
    for (const secret of [
      password,
      recovery.recovery.token,
      rotated.recovery.token,
      pending.token,
    ])
      assert(!text.includes(secret));
    for (const action of [
      "user.profile",
      "user.password-changed",
      "user.password-reset",
      "user.sessions-revoked",
      "user.disabled",
      "user.enabled",
      "user.deleted",
      "user.restored",
      "user.recovery-issued",
      "user.recovery-revoked",
    ])
      assert(
        audit.some((event) => event.action === action),
        `Missing ${action}`,
      );
    console.log(
      "Account integration passed: profile concurrency, credential changes, session versions, one-use/expired/revoked recovery, admin races, account lifecycle, retained content, invitation boundaries and audit privacy.",
    );
  } finally {
    await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
    await prisma.auditEvent.deleteMany({
      where: {
        OR: [
          { actorId: { in: ids } },
          { targetId: { in: ids } },
          { organizationId: { in: orgs } },
        ],
      },
    });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
