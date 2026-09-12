vi.mock("@/lib/audit/write", () => ({ appendAudit: vi.fn() }));
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { GET as downloadSource } from "../sources/[sourceId]/route";
const state = vi.hoisted(() => ({ role: "owner", user: true }));
const project = vi.hoisted(() => ({
  id: "p",
  organizationId: "org",
  name: "Import test",
  description: "",
  baseUrl: "",
  isPublic: false,
  endpoints: [],
  folders: [],
  environments: [],
  globalHeaders: [],
  globalParams: [],
  specificationImports: [],
}));
const create = vi.hoisted(() => vi.fn().mockResolvedValue({ id: "source" }));
const remove = vi.hoisted(() => vi.fn().mockResolvedValue({ count: 0 }));
vi.mock("@/lib/auth", () => ({
  auth: async () => (state.user ? { user: { id: "u" } } : null),
}));
vi.mock("@/lib/prisma", () => {
  const tx = {
    $queryRaw: async () => [{ id: "p" }],
    endpointRevision: { create: vi.fn(), findMany: async () => [] },
    project: { findUnique: async () => project, update: vi.fn() },
    organizationMember: {
      findUnique: async () => ({ role: state.role }),
      findFirst: async () => ({ role: state.role }),
    },
    specificationImport: { create, updateMany: remove, findFirst: create },
    apiEndpoint: { create, findMany: async () => [] },
    folder: { create, deleteMany: remove, findMany: async () => [] },
    environment: { createMany: create },
  };
  return {
    prisma: {
      ...tx,
      $transaction: async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
    },
  };
});
const source =
  '{"openapi":"3.1.0","info":{"title":"Import","version":"1"},"paths":{"/ping":{"get":{"responses":{"204":{"description":"OK"}}}}}}';
const context = { params: Promise.resolve({ id: "p" }) };
async function send(body: object) {
  return POST(
    new Request("http://localhost/api/projects/p/import", {
      method: "POST",
      body: JSON.stringify({ source, mode: "append", ...body }),
    }),
    context,
  );
}
beforeEach(() => {
  state.role = "owner";
  state.user = true;
  project.description = "";
  create.mockClear();
  remove.mockClear();
});
describe("specification import access and preview contract", () => {
  it("requires an authenticated editor and restricts replacement to managers", async () => {
    state.user = false;
    expect((await send({ action: "preview" })).status).toBe(401);
    state.user = true;
    state.role = "viewer";
    expect((await send({ action: "commit" })).status).toBe(403);
    state.role = "member";
    expect((await send({ action: "preview", mode: "replace" })).status).toBe(
      403,
    );
    expect((await send({ action: "preview" })).status).toBe(200);
    expect(create).not.toHaveBeenCalled();
  });
  it("rejects missing/stale previews before performing any writes", async () => {
    expect((await send({ action: "commit" })).status).toBe(409);
    const preview = await (await send({ action: "preview" })).json();
    expect(
      (
        await send({
          action: "commit",
          source: source.replace("/ping", "/different"),
          revision: preview.data.revision,
        })
      ).status,
    ).toBe(409);
    project.description = "Edited concurrently";
    expect(
      (await send({ action: "commit", revision: preview.data.revision }))
        .status,
    ).toBe(409);
    expect(create).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
  it("persists original source and nested structures only after a matching preview", async () => {
    const preview = await (await send({ action: "preview" })).json();
    expect(
      (await send({ action: "commit", revision: preview.data.revision }))
        .status,
    ).toBe(200);
    expect(create.mock.calls[0][0].data.document).toBe(source);
    expect(create.mock.calls[1][0].data.responses.create[0].contentType).toBe(
      "",
    );
  });
  it("requires the exact project name for destructive replacement", async () => {
    const preview = await (
      await send({ action: "preview", mode: "replace" })
    ).json();
    expect(
      (
        await send({
          action: "commit",
          mode: "replace",
          revision: preview.data.revision,
          confirmation: "wrong",
        })
      ).status,
    ).toBe(400);
    expect(remove).not.toHaveBeenCalled();
    expect(
      (
        await send({
          action: "commit",
          mode: "replace",
          revision: preview.data.revision,
          confirmation: project.name,
        })
      ).status,
    ).toBe(200);
    expect(remove).toHaveBeenCalledTimes(2);
  });
  it("does not expose an original file to a viewer", async () => {
    state.role = "viewer";
    const response = await downloadSource(new Request("http://localhost"), {
      params: Promise.resolve({ id: "p", sourceId: "source" }),
    });
    expect(response.status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });
});
