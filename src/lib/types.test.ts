import { describe, it, expect } from "vitest";
import type {
  Endpoint,
  EndpointParam,
  Project,
  Organization,
  DragItem,
  DropTarget,
  SendRequestResult,
} from "@/lib/types";

describe("lib/types", () => {
  it("Endpoint type works with all fields", () => {
    const endpoint: Endpoint = {
      id: "ep-1",
      name: "Get Users",
      method: "GET",
      path: "/api/users",
      description: "List all users",
      folderId: null,
      parameters: [
        {
          id: "p1",
          name: "page",
          type: "integer",
          required: false,
          location: "query",
          description: "Page number",
          example: "1",
        },
      ],
      requestBody: {
        id: "rb1",
        contentType: "application/json",
        schema: '{"type": "object"}',
        example: '{}',
      },
      responses: [
        {
          id: "r1",
          statusCode: 200,
          description: "Success",
          contentType: "application/json",
          example: '[]',
        },
      ],
    };
    expect(endpoint.method).toBe("GET");
    expect(endpoint.parameters?.length).toBe(1);
    expect(endpoint.requestBody?.contentType).toBe("application/json");
  });

  it("DragItem type accepts valid variants", () => {
    const folderDrag: DragItem = { type: "folder", id: "f1" };
    const endpointDrag: DragItem = { type: "endpoint", id: "ep1" };

    expect(folderDrag.type).toBe("folder");
    expect(endpointDrag.type).toBe("endpoint");
  });

  it("DropTarget type accepts valid variants", () => {
    const folderInside: DropTarget = { type: "folder", id: "f1", position: "inside" };
    const folderBefore: DropTarget = { type: "folder", id: "f1", position: "before" };
    const endpointAfter: DropTarget = { type: "endpoint", id: "ep1", position: "after" };
    const root: DropTarget = { type: "root" };

    expect(folderInside.position).toBe("inside");
    expect(folderBefore.position).toBe("before");
    expect(endpointAfter.position).toBe("after");
    expect(root.type).toBe("root");
  });

  it("SendRequestResult has correct shape", () => {
    const result: SendRequestResult = {
      status: 200,
      headers: { "content-type": "application/json" },
      body: '{"ok": true}',
      duration: 150,
    };

    expect(result.status).toBe(200);
    expect(result.duration).toBeGreaterThan(0);
  });

  it("Project type accepts optional fields", () => {
    const project: Project = {
      id: "proj-1",
      name: "My Project",
      description: "Test project",
      baseUrl: "https://api.example.com",
      isPublic: true,
      environments: [],
      globalHeaders: [],
      globalParams: [],
      folders: [],
      endpoints: [],
    };

    expect(project.isPublic).toBe(true);
    expect(project.environments).toHaveLength(0);
  });

  it("Organization type includes members", () => {
    const org: Organization = {
      id: "org-1",
      name: "Acme",
      description: "Acme Corp",
      members: [
        {
          id: "m1",
          user: { id: "u1", email: "admin@acme.com", name: "Admin" },
          role: "owner",
        },
      ],
    };

    expect(org.members[0].role).toBe("owner");
  });

  it("EndpointParam supports all location types", () => {
    const param: EndpointParam = {
      name: "id",
      type: "string",
      required: true,
      location: "path",
      description: "Resource ID",
      example: "123",
    };

    expect(["query", "path", "header"]).toContain(param.location);
  });
});
