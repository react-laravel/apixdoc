import { describe, expect, it } from "vitest";
import { createImportPlan } from "./import";
import { parseSpecification } from "./value";
import { exportImportedOpenApi, exportImportedPostman } from "./export";
import { previewImport, projectRevision } from "./preview";
import { stringifyDocumentJson } from "@/lib/documentation/json";
import {
  exportOpenApi,
  serializeSpecification,
} from "@/lib/documentation/export";
import { sanitizeDocumentationProject } from "@/lib/documentation/privacy";
import type { Project } from "@/lib/types";

const openapi = `{
  "openapi":"3.1.0", "info":{"title":"Complex API","version":"1.2","x-team":"core"},
  "servers":[{"url":"https://{region}.example.com/v1","variables":{"region":{"default":"eu"}}}],
  "security":[{"Bearer":[]}],
  "components":{"securitySchemes":{"Bearer":{"type":"http","scheme":"bearer"}},"schemas":{"Pet":{"allOf":[{"$ref":"#/components/schemas/Base"},{"type":"object","properties":{"kind":{"type":["string","null"],"enum":["cat","dog",null]},"token":{"type":"string","example":"secret-pet"}}}]},"Base":{"type":"object","properties":{"id":{"type":"integer","example":9007199254740993123}}}},"parameters":{"Id":{"name":"id","in":"path","required":true,"schema":{"type":"integer","minimum":1},"x-note":"keep"}}},
  "paths":{"/pets/{id}":{"parameters":[{"$ref":"#/components/parameters/Id"}],"get":{"summary":"Fetch pet","operationId":"fetchPet","x-internal":true,"responses":{"200":{"description":"OK","headers":{"X-Rate":{"schema":{"type":"integer"}}},"content":{"application/json":{"schema":{"$ref":"#/components/schemas/Pet"},"examples":{"first":{"value":{"id":9007199254740993123,"token":"secret-example"}},"second":{"value":{"id":2}}}},"text/plain":{"schema":{"type":"string"},"example":"pet"}}},"default":{"description":"Failure","content":{"application/problem+json":{"schema":{"oneOf":[{"$ref":"#/components/schemas/Base"},{"type":"null"}]}}}},"2XX":{"description":"Any success"}}},"put":{"summary":"Update pet","requestBody":{"required":true,"description":"Keep body metadata","content":{"application/json":{"schema":{"$ref":"#/components/schemas/Pet"},"example":{"id":9007199254740993123}},"application/xml":{"schema":{"type":"string"},"example":"<pet/>","encoding":{"x":{"style":"form"}}}}},"responses":{"204":{"description":"Done"}}}}},
  "webhooks":{"notify":{"post":{"responses":{"200":{"description":"ok"}}}}}, "x-release":{"state":"beta"}
}`;
const postman = JSON.stringify({
  info: {
    name: "Collection",
    schema:
      "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
  },
  variable: [
    { key: "base", value: "https://api.example.com/v2" },
    { key: "token", value: "private-token" },
  ],
  auth: { type: "bearer", bearer: [{ key: "token", value: "{{token}}" }] },
  event: [
    {
      listen: "prerequest",
      script: { exec: ["throw new Error('never execute')"] },
    },
  ],
  item: [
    {
      name: "Pets",
      description: "folder metadata",
      item: [
        {
          name: "Read",
          request: {
            method: "GET",
            url: {
              raw: "{{base}}/pets/:id?sort=asc",
              variable: [{ key: "id", value: "42" }],
              query: [
                { key: "sort", value: "asc" },
                { key: "hidden", value: "keep", disabled: true },
              ],
            },
            header: [{ key: "X-Hidden", value: "keep", disabled: true }],
          },
          response: [
            {
              name: "OK",
              code: 200,
              body: '{"id":9007199254740993123}',
              header: [{ key: "Content-Type", value: "application/json" }],
              cookie: [{ name: "keep", value: "x" }],
            },
          ],
        },
        {
          name: "Form",
          request: {
            method: "POST",
            auth: { type: "noauth" },
            url: "{{base}}/pets",
            body: {
              mode: "formdata",
              formdata: [{ key: "file", type: "file", src: "never-read" }],
            },
          },
        },
      ],
    },
  ],
});
function project(source: string): Project {
  const plan = createImportPlan(source);
  const folders = [...new Set(plan.endpoints.flatMap((e) => e.folderPath))].map(
    (name, i) => ({ id: `folder-${i}`, name, parentId: null }),
  );
  return {
    id: "project",
    name: "Project",
    description: "",
    isPublic: false,
    baseUrl: "",
    globalHeaders: [],
    globalParams: [],
    environments: [],
    folders,
    endpoints: plan.endpoints.map((e, i) => ({
      ...e,
      id: String(i),
      folderId: folders.find((f) => f.name === e.folderPath[0])?.id || null,
      sourceImportId: "source",
    })),
    specificationImports: [
      {
        id: "source",
        name: plan.name,
        format: plan.format,
        version: plan.version,
        document: source,
        pointers: JSON.stringify(plan.endpoints.map((e) => e.sourcePointer)),
      },
    ],
  };
}
describe("specification importing", () => {
  it("preserves an unchanged complex OpenAPI source including refs, named examples and exact numbers", () => {
    const data = project(openapi);
    expect(data.endpoints[0].responses?.map((r) => r.statusKey)).toEqual([
      "200",
      "200",
      "default",
      "2XX",
    ]);
    expect(data.endpoints[0].parameters?.[0].schema).toContain('"minimum": 1');
    expect(stringifyDocumentJson(exportImportedOpenApi(data))).toBe(
      stringifyDocumentJson(parseSpecification(openapi)),
    );
  });
  it("keeps the OpenAPI 3.0 dialect in safe exports so nullable schemas retain their meaning", () => {
    const source = openapi
      .replace('"3.1.0"', '"3.0.3"')
      .replace('"type":["string","null"]', '"type":"string","nullable":true');
    expect(
      exportOpenApi(sanitizeDocumentationProject(project(source))).openapi,
    ).toBe("3.0.3");
  });
  it("preserves literal percent-encoded route names during pointer lookup", () => {
    const source = openapi.replace("/pets/{id}", "/pets/50%/{id}");
    expect(stringifyDocumentJson(exportImportedOpenApi(project(source)))).toBe(
      stringifyDocumentJson(parseSpecification(source)),
    );
  });
  it("imports lossless YAML, normalizes numeric status keys, aliases and decimal syntax", () => {
    expect(
      stringifyDocumentJson(parseSpecification('"<<": "literal"')),
    ).toContain('"<<": "literal"');
    const yaml = serializeSpecification(parseSpecification(openapi), "yaml");
    const data = project(yaml);
    expect(stringifyDocumentJson(exportImportedOpenApi(data))).toContain(
      "9007199254740993123",
    );
    expect(
      stringifyDocumentJson(
        parseSpecification(
          "a: .5\nb: -.5\nc: 1.\nx: &x {a: 1}\ny: {<<: *x, a: 2}",
        ),
      ),
    ).toContain('"b": -0.5');
  });
  it("merges basic edits without losing response headers, schema refs or unrelated methods", () => {
    const data = project(openapi);
    data.endpoints[0].name = "Edited";
    data.endpoints[0].responses![0].example = '{"id":9007199254740993124}';
    const output = JSON.parse(
      stringifyDocumentJson(exportImportedOpenApi(data)),
    );
    const op = output.paths["/pets/{id}"].get;
    expect(op.summary).toBe("Edited");
    expect(op.operationId).toBe("fetchPet");
    expect(op.responses[200].headers["X-Rate"]).toBeTruthy();
    expect(op.responses[200].content["application/json"].schema.$ref).toBe(
      "#/components/schemas/Pet",
    );
    expect(
      op.responses[200].content["application/json"].examples.second.value.id,
    ).toBe(2);
    expect(stringifyDocumentJson(exportImportedOpenApi(data))).toContain(
      "9007199254740993124",
    );
    expect(output.paths["/pets/{id}"].put.requestBody.required).toBe(true);
  });
  it("does not resurrect deleted or skipped operations and supports moved/copied operations", () => {
    const data = project(openapi);
    const first = data.endpoints.shift()!;
    expect(
      JSON.parse(stringifyDocumentJson(exportImportedOpenApi(data))).paths[
        "/pets/{id}"
      ].get,
    ).toBeUndefined();
    data.endpoints.push({
      ...first,
      id: "copy",
      path: "/other/{id}",
      name: "copy",
    });
    const paths = JSON.parse(
      stringifyDocumentJson(exportImportedOpenApi(data)),
    ).paths;
    expect(paths["/pets/{id}"].get).toBeUndefined();
    expect(paths["/other/{id}"].get.security).toEqual([{ Bearer: [] }]);
  });
  it("preserves all Postman metadata without executing scripts or accessing files", () => {
    const data = project(postman);
    const plan = createImportPlan(postman);
    expect(JSON.parse(data.endpoints[0].auth!)).toEqual({
      type: "bearer",
      token: "{{token}}",
    });
    expect(plan.environments[0].baseUrl).toBe("https://api.example.com/v2");
    expect(plan.warnings.length).toBeGreaterThan(0);
    expect(stringifyDocumentJson(exportImportedPostman(data))).toBe(
      stringifyDocumentJson(parseSpecification(postman)),
    );
    data.endpoints[0].name = "Renamed";
    const output = JSON.parse(
      stringifyDocumentJson(exportImportedPostman(data)),
    );
    expect(output.item[0].item[0].name).toBe("Renamed");
    expect(output.item[0].item[0].response[0].cookie[0].value).toBe("x");
    expect(output.item[0].item[0].request.url.query[1].disabled).toBe(true);
    data.endpoints.shift();
    expect(
      JSON.parse(stringifyDocumentJson(exportImportedPostman(data))).item[0]
        .item,
    ).toHaveLength(1);
  });
  it("previews duplicate skips, protects conflicting definitions, and fingerprints child edits", () => {
    const data = project(openapi);
    const preview = previewImport(data, createImportPlan(openapi), "append");
    expect(preview.summary.skipped).toBe(2);
    expect(preview.summary.imported).toBe(0);
    expect(
      previewImport(data, createImportPlan(openapi), "replace").summary.removed,
    ).toBe(2);
    const revision = projectRevision(data);
    data.endpoints[0].parameters![0].example = "123";
    expect(projectRevision(data)).not.toBe(revision);
    const other = openapi.replace('"minimum":1', '"minimum":2');
    expect(() =>
      previewImport(data, createImportPlan(other), "append"),
    ).toThrow("规范定义冲突");
  });
  it("reflects folder moves without losing the original Postman request or leaving null items", () => {
    const data = project(postman);
    data.folders.push({ id: "new-folder", name: "Moved" });
    data.endpoints[0].folderId = "new-folder";
    const result = JSON.parse(
      stringifyDocumentJson(exportImportedPostman(data)),
    );
    expect(result.item[0].item).toHaveLength(1);
    expect(result.item[0].item[0].name).toBe("Form");
    expect(
      result.item.find((item: { name: string }) => item.name === "Moved")
        .item[0].request.auth.type,
    ).toBe("bearer");
  });
  it("treats database child ordering as unchanged and exports every named example", () => {
    const data = project(openapi);
    data.endpoints[0].responses?.reverse();
    expect(stringifyDocumentJson(exportImportedOpenApi(data))).toBe(
      stringifyDocumentJson(parseSpecification(openapi)),
    );
  });
  it("rejects unsafe/unsupported parser structures with bounded work", () => {
    expect(() => parseSpecification("a: &a [*a]")).toThrow();
    expect(() => parseSpecification("a: .inf")).toThrow();
    expect(() => parseSpecification("a: !js/object x")).toThrow();
    expect(() => parseSpecification('{"a":1,"a":2}')).toThrow();
    expect(() => createImportPlan('{"swagger":"2.0"}')).toThrow();
    expect(() => parseSpecification("x".repeat(2 * 1024 * 1024 + 1))).toThrow();
  });
  it("never returns private source, body media caches or authentication through public projections", () => {
    const data = project(openapi);
    data.endpoints[0].auth = '{"token":"private-token"}';
    const sanitized = sanitizeDocumentationProject(data);
    expect(Object.getPrototypeOf(sanitized.documentationSchemas)).toBe(
      Object.prototype,
    );
    const safe = JSON.stringify(sanitized);
    expect(safe).not.toContain("sourceDefinition");
    expect(safe).not.toContain("sourceBaseline");
    expect(safe).not.toContain("specificationImports");
    expect(safe).not.toContain("private-token");
    expect(safe).not.toContain("secret-example");
  });
});
