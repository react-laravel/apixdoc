import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import {
  createDocument,
  updateDocument,
  copyDocument,
  archiveDocument,
  restoreDocument,
  readDocumentHistory,
  readDocumentRevision,
  exportDocumentRevision,
  recycleBin,
  documentInclude,
  type StoredEndpoint,
} from "../src/lib/documents/service";
import { changeLayout } from "../src/lib/documents/layout";
import { createImportPlan } from "../src/lib/specification/import";
async function main() {
  assert(
    ["localhost", "127.0.0.1"].includes(
      new URL(process.env.DATABASE_URL!).hostname,
    ),
    "Use a local development database",
  );
  const suffix = randomUUID();
  const users: { id: string; name: string; email: string }[] = [];
  let orgId = "";
  try {
    for (const role of ["owner", "member", "viewer"])
      users.push(
        await prisma.user.create({
          data: {
            email: `document-${role}-${suffix}@example.test`,
            name: role,
            password: "not-a-login-password",
          },
          select: { id: true, name: true, email: true },
        }),
      );
    const org = await prisma.organization.create({
      data: {
        name: `Document checks ${suffix}`,
        members: {
          create: users.map((user, index) => ({
            userId: user.id,
            role: ["owner", "member", "viewer"][index],
          })),
        },
      },
    });
    orgId = org.id;
    const project = await prisma.project.create({
      data: {
        name: "Document verification",
        organizationId: org.id,
        createdById: users[0].id,
      },
    });
    const [owner, editor, viewer] = users;
    const rejected = (promise: Promise<unknown>, status: number) =>
      assert.rejects(
        promise,
        (e: unknown) =>
          e instanceof Error && "status" in e && e.status === status,
      );
    let doc: StoredEndpoint & {
      projectLayoutVersion: number;
      saveMerged?: boolean;
    } = await createDocument(project.id, owner, {
      name: "Users",
      method: "POST",
      path: "/users",
      description: "before",
    });
    const id = doc.id;
    const current = () =>
      prisma.apiEndpoint.findUniqueOrThrow({
        where: { id },
        include: documentInclude,
      });
    const layoutVersion = async () =>
      (await prisma.project.findUniqueOrThrow({ where: { id: project.id } }))
        .layoutVersion;
    await rejected(
      updateDocument(id, viewer, "basic", { version: 1, name: "forbidden" }),
      403,
    );
    await rejected(readDocumentHistory(id, viewer), 403);
    await rejected(
      updateDocument(id, owner, "basic", { name: "no version" }),
      428,
    );
    await updateDocument(id, editor, "basic", {
      version: 1,
      name: "Remote name",
    });
    doc = await updateDocument(id, owner, "basic", {
      version: 1,
      description: "my description",
    });
    assert.equal(doc.name, "Remote name");
    assert.equal(doc.description, "my description");
    assert.equal(doc.saveMerged, true);
    const race = await Promise.allSettled([
      updateDocument(id, owner, "basic", {
        version: doc.version,
        description: "a",
      }),
      updateDocument(id, editor, "basic", {
        version: doc.version,
        description: "b",
      }),
    ]);
    assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(race.filter((r) => r.status === "rejected").length, 1);
    const before = await current();
    doc = await updateDocument(id, owner, "body", {
      version: before.version,
      requestBody: {
        contentType: "application/json",
        schema: '{"type":"object"}',
        example: '{"id":9007199254740993123}',
        content: '{"text/plain":{"example":"keep"}}',
      },
    });
    const bodyBase = doc;
    await updateDocument(id, owner, "body", {
      version: bodyBase.version,
      requestBody: {
        ...bodyBase.requestBody!,
        schema: '{"type":"object","title":"New schema"}',
      },
    });
    doc = await updateDocument(id, editor, "body", {
      version: bodyBase.version,
      requestBody: {
        ...bodyBase.requestBody!,
        example: '{"id":9007199254740993124}',
      },
    });
    assert(doc.requestBody!.schema.includes("New schema"));
    assert(doc.requestBody!.content.includes("9007199254740993124"));
    assert(doc.requestBody!.content.includes("keep"));
    const versionBefore = doc.version;
    doc = await updateDocument(id, owner, "basic", {
      version: doc.version,
      name: doc.name,
    });
    assert.equal(doc.version, versionBefore);
    const folder = await changeLayout(
      project.id,
      owner,
      { name: "Folder" },
      "create",
    );
    const foreignProject = await prisma.project.create({
      data: {
        name: "Other fixture project",
        organizationId: org.id,
        createdById: owner.id,
      },
    });
    await rejected(
      changeLayout(
        project.id,
        owner,
        {
          version: await layoutVersion(),
          folders: [{ id: folder.id, order: 0, projectId: foreignProject.id }],
        },
        "reorder",
      ),
      400,
    );
    assert.equal(
      (await prisma.folder.findUniqueOrThrow({ where: { id: folder.id } }))
        .projectId,
      project.id,
    );
    const foreignFolder = await prisma.folder.create({
      data: {
        projectId: foreignProject.id,
        name: "Legacy association",
        parentId: folder.id,
      },
    });
    await rejected(
      changeLayout(
        project.id,
        owner,
        { version: await layoutVersion() },
        "delete",
        folder.id,
      ),
      409,
    );
    assert(await prisma.folder.findUnique({ where: { id: foreignFolder.id } }));
    await prisma.folder.update({
      where: { id: foreignFolder.id },
      data: { parentId: null },
    });
    const child = await changeLayout(
      project.id,
      owner,
      { name: "Child", parentId: folder.id },
      "create",
    );
    await rejected(
      changeLayout(
        project.id,
        owner,
        {
          version: await layoutVersion(),
          folders: [
            { id: folder.id, parentId: child.id },
            { id: child.id, parentId: folder.id },
          ],
        },
        "reorder",
      ),
      400,
    );
    doc = await updateDocument(id, owner, "basic", {
      version: doc.version,
      folderId: child.id,
    });
    await changeLayout(
      project.id,
      owner,
      { version: await layoutVersion(), name: "Renamed" },
      "update",
      folder.id,
    );
    const moved = await current();
    const unchangedLayoutVersion = await layoutVersion();
    await changeLayout(
      project.id,
      owner,
      { version: unchangedLayoutVersion, name: "Renamed" },
      "update",
      folder.id,
    );
    assert.equal(await layoutVersion(), unchangedLayoutVersion);
    assert.equal((await current()).version, moved.version);
    const history = await readDocumentHistory(id, owner);
    assert.equal(history.items[0].action, "moved");
    assert(
      (
        await readDocumentRevision(id, history.items[0].id, owner)
      ).snapshot.folderLabel.includes("Renamed"),
    );
    await archiveDocument(id, editor, { version: moved.version });
    assert.equal((await recycleBin(project.id, owner)).total, 1);
    await rejected(
      updateDocument(id, editor, "basic", {
        version: moved.version,
        name: "deleted",
      }),
      410,
    );
    const duplicate = await createDocument(project.id, owner, {
      name: "Replacement",
      method: "POST",
      path: "/users",
    });
    assert(duplicate.id !== id);
    await rejected(
      restoreDocument(id, undefined, owner, {
        version: (await current()).version,
      }),
      409,
    );
    doc = await restoreDocument(id, undefined, owner, {
      version: (await current()).version,
      path: "/restored",
    });
    assert.equal(doc.deletedAt, null);
    assert(doc.requestBody!.content.includes("9007199254740993124"));
    const oldest = await prisma.endpointRevision.findFirstOrThrow({
      where: { endpointId: id },
      orderBy: { version: "asc" },
    });
    const restored = await restoreDocument(id, oldest.id, editor, {
      version: doc.version,
      path: "/old-version",
    });
    assert.equal(restored.description, "before");
    assert.equal(restored.requestBody, null);
    const copy = await copyDocument(id, owner, { version: restored.version });
    assert.equal(copy.version, 1);
    await updateDocument(copy.id, owner, "basic", {
      version: 1,
      path: "/copy",
    });
    for (let index = 0; index < 52; index++) {
      const value = await current();
      await updateDocument(id, owner, "basic", {
        version: value.version,
        description: `version ${index}`,
      });
    }
    assert.equal(
      await prisma.endpointRevision.count({ where: { endpointId: id } }),
      50,
    );
    await rejected(
      updateDocument(id, owner, "basic", {
        version: 1,
        description: "ancient",
      }),
      409,
    );
    // An imported source remains archived until a compatible restore succeeds.
    const sourceText =
      '{"openapi":"3.1.0","info":{"title":"Legacy","version":"1"},"components":{"schemas":{"Thing":{"type":"string","example":9007199254740993123}}},"paths":{"/legacy":{"get":{"summary":"Legacy","responses":{"200":{"description":"OK","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Thing"}}}}}}}}}';
    const plan = createImportPlan(sourceText);
    const source = await prisma.specificationImport.create({
      data: {
        projectId: project.id,
        name: plan.name,
        format: plan.format,
        version: plan.version,
        document: sourceText,
        pointers: JSON.stringify(plan.endpoints.map((e) => e.sourcePointer)),
        active: false,
      },
    });
    const {
      folderPath: _,
      parameters,
      headers,
      requestBody,
      responses,
      ...fields
    } = plan.endpoints[0];
    void _;
    const legacy = await prisma.apiEndpoint.create({
      data: {
        ...fields,
        createdById: owner.id,
        projectId: project.id,
        sourceImportId: source.id,
        deletedAt: new Date(),
        parameters: { create: parameters },
        headers: { create: headers },
        responses: { create: responses },
        ...(requestBody ? { requestBody: { create: requestBody } } : {}),
      },
    });
    const conflicting = await prisma.specificationImport.create({
      data: {
        projectId: project.id,
        name: "Conflicting",
        format: "openapi",
        version: "3.1.0",
        document: sourceText.replace('"type":"string"', '"type":"number"'),
        pointers: JSON.stringify(plan.endpoints.map((e) => e.sourcePointer)),
      },
    });
    await rejected(
      restoreDocument(legacy.id, undefined, owner, { version: 1 }),
      409,
    );
    assert.equal(
      (
        await prisma.specificationImport.findUniqueOrThrow({
          where: { id: source.id },
        })
      ).active,
      false,
    );
    await prisma.specificationImport.update({
      where: { id: conflicting.id },
      data: { active: false },
    });
    await restoreDocument(legacy.id, undefined, owner, { version: 1 });
    assert.equal(
      (
        await prisma.specificationImport.findUniqueOrThrow({
          where: { id: source.id },
        })
      ).active,
      true,
    );
    const saved = (await readDocumentHistory(legacy.id, owner)).items[0];
    const exported = await exportDocumentRevision(legacy.id, saved.id, owner);
    assert(exported.document.includes("9007199254740993123"));
    assert(exported.document.includes("#/components/schemas/Thing"));
    console.log(
      "Document integration passed: permissions, merging, conflicts, exact numbers, layout cycles, history, archive/restore, source compatibility, retention and export.",
    );
  } finally {
    if (orgId) {
      await prisma.organization.deleteMany({ where: { id: orgId } });
      await prisma.auditEvent.deleteMany({ where: { organizationId: orgId } });
    }
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
