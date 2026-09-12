import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import {
  createDocument,
  updateDocument,
  archiveDocument,
} from "../src/lib/documents/service";
import {
  publicationStatus,
  changePublication,
  readPublishedDocument,
  readDraftDocument,
  readStoredPublication,
} from "../src/lib/publications/service";
import {
  saveProjectSettings,
  recordSettingsRevision,
  bumpSettingsVersion,
  settingsInclude,
} from "../src/lib/project-settings-service";
import { settingsSnapshot } from "../src/lib/settings-model";
import {
  exportOpenApi,
  serializeSpecification,
} from "../src/lib/documentation/export";
async function main() {
  assert(
    ["localhost", "127.0.0.1"].includes(
      new URL(process.env.DATABASE_URL!).hostname,
    ),
  );
  const suffix = randomUUID();
  const users: { id: string; name: string; email: string }[] = [];
  let orgId = "";
  const rejected = (value: Promise<unknown>, status: number) =>
    assert.rejects(
      value,
      (e: unknown) =>
        e instanceof Error && "status" in e && e.status === status,
    );
  try {
    for (const name of ["owner", "member", "viewer", "outsider"])
      users.push(
        await prisma.user.create({
          data: {
            email: `publication-${name}-${suffix}@example.test`,
            name,
            password: "not-a-login-password",
          },
          select: { id: true, name: true, email: true },
        }),
      );
    const [owner, member, viewer, outsider] = users;
    const org = await prisma.organization.create({
      data: {
        name: `Publication verification ${suffix}`,
        members: {
          create: users.slice(0, 3).map((user, index) => ({
            userId: user.id,
            role: ["owner", "member", "viewer"][index],
          })),
        },
      },
    });
    orgId = org.id;
    const project = await prisma.project.create({
      data: {
        name: "Publication verification",
        isPublic: true,
        organizationId: org.id,
        createdById: owner.id,
      },
    });
    let endpoint = await createDocument(project.id, owner, {
      name: "Initial API",
      method: "POST",
      path: "/users",
    });
    await updateDocument(endpoint.id, owner, "body", {
      version: endpoint.version,
      requestBody: {
        contentType: "application/json",
        schema: "{}",
        example: '{"password":"private-body","id":9007199254740993123}',
        content: "{}",
      },
    });
    endpoint = (await prisma.apiEndpoint.findUniqueOrThrow({
      where: { id: endpoint.id },
      include: {
        parameters: true,
        headers: true,
        requestBody: true,
        responses: true,
      },
    })) as typeof endpoint;
    await updateDocument(endpoint.id, owner, "headers", {
      version: endpoint.version,
      headers: [{ key: "Authorization", value: "Bearer private-header" }],
    });
    await rejected(readPublishedDocument(project.id), 404);
    await rejected(publicationStatus(project.id, viewer), 403);
    let status = await publicationStatus(project.id, owner);
    await rejected(
      changePublication(project.id, member, {
        action: "publish",
        version: status.version,
        fingerprint: status.fingerprint,
        title: "forbidden",
      }),
      403,
    );
    const first = (
      await changePublication(project.id, owner, {
        action: "publish",
        version: status.version,
        fingerprint: status.fingerprint,
        title: "v1",
        note: "private-note",
      })
    ).publicationId!;
    let published = await readPublishedDocument(project.id);
    const serialized = JSON.stringify(published);
    for (const secret of ["private-body", "private-header", "private-note"])
      assert(!serialized.includes(secret));
    assert(serialized.includes("9007199254740993123"));
    let settings = await prisma.project.findUniqueOrThrow({
      where: { id: project.id },
      include: settingsInclude,
    });
    settings = await saveProjectSettings(project.id, owner, {
      version: settings.settingsVersion,
      globalHeaders: [
        {
          key: "X-Token",
          value: "private-global",
          enabled: true,
          description: "",
        },
      ],
    });
    assert.equal((await publicationStatus(project.id, owner)).changed, false);
    const version = settings.settingsVersion;
    await saveProjectSettings(project.id, owner, {
      version,
      name: "Working project",
    });
    settings = await saveProjectSettings(project.id, member, {
      version,
      description: "Member description",
    });
    assert.equal(settings.name, "Working project");
    assert.equal(settings.description, "Member description");
    assert.equal(
      (await readPublishedDocument(project.id)).name,
      "Publication verification",
    );
    const configVersion = settings.settingsVersion;
    const configs = await Promise.allSettled([
      saveProjectSettings(project.id, owner, {
        version: configVersion,
        globalHeaders: [{ key: "X", value: "a" }],
      }),
      saveProjectSettings(project.id, member, {
        version: configVersion,
        globalHeaders: [{ key: "X", value: "b" }],
      }),
    ]);
    assert.equal(configs.filter((v) => v.status === "fulfilled").length, 1);
    assert.equal(configs.filter((v) => v.status === "rejected").length, 1);
    settings = await prisma.project.findUniqueOrThrow({
      where: { id: project.id },
      include: settingsInclude,
    });
    const baseline = settingsSnapshot(settings);
    const beforeImport = settings.settingsVersion;
    await prisma.$transaction(async (tx) => {
      await recordSettingsRevision(tx, project.id);
      await tx.environment.create({
        data: {
          projectId: project.id,
          name: "Imported",
          baseUrl: "https://example.com",
          variables: '{"token":"env-secret","id":9007199254740993123}',
        },
      });
      await bumpSettingsVersion(tx, project.id);
    });
    settings = await saveProjectSettings(project.id, member, {
      ...baseline,
      version: beforeImport,
      description: "Preserve imported environment",
    });
    assert.equal(settings.environments.length, 1);
    assert(settings.environments[0].variables.includes("9007199254740993123"));
    await rejected(
      saveProjectSettings(project.id, member, {
        version: settings.settingsVersion,
        isPublic: false,
      }),
      403,
    );
    const staleSettings = settingsSnapshot(settings);
    const oldVersion = settings.settingsVersion;
    settings = await saveProjectSettings(project.id, owner, {
      version: settings.settingsVersion,
      isPublic: false,
    });
    settings = await saveProjectSettings(project.id, member, {
      ...staleSettings,
      version: oldVersion,
      description: "Member preserves ACL",
    });
    assert.equal(settings.isPublic, false);
    await rejected(readPublishedDocument(project.id), 401);
    await rejected(readPublishedDocument(project.id, outsider.id), 403);
    assert.equal(
      (await readPublishedDocument(project.id, viewer.id)).publication!.id,
      first,
    );
    settings = await saveProjectSettings(project.id, owner, {
      version: settings.settingsVersion,
      isPublic: true,
    });
    status = await publicationStatus(project.id, owner);
    const beforeEdit = status;
    endpoint = (await prisma.apiEndpoint.findUniqueOrThrow({
      where: { id: endpoint.id },
      include: {
        parameters: true,
        headers: true,
        requestBody: true,
        responses: true,
      },
    })) as typeof endpoint;
    await updateDocument(endpoint.id, member, "basic", {
      version: endpoint.version,
      name: "Unpublished change",
    });
    await rejected(
      changePublication(project.id, owner, {
        action: "publish",
        version: beforeEdit.version,
        fingerprint: beforeEdit.fingerprint,
        title: "stale",
      }),
      409,
    );
    assert.equal(
      (await readPublishedDocument(project.id)).endpoints[0].name,
      "Initial API",
    );
    status = await publicationStatus(project.id, owner);
    const second = (
      await changePublication(project.id, owner, {
        action: "publish",
        version: status.version,
        fingerprint: status.fingerprint,
        title: "v2",
      })
    ).publicationId!;
    assert.equal(
      (await readPublishedDocument(project.id)).endpoints[0].name,
      "Unpublished change",
    );
    assert.equal(
      (await readPublishedDocument(project.id, undefined, first)).endpoints[0]
        .name,
      "Initial API",
    );
    endpoint = (await prisma.apiEndpoint.findUniqueOrThrow({
      where: { id: endpoint.id },
      include: {
        parameters: true,
        headers: true,
        requestBody: true,
        responses: true,
      },
    })) as typeof endpoint;
    await archiveDocument(endpoint.id, owner, { version: endpoint.version });
    assert.equal((await readPublishedDocument(project.id)).endpoints.length, 1);
    assert.equal(
      (await readDraftDocument(project.id, owner)).endpoints.length,
      0,
    );
    status = await publicationStatus(project.id, owner);
    await changePublication(project.id, owner, {
      action: "activate",
      publicationId: first,
      version: status.version,
    });
    assert.equal(
      (await readPublishedDocument(project.id)).publication!.id,
      first,
    );
    status = await publicationStatus(project.id, owner);
    await changePublication(project.id, owner, {
      action: "revoke",
      publicationId: second,
      version: status.version,
    });
    await rejected(readPublishedDocument(project.id, undefined, second), 404);
    const file = serializeSpecification(
      exportOpenApi(await readPublishedDocument(project.id)),
      "json",
    );
    assert(file.includes("9007199254740993123"));
    assert(!file.includes("private-body"));
    status = await publicationStatus(project.id, owner);
    await changePublication(project.id, owner, {
      action: "withdraw",
      version: status.version,
      confirmation: settings.name,
    });
    await rejected(readPublishedDocument(project.id, undefined, first), 404);
    status = await publicationStatus(project.id, owner);
    await changePublication(project.id, owner, {
      action: "publish",
      version: status.version,
      fingerprint: status.fingerprint,
      title: "v3",
    });
    await rejected(readPublishedDocument(project.id, undefined, first), 404);
    const legacy = await prisma.project.create({
      data: {
        name: "Legacy public",
        isPublic: true,
        publicationInitialized: false,
        organizationId: org.id,
        createdById: owner.id,
      },
    });
    const legacyEndpoint = await prisma.apiEndpoint.create({
      data: {
        name: "Legacy content",
        method: "GET",
        path: "/legacy",
        projectId: legacy.id,
        createdById: owner.id,
      },
    });
    await Promise.all([
      readPublishedDocument(legacy.id),
      updateDocument(legacyEndpoint.id, owner, "basic", {
        version: 1,
        name: "New draft",
      }),
    ]);
    published = await readPublishedDocument(legacy.id);
    assert.equal(published.endpoints[0].name, "Legacy content");
    assert.equal(
      await prisma.publishedDocument.count({ where: { projectId: legacy.id } }),
      1,
    );
    assert.equal(
      (await readStoredPublication(project.id, first, owner)).endpoints[0].name,
      "Initial API",
    );
    await rejected(readStoredPublication(project.id, first, viewer), 403);
    const privateLegacy = await prisma.project.create({
      data: {
        name: "Legacy private",
        publicationInitialized: false,
        organizationId: org.id,
        createdById: owner.id,
      },
    });
    const privateEndpoint = await prisma.apiEndpoint.create({
      data: {
        name: "Private legacy API",
        method: "GET",
        path: "/private",
        projectId: privateLegacy.id,
        createdById: owner.id,
      },
    });
    await updateDocument(privateEndpoint.id, owner, "basic", {
      version: 1,
      name: "Private working change",
    });
    assert.equal(
      (await readPublishedDocument(privateLegacy.id, viewer.id)).endpoints[0]
        .name,
      "Private legacy API",
    );
    await rejected(readPublishedDocument(privateLegacy.id), 401);
    await prisma.specificationImport.create({
      data: {
        projectId: project.id,
        name: "Broken fixture",
        format: "openapi",
        version: "3.1.0",
        document: "{broken",
        pointers: "[]",
      },
    });
    const invalidDraft = await publicationStatus(project.id, owner);
    assert(invalidDraft.draftError);
    assert.equal(invalidDraft.fingerprint, null);
    await changePublication(project.id, owner, {
      action: "withdraw",
      version: invalidDraft.version,
      confirmation: settings.name,
    });
    await rejected(readPublishedDocument(project.id), 404);
    console.log(
      "Publication integration passed: frozen content, access control, preview freshness, pinned versions, revocation, legacy migration, settings merging and imported environments.",
    );
  } finally {
    if (orgId) await prisma.organization.deleteMany({ where: { id: orgId } });
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
