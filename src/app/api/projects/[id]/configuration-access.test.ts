import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getEnvironments } from "./environments/route";
import { GET as getGlobals } from "./globals/route";
import { GET as getProject } from "./route";
const state = vi.hoisted(() => ({
  user: { id: "viewer" },
  member: false,
  public: true,
}));
const environment = vi.hoisted(() => ({
  findMany: vi
    .fn()
    .mockResolvedValue([
      { name: "production", variables: '{"secret":"test"}' },
    ]),
}));
vi.mock("@/lib/auth", () => ({ auth: async () => ({ user: state.user }) }));
vi.mock("@/lib/prisma", () => {
  const client = {
    organizationMember: {
      findFirst: async () =>
        state.member ? { id: "m", role: "member" } : null,
      findUnique: async () =>
        state.member ? { id: "m", role: "member" } : null,
    },
    project: {
      findUnique: async () => ({
        id: "p",
        isPublic: state.public,
        publicationInitialized: true,
        publishedDocumentId: "release",
        organizationId: "o",
        folders: [],
        endpoints: [],
        environments: [{ variables: "secret" }],
        globalHeaders: [{ value: "secret" }],
        globalParams: [{ value: "secret" }],
      }),
    },
    $queryRaw: async () => [{ id: "p" }],
    publishedDocument: {
      findFirst: async () => ({
        id: "release",
        number: 1,
        title: "Published",
        createdAt: new Date(),
        content: JSON.stringify({
          id: "p",
          name: "Published project",
          description: "",
          baseUrl: "",
          isPublic: true,
          environments: [],
          globalHeaders: [],
          globalParams: [],
          folders: [],
          endpoints: [],
        }),
      }),
    },
    environment,
    globalHeader: { findMany: vi.fn().mockResolvedValue([]) },
    globalParam: { findMany: vi.fn().mockResolvedValue([]) },
  };
  return {
    prisma: {
      ...client,
      project: {
        ...client.project,
        findUniqueOrThrow: client.project.findUnique,
      },
      $transaction: async (fn: (tx: unknown) => unknown) =>
        fn({
          ...client,
          project: {
            ...client.project,
            findUniqueOrThrow: client.project.findUnique,
          },
        }),
    },
  };
});
const context = { params: Promise.resolve({ id: "p" }) };
beforeEach(() => {
  state.member = false;
  state.public = true;
  environment.findMany.mockClear();
});
describe("private project configuration", () => {
  it.each([getEnvironments, getGlobals])(
    "does not expose configuration to a nonmember",
    async (handler) => {
      const response = await handler(new Request("https://app.test"), context);
      expect(response.status).toBe(403);
      expect(environment.findMany).not.toHaveBeenCalled();
    },
  );
  it("allows members to read their environment configuration", async () => {
    state.member = true;
    const response = await getEnvironments(
      new Request("https://app.test"),
      context,
    );
    expect(response.status).toBe(200);
    expect(environment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: "p" } }),
    );
  });
  it("keeps public endpoint data readable while omitting runtime configuration", async () => {
    const response = await getProject(new Request("https://app.test"), context);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.data).toMatchObject({
      environments: [],
      globalHeaders: [],
      globalParams: [],
    });
  });
  it("continues to deny private projects to nonmembers", async () => {
    state.public = false;
    expect(
      (await getProject(new Request("https://app.test"), context)).status,
    ).toBe(403);
  });
});
