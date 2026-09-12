import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { appendAudit } from "../src/lib/audit/write";
import { readAudit, auditScopes } from "../src/lib/audit/read";
import { createDocument, updateDocument } from "../src/lib/documents/service";
import { saveProjectSettings } from "../src/lib/project-settings-service";
import {
  publicationStatus,
  changePublication,
} from "../src/lib/publications/service";
import { auditRetention, retentionOptions } from "../src/lib/audit/retention";
import { checkReadiness } from "../src/lib/operations/health";
async function main() {
  assert(
    ["localhost", "127.0.0.1"].includes(
      new URL(process.env.DATABASE_URL!).hostname,
    ),
  );
  const suffix = randomUUID();
  const users: { id: string; name: string; email: string }[] = [];
  const organizations: string[] = [];
  try {
    for (const name of ["owner", "member", "outsider", "platform"])
      users.push(
        await prisma.user.create({
          data: {
            name,
            email: `audit-${name}-${suffix}@example.test`,
            password: "not-a-password",
            role: name === "platform" ? "admin" : "user",
          },
          select: { id: true, name: true, email: true },
        }),
      );
    const [owner, member, outsider, platform] = users;
    for (const user of [owner, outsider]) {
      const org = await prisma.organization.create({
        data: {
          name: `Audit ${user.name} ${suffix}`,
          members: { create: { userId: user.id, role: "owner" } },
        },
      });
      organizations.push(org.id);
    }
    await prisma.organizationMember.create({
      data: {
        organizationId: organizations[0],
        userId: member.id,
        role: "member",
      },
    });
    const project = await prisma.project.create({
      data: {
        name: "Audit verification",
        organizationId: organizations[0],
        createdById: owner.id,
      },
    });
    const document = await createDocument(project.id, owner, {
      name: "Tracked endpoint",
      method: "GET",
      path: "/audit",
    });
    await updateDocument(document.id, member, "headers", {
      version: 1,
      headers: [{ key: "Authorization", value: "Bearer private-header" }],
    });
    await saveProjectSettings(project.id, owner, {
      version: 1,
      environments: [
        {
          name: "prod",
          baseUrl: "https://example.com",
          variables: '{"token":"private-variable"}',
        },
      ],
    });
    const preview = await publicationStatus(project.id, owner);
    await changePublication(project.id, owner, {
      action: "publish",
      version: preview.version,
      fingerprint: preview.fingerprint,
      title: "Audit publication",
    });
    const statusBefore = await publicationStatus(project.id, owner);
    await changePublication(project.id, owner, {
      action: "activate",
      publicationId: statusBefore.currentId,
      version: statusBefore.version,
    });
    const nextStatus = await publicationStatus(project.id, owner);
    await changePublication(project.id, owner, {
      action: "publish",
      title: "Second audit publication",
      fingerprint: nextStatus.fingerprint,
      version: nextStatus.version,
    });
    const publicationAudit = await prisma.auditEvent.findFirstOrThrow({
      where: { projectId: project.id, action: "publication.publish" },
      orderBy: { createdAt: "desc" },
    });
    assert.equal(JSON.parse(publicationAudit.metadata).version, 2);
    const records = await readAudit(owner.id, { projectId: project.id });
    assert(records.items.some((e) => e.action === "endpoint.created"));
    assert(records.items.some((e) => e.action === "endpoint.updated"));
    assert(records.items.some((e) => e.action === "project.settings"));
    assert(records.items.some((e) => e.action === "publication.publish"));
    assert(!JSON.stringify(records).includes("private-header"));
    assert(!JSON.stringify(records).includes("private-variable"));
    await assert.rejects(
      readAudit(member.id, { organizationId: organizations[0] }),
      (e: unknown) => e instanceof Error && "status" in e && e.status === 403,
    );
    await assert.rejects(
      readAudit(outsider.id, { projectId: project.id }),
      (e: unknown) => e instanceof Error && "status" in e && e.status === 403,
    );
    assert((await auditScopes(platform.id)).isPlatformAdmin);
    const before = await prisma.auditEvent.count({
      where: { projectId: project.id },
    });
    await assert.rejects(
      prisma.$transaction(async (tx) => {
        await tx.project.update({
          where: { id: project.id },
          data: { name: "Rollback" },
        });
        await appendAudit(tx, {
          actor: owner,
          projectId: project.id,
          action: "project.settings",
          metadata: { fields: ["name"] },
        });
        throw new Error("abort");
      }),
    );
    assert.equal(
      (await prisma.project.findUniqueOrThrow({ where: { id: project.id } }))
        .name,
      "Audit verification",
    );
    assert.equal(
      await prisma.auditEvent.count({ where: { projectId: project.id } }),
      before,
    );
    for (let index = 0; index < 54; index++)
      await prisma.$transaction((tx) =>
        appendAudit(tx, {
          actor: owner,
          organizationId: organizations[0],
          action: "folder.created",
          targetName: `Page ${index}`,
        }),
      );
    const first = await readAudit(owner.id, {
      organizationId: organizations[0],
    });
    assert.equal(first.items.length, 50);
    assert(first.next);
    const second = await readAudit(owner.id, {
      organizationId: organizations[0],
      cursor: first.next,
    });
    assert(
      !second.items.some((row) =>
        first.items.some((previous) => previous.id === row.id),
      ),
    );
    await prisma.$transaction(async (tx) => {
      await appendAudit(tx, {
        actor: owner,
        projectId: project.id,
        action: "project.deleted",
        targetId: project.id,
        targetName: project.name,
      });
      await tx.project.delete({ where: { id: project.id } });
    });
    const retained = await readAudit(owner.id, { projectId: project.id });
    assert(retained.items.some((e) => e.action === "project.deleted"));
    assert(retained.items.every((e) => e.projectName === "Audit verification"));
    await prisma.organization.delete({ where: { id: organizations[0] } });
    const platformRows = await readAudit(platform.id, {
      organizationId: organizations[0],
    });
    assert(platformRows.items.length > 0);
    await assert.rejects(
      readAudit(owner.id, { organizationId: organizations[0] }),
      (e: unknown) => e instanceof Error && "status" in e && e.status === 403,
    );
    const old = await prisma.auditEvent.create({
      data: {
        organizationId: organizations[0],
        actorName: "Retention fixture",
        action: "project.created",
        createdAt: new Date(Date.now() - 400 * 86400000),
      },
    });
    const options = retentionOptions([
      "--days=180",
      `--organization=${organizations[0]}`,
    ]);
    assert.equal((await auditRetention(options)).removed, 0);
    assert(await prisma.auditEvent.findUnique({ where: { id: old.id } }));
    assert.equal(
      (await auditRetention({ ...options, apply: true })).removed,
      1,
    );
    assert.equal(
      await prisma.auditEvent.findUnique({ where: { id: old.id } }),
      null,
    );
    assert(
      await prisma.auditEvent.findFirst({
        where: { organizationId: organizations[0], action: "audit.retention" },
      }),
    );
    assert.equal((await checkReadiness()).ready, true);
    console.log(
      "Audit integration passed: mutation coverage, secret exclusion, scope authorization, transaction rollback, pagination, deletion retention and readiness.",
    );
  } finally {
    await prisma.organization.deleteMany({
      where: { id: { in: organizations } },
    });
    await prisma.auditEvent.deleteMany({
      where: { organizationId: { in: organizations } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: users.map((u) => u.id) } },
    });
    await prisma.$disconnect();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
