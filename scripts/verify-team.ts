import "dotenv/config";
import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import {
  createInvitation,
  revokeInvitation,
  changeMember,
  acceptInvitation,
  inspectInvitation,
} from "../src/lib/team/service";
async function main() {
  if (
    !["localhost", "127.0.0.1"].includes(
      new URL(process.env.DATABASE_URL!).hostname,
    )
  )
    throw new Error("Local database required");
  const userIds: string[] = [];
  let orgId = "";
  const generatedEmails: string[] = [];
  try {
    const suffix = randomUUID().slice(0, 8);
    const password = "TeamQA-" + randomUUID();
    const users: Record<string, { id: string; email: string; name: string }> =
      {};
    for (const role of ["owner", "admin", "member", "viewer", "existing"]) {
      users[role] = await prisma.user.create({
        data: {
          name: "Integration " + role,
          email: `team-test-${role}-${suffix}@example.test`,
          password: await hash(password, 10),
          role: "user",
        },
        select: { id: true, email: true, name: true },
      });
      userIds.push(users[role].id);
    }
    const org = await prisma.organization.create({
      data: {
        name: "Team integration " + suffix,
        description: "Temporary integration fixture",
        members: {
          create: ["owner", "admin", "member", "viewer"].map((role) => ({
            userId: users[role].id,
            role,
          })),
        },
      },
    });
    orgId = org.id;
    const version = async () =>
      (await prisma.organization.findUniqueOrThrow({ where: { id: org.id } }))
        .teamVersion;
    const blocked = async (promise: Promise<unknown>, status: number) =>
      assert.rejects(
        promise,
        (e: unknown) =>
          e instanceof Error && "status" in e && e.status === status,
      );
    for (const role of ["member", "viewer"])
      await blocked(
        createInvitation(org.id, users[role], {
          email: `no-${suffix}@example.test`,
          role: "member",
          version: await version(),
        }),
        403,
      );
    await blocked(
      createInvitation(org.id, users.admin, {
        email: `no-${suffix}@example.test`,
        role: "admin",
        version: await version(),
      }),
      403,
    );
    await blocked(
      changeMember(org.id, users.admin, "remove", {
        userId: users.owner.id,
        version: await version(),
      }),
      403,
    );
    await blocked(
      changeMember(org.id, users.owner, "leave", { version: await version() }),
      409,
    );
    let invite = await createInvitation(org.id, users.owner, {
      email: users.existing.email,
      role: "viewer",
      version: await version(),
    });
    const stored = await prisma.organizationInvitation.findUniqueOrThrow({
      where: { id: invite.invitation.id },
    });
    assert.notEqual(stored.tokenHash, invite.token);
    assert.equal(stored.tokenHash.length, 64);
    await blocked(acceptInvitation(invite.token, users.member, {}), 403);
    await blocked(acceptInvitation(invite.token, undefined, {}), 409);
    const joined = await acceptInvitation(invite.token, users.existing, {});
    assert.equal(joined.createdAccount, false);
    assert.equal(
      (await inspectInvitation(invite.token, users.existing)).status,
      "joined",
    );
    await changeMember(org.id, users.owner, "role", {
      userId: users.existing.id,
      role: "member",
      version: await version(),
    });
    assert.equal(
      (await inspectInvitation(invite.token, users.existing)).role,
      "member",
    );
    await blocked(acceptInvitation(invite.token, users.existing, {}), 410);
    await changeMember(org.id, users.owner, "remove", {
      userId: users.existing.id,
      version: await version(),
    });
    assert.equal(
      (await inspectInvitation(invite.token, users.existing)).status,
      "used",
    );
    generatedEmails.push(`expired-${suffix}@example.test`);
    invite = await createInvitation(org.id, users.admin, {
      email: `expired-${suffix}@example.test`,
      role: "member",
      version: await version(),
    });
    await prisma.organizationInvitation.update({
      where: { id: invite.invitation.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await blocked(
      acceptInvitation(invite.token, undefined, { name: "Expired", password }),
      410,
    );
    const renewed = await createInvitation(
      org.id,
      users.owner,
      { version: await version() },
      invite.invitation.id,
    );
    await blocked(inspectInvitation(invite.token), 404);
    await revokeInvitation(org.id, renewed.invitation.id, users.owner, {
      version: await version(),
    });
    await blocked(inspectInvitation(renewed.token), 410);
    const email = `race-${suffix}@example.test`;
    generatedEmails.push(email);
    invite = await createInvitation(org.id, users.owner, {
      email,
      role: "member",
      version: await version(),
    });
    const results = await Promise.allSettled([
      acceptInvitation(invite.token, undefined, {
        name: "Race signup",
        password,
      }),
      acceptInvitation(invite.token, undefined, {
        name: "Race signup",
        password,
      }),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(await prisma.user.count({ where: { email } }), 1);
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { email } })).role,
      "user",
    );
    await changeMember(org.id, users.admin, "role", {
      userId: users.viewer.id,
      role: "member",
      version: await version(),
    });
    await blocked(
      changeMember(org.id, users.admin, "role", {
        userId: users.viewer.id,
        role: "admin",
        version: await version(),
      }),
      403,
    );
    const stale = await version();
    await changeMember(org.id, users.owner, "role", {
      userId: users.viewer.id,
      role: "viewer",
      version: stale,
    });
    await blocked(
      changeMember(org.id, users.owner, "remove", {
        userId: users.viewer.id,
        version: stale,
      }),
      409,
    );
    const pending = await createInvitation(org.id, users.admin, {
      email: `demoted-${suffix}@example.test`,
      role: "member",
      version: await version(),
    });
    await changeMember(org.id, users.owner, "role", {
      userId: users.admin.id,
      role: "member",
      version: await version(),
    });
    await blocked(inspectInvitation(pending.token), 410);
    await changeMember(org.id, users.owner, "role", {
      userId: users.admin.id,
      role: "admin",
      version: await version(),
    });
    const transferVersion = await version();
    const transfers = await Promise.allSettled([
      changeMember(org.id, users.owner, "transfer", {
        userId: users.member.id,
        confirmation: users.member.email,
        version: transferVersion,
      }),
      changeMember(org.id, users.owner, "transfer", {
        userId: users.admin.id,
        confirmation: users.admin.email,
        version: transferVersion,
      }),
    ]);
    assert.equal(transfers.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(
      await prisma.organizationMember.count({
        where: { organizationId: org.id, role: "owner" },
      }),
      1,
    );
    const current = await prisma.organizationMember.findFirstOrThrow({
      where: { organizationId: org.id, role: "owner" },
      include: { user: true },
    });
    await blocked(
      changeMember(org.id, users.owner, "transfer", {
        userId: users.viewer.id,
        confirmation: users.viewer.email,
        version: await version(),
      }),
      403,
    );
    await changeMember(org.id, current.user, "transfer", {
      userId: users.owner.id,
      confirmation: users.owner.email,
      version: await version(),
    });
    // Earlier versions permitted multiple owners. Leaving must still retain at least one.
    await prisma.organizationMember.update({
      where: {
        userId_organizationId: {
          userId: users.admin.id,
          organizationId: org.id,
        },
      },
      data: { role: "owner" },
    });
    await changeMember(org.id, users.owner, "leave", {
      version: await version(),
    });
    assert.equal(
      await prisma.organizationMember.count({
        where: { organizationId: org.id, role: "owner" },
      }),
      1,
    );
    const events = await prisma.teamEvent.findMany({
      where: { organizationId: org.id },
    });
    assert(!JSON.stringify(events).includes(invite.token));
    console.log(
      "Team integration passed: authority, expiry, renewal, revocation, account binding, signup race, stale updates, demotion, ownership race.",
    );
  } finally {
    if (orgId) {
      await prisma.organization.deleteMany({ where: { id: orgId } });
      await prisma.auditEvent.deleteMany({ where: { organizationId: orgId } });
    }
    await prisma.user.deleteMany({
      where: {
        OR: [{ id: { in: userIds } }, { email: { in: generatedEmails } }],
      },
    });
    await prisma.$disconnect();
  }
}
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exitCode = 1;
});
