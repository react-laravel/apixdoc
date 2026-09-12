import { describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { exportOpenApi, exportPostman, serializeSpecification } from "./export";
import { parseDocumentJson, stringifyDocumentJson } from "./json";
import type { Project } from "@/lib/types";
const project: Project = {
  id: "p",
  name: "API",
  description: "Docs",
  baseUrl: "https://example.com/v1",
  isPublic: false,
  environments: [],
  globalHeaders: [],
  globalParams: [],
  folders: [{ id: "f", name: "Users" }],
  endpoints: [
    {
      id: "e",
      name: "Get user",
      description: "Read",
      method: "GET",
      path: "/users/{id}",
      folderId: "f",
      parameters: [
        {
          name: "id",
          location: "path",
          type: "integer",
          example: "9223372036854775807",
          required: true,
          description: "ID",
        },
      ],
      responses: [
        {
          statusCode: 200,
          description: "OK",
          contentType: "application/json",
          schema: '{"type":"object"}',
          example: '{"id":9223372036854775807,"amount":0.12345678901234567890}',
        },
      ],
    },
  ],
};
describe("native specification exports", () => {
  it("exports paths, parameter locations, schemas and numeric examples without rounding", () => {
    const serialized = serializeSpecification(exportOpenApi(project), "json");
    expect(serialized).toContain('"openapi": "3.1.0"');
    expect(serialized).toContain("9223372036854775807");
    expect(serialized).toContain("0.12345678901234567890");
    const parsed = JSON.parse(serialized);
    expect(parsed.paths["/users/{id}"].get.tags).toEqual(["Users"]);
    expect(parsed.paths["/users/{id}"].get.parameters[0].required).toBe(true);
  });
  it("exports readable YAML with exact numeric text", () => {
    const yaml = serializeSpecification(exportOpenApi(project), "yaml");
    expect(yaml).toContain("9223372036854775807");
    expect(yaml).toContain("0.12345678901234567890");
    expect(parseYaml(yaml).openapi).toBe("3.1.0");
  });
  it("preserves Postman folder/request/response structure and raw examples", () => {
    const data = exportPostman(project) as {
      item: {
        name: string;
        item: { request: unknown; response: { body: string }[] }[];
      }[];
    };
    expect(data.item[0].name).toBe("Users");
    expect(data.item[0].item[0].response[0].body).toBe(
      project.endpoints[0].responses![0].example,
    );
  });
  it("reports duplicate operations rather than overwriting data", () => {
    expect(() =>
      exportOpenApi({
        ...project,
        endpoints: [
          ...project.endpoints,
          { ...project.endpoints[0], id: "other" },
        ],
      }),
    ).toThrow("重复接口");
  });
  it("does not treat user object properties as serializer instructions", () => {
    const text =
      '{"__proto__":{"isLosslessNumber":true,"value":"broken"},"data":{"isLosslessNumber":true,"value":"literal"},"id":9223372036854775807}';
    const serialized = stringifyDocumentJson(parseDocumentJson(text));
    expect(JSON.parse(serialized).data.value).toBe("literal");
    expect(Object.keys(JSON.parse(serialized))).toContain("__proto__");
    expect(serialized).toContain("9223372036854775807");
  });
});

it("uses Postman's path-variable notation", () => {
  const source = serializeSpecification(exportPostman(project), "json");
  expect(source).toContain("/users/:id");
  expect(source).not.toContain("/users/{id}");
});
it("represents Authorization through OpenAPI security schemes", () => {
  const doc = exportOpenApi({
    ...project,
    endpoints: [
      {
        ...project.endpoints[0],
        headers: [
          { key: "Authorization", value: "Bearer private", required: true },
        ],
      },
    ],
  });
  const parsed = JSON.parse(serializeSpecification(doc, "json"));
  expect(parsed.components.securitySchemes.bearerAuth).toEqual({
    type: "http",
    scheme: "bearer",
  });
  expect(parsed.paths["/users/{id}"].get.security).toEqual([
    { bearerAuth: [] },
  ]);
  expect(JSON.stringify(parsed)).not.toContain("Bearer private");
});
