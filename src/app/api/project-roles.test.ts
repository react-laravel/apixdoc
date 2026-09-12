import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST as createEndpoint } from "./endpoints/route";
import {
  PUT as updateEndpoint,
  DELETE as deleteEndpoint,
} from "./endpoints/[id]/route";
import { POST as copyEndpoint } from "./endpoints/[id]/copy/route";
import { POST as saveParams } from "./endpoints/[id]/params/route";
import { POST as saveHeaders } from "./endpoints/[id]/headers/route";
import { POST as saveBody } from "./endpoints/[id]/body/route";
import { POST as saveResponses } from "./endpoints/[id]/responses/route";
import { POST as createFolder } from "./folders/route";
import {
  PUT as updateFolder,
  DELETE as deleteFolder,
} from "./folders/[id]/route";
import { POST as createProject } from "./projects/route";
import { POST as reorder } from "./projects/[id]/reorder/route";
import {
  PUT as updateProject,
  DELETE as deleteProject,
} from "./projects/[id]/route";
import { POST as saveEnvironments } from "./projects/[id]/environments/route";
import { POST as saveGlobals } from "./projects/[id]/globals/route";

const state = vi.hoisted(() => ({
  role: "viewer",
  foreignFolder: false,
  sourceFolderId: null as string | null,
}));
const write = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    id: "new",
    environments: [],
    globalHeaders: [],
    globalParams: [],
  }),
);
vi.mock("@/lib/auth", () => ({ auth: async () => ({ user: { id: "user" } }) }));
vi.mock("@/lib/prisma", () => {
  const project = {
    id: "p",
    layoutVersion: 1,
    settingsVersion: 1,
    name: "Project",
    description: "",
    baseUrl: "",
    organizationId: "org",
    isPublic: false,
    folders: [],
    endpoints: [],
    globalHeaders: [],
    globalParams: [],
    environments: [],
  };
  const model = {
    create: write,
    update: write,
    delete: write,
    deleteMany: write,
    createMany: write,
  };
  const client = {
    project: {
      ...model,
      findUnique: async () => project,
      findUniqueOrThrow: async () => project,
    },
    apiEndpoint: {
      ...model,
      findUnique: async () => ({
        id: "e",
        version: 1,
        projectId: "p",
        project,
        folderId: state.sourceFolderId,
        name: "Endpoint",
        method: "GET",
        path: "/users",
        description: "",
        order: 0,
        parameters: [],
        headers: [],
        responses: [],
      }),
    },
    folder: {
      ...model,
      findUnique: async () => ({ id: "f", projectId: "p", project }),
      findFirst: async () => (state.foreignFolder ? null : { id: "child" }),
      findMany: async () => [
        { id: "f", parentId: null, name: "Folder", order: 0 },
        { id: "child", parentId: "f", name: "Child", order: 1 },
      ],
    },
    organizationMember: {
      findUnique: async () => ({ id: "m", role: state.role }),
      findFirst: async () => ({ id: "m", role: state.role }),
    },
    endpointParam: model,
    endpointHeader: model,
    endpointResponse: model,
    requestBody: model,
    environment: model,
    globalHeader: model,
    globalParam: model,
    $queryRaw: async () => [{ id: "p" }],
    projectSettingsRevision: {
      upsert: vi.fn(),
      findMany: async () => [],
      deleteMany: vi.fn(),
    },
    endpointRevision: {
      findUnique: async () => null,
      create: vi.fn(),
      findMany: async () => [],
      deleteMany: vi.fn(),
    },
  };
  return {
    prisma: {
      ...client,
      $transaction: async (
        work: ((tx: typeof client) => unknown) | unknown[],
      ) => (typeof work === "function" ? work(client) : Promise.all(work)),
    },
  };
});
beforeEach(() => {
  state.role = "viewer";
  state.foreignFolder = false;
  state.sourceFolderId = null;
  write.mockClear();
});
const context = { params: Promise.resolve({ id: "p" }) };
const payload = {
  version: 1,
  name: "Name",
  path: "/users",
  method: "GET",
  projectId: "p",
  organizationId: "org",
  params: [],
  headers: [],
  responses: [],
  environments: [],
  folders: [],
  endpoints: [],
};

describe("read-only project members", () => {
  it.each([
    ["create endpoint", createEndpoint],
    ["update endpoint", updateEndpoint],
    ["delete endpoint", deleteEndpoint],
    ["copy endpoint", copyEndpoint],
    ["parameters", saveParams],
    ["headers", saveHeaders],
    ["body", saveBody],
    ["responses", saveResponses],
    ["create folder", createFolder],
    ["update folder", updateFolder],
    ["delete folder", deleteFolder],
    ["create project", createProject],
    ["reorder", reorder],
    ["update project", updateProject],
    ["delete project", deleteProject],
    ["environments", saveEnvironments],
    ["globals", saveGlobals],
  ] as const)(
    "denies %s without performing any write",
    async (_name, handler) => {
      const response = await handler(
        new Request("https://app.test", {
          method: "POST",
          body: JSON.stringify(payload),
        }),
        context,
      );
      expect(response.status).toBe(403);
      expect(write).not.toHaveBeenCalled();
    },
  );
  it("lets members update runtime settings but not publish or delete projects", async () => {
    state.role = "member";
    expect(
      (
        await updateProject(
          new Request("https://app.test", {
            method: "PUT",
            body: JSON.stringify({
              baseUrl: "https://api.example.com",
              version: 1,
            }),
          }),
          context,
        )
      ).status,
    ).toBe(200);
    write.mockClear();
    expect(
      (
        await updateProject(
          new Request("https://app.test", {
            method: "PUT",
            body: JSON.stringify({ isPublic: true, version: 1 }),
          }),
          context,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await deleteProject(
          new Request("https://app.test", { method: "DELETE" }),
          context,
        )
      ).status,
    ).toBe(403);
    expect(write).not.toHaveBeenCalled();
  });
  it("allows project managers to change visibility", async () => {
    state.role = "admin";
    expect(
      (
        await updateProject(
          new Request("https://app.test", {
            method: "PUT",
            body: JSON.stringify({ isPublic: true, version: 1 }),
          }),
          context,
        )
      ).status,
    ).toBe(200);
    expect(write).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isPublic: true }),
      }),
    );
  });
  it("rejects moving endpoints to folders in another project", async () => {
    state.role = "member";
    state.foreignFolder = true;
    expect(
      (
        await updateEndpoint(
          new Request("https://app.test", {
            method: "PUT",
            body: JSON.stringify({ folderId: "foreign", version: 1 }),
          }),
          context,
        )
      ).status,
    ).toBe(409);
    expect(write).not.toHaveBeenCalled();
  });
  it("rejects a folder cycle through the direct update API", async () => {
    state.role = "member";
    const result = await updateFolder(
      new Request("https://app.test", {
        method: "PUT",
        body: JSON.stringify({ parentId: "child", version: 1 }),
      }),
      { params: Promise.resolve({ id: "f" }) },
    );
    expect(result.status).toBe(400);
    expect(write).not.toHaveBeenCalled();
  });
});

it("does not propagate a legacy cross-project folder reference when copying", async () => {
  state.role = "member";
  state.sourceFolderId = "foreign";
  state.foreignFolder = true;
  const response = await copyEndpoint(
    new Request("https://app.test", { method: "POST" }),
    context,
  );
  expect(response.status).toBe(201);
  expect(write).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ folderId: null, projectId: "p" }),
    }),
  );
});
