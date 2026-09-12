import { exportOpenApi, exportPostman } from "@/lib/documentation/export";
import {
  collectProjectEndpoints,
  folderPath,
} from "@/lib/documentation/navigation";
import {
  JsonNumber,
  parseDocumentJson,
  stringifyDocumentJson,
} from "@/lib/documentation/json";
import type { Endpoint, Project } from "@/lib/types";
import { endpointSnapshot } from "./snapshot";
import { mergeMedia } from "./media";
import {
  clone,
  getPointer,
  list,
  parseSpecification,
  pointerPart,
  record,
  text,
} from "./value";
import { effectiveOperation } from "./import";

const canonical = (value: unknown): unknown => {
  if (
    value instanceof JsonNumber ||
    value === null ||
    typeof value !== "object"
  )
    return value;
  if (Array.isArray(value)) return value.map(canonical);
  return Object.fromEntries(
    Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, canonical(child)]),
  );
};
const equal = (a: unknown, b: unknown) =>
  stringifyDocumentJson(canonical(a ?? null)) ===
  stringifyDocumentJson(canonical(b ?? null));
function folderChanged(endpoint: Endpoint, project: Project): boolean {
  const original = parsed(endpoint.sourceDefinition).folderPath;
  return (
    Array.isArray(original) &&
    !equal(original, folderPath(endpoint.folderId, project.folders))
  );
}
const parsed = (value?: string) => record(parseDocumentJson(value || "{}"));
const methods = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "options",
  "head",
  "trace",
]);
function changed(endpoint: Endpoint, key: string) {
  return !equal(
    record(endpointSnapshot(endpoint))[key],
    parsed(endpoint.sourceBaseline)[key],
  );
}
function nativeProject(project: Project, endpoints: Endpoint[]): Project {
  return {
    ...project,
    folders: project.folders.map((folder) => ({ ...folder, endpoints: [] })),
    endpoints,
  };
}
function applyOperation(
  endpoint: Endpoint,
  original: unknown,
  native: unknown,
) {
  const operation = clone(record(original));
  const generated = record(native);
  if (changed(endpoint, "name")) operation.summary = endpoint.name;
  if (changed(endpoint, "description"))
    operation.description = endpoint.description;
  if (changed(endpoint, "serverUrl"))
    operation.servers = endpoint.serverUrl
      ? [{ url: endpoint.serverUrl.replace(/\{\{([^{}]+)\}\}/g, "{$1}") }]
      : [];
  if (changed(endpoint, "parameters") || changed(endpoint, "headers")) {
    const baseline = list(parsed(endpoint.sourceBaseline).parameters);
    operation.parameters = list(generated.parameters).map((value) => {
      const current = record(value);
      const previous = list(operation.parameters)
        .map(record)
        .find((p) => p.name === current.name && p.in === current.in);
      const before = baseline
        .map(record)
        .find((p) => p.name === current.name && p.location === current.in);
      const after = endpoint.parameters?.find(
        (p) => p.name === current.name && p.location === current.in,
      );
      if (previous && before && after) {
        const result = clone(previous);
        for (const field of ["required", "description", "example"] as const)
          if (!equal(before[field], after[field])) {
            if (current[field] === undefined) delete result[field];
            else result[field] = current[field];
          }
        if (
          !equal(before.schema, after.schema || "{}") ||
          !equal(before.type, after.type)
        ) {
          if (result.content) {
            const content = record(result.content);
            const first = Object.keys(content)[0];
            if (first)
              content[first] = {
                ...record(content[first]),
                schema: current.schema,
              };
          } else result.schema = current.schema;
        }
        return result;
      }
      return { ...previous, ...current };
    });
    if (generated.security) operation.security = generated.security;
  }
  if (changed(endpoint, "requestBody")) {
    if (!endpoint.requestBody) delete operation.requestBody;
    else
      operation.requestBody = {
        ...record(operation.requestBody),
        ...record(generated.requestBody),
      };
  }
  if (changed(endpoint, "responses")) {
    const responses = record(undefined);
    const originals = record(operation.responses);
    const before = list(parsed(endpoint.sourceBaseline).responses).map(record);
    for (const [status, value] of Object.entries(record(generated.responses))) {
      const prior = record(originals[status]);
      const current = record(value);
      const content = record(undefined);
      for (const [mime, media] of Object.entries(record(current.content))) {
        const old = before.find(
          (r) =>
            (r.statusKey || String(r.statusCode)) === status &&
            r.contentType === mime,
        );
        const after = endpoint.responses?.find(
          (r) =>
            (r.statusKey || String(r.statusCode)) === status &&
            r.contentType === mime,
        );
        const originalMedia = record(record(prior.content)[mime]);
        if (old && after) {
          let merged = stringifyDocumentJson({ [mime]: originalMedia });
          if (
            !equal(old.schema, after.schema || "{}") ||
            !equal(old.example, after.example)
          )
            merged = mergeMedia(
              merged,
              mime,
              after.schema || "{}",
              after.example,
            );
          content[mime] = record(parseDocumentJson(merged))[mime];
        } else content[mime] = media;
      }
      responses[status] = {
        ...prior,
        ...current,
        ...(current.content ? { content } : {}),
      };
      if (!current.content) delete record(responses[status]).content;
    }
    operation.responses = responses;
  }
  return operation;
}
/** Merge independent source dictionaries without overwriting conflicting definitions. */
export function mergeDefinitions(
  target: Record<string, unknown>,
  incoming: Record<string, unknown>,
  path = "",
) {
  for (const [key, value] of Object.entries(incoming)) {
    if (!Object.prototype.hasOwnProperty.call(target, key))
      Object.defineProperty(target, key, {
        value: clone(value),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    else if (!equal(target[key], value)) {
      if (path === "" || path === "/components" || path === "/paths")
        mergeDefinitions(record(target[key]), record(value), `${path}/${key}`);
      else
        throw new Error(
          `规范定义冲突：${path}/${key}，请重命名定义或选择替换导入`,
        );
    }
  }
}
export function exportImportedOpenApi(
  project: Project,
): Record<string, unknown> {
  const endpoints = collectProjectEndpoints(project);
  const native = exportOpenApi(project); // also validates all current route identities
  const sources = (project.specificationImports || []).filter(
    (s) => s.format === "openapi" && s.active !== false,
  );
  if (!sources.length) return native;
  let result: Record<string, unknown> | undefined;
  const managed = new Set<string>();
  for (const source of sources) {
    const root = record(parseSpecification(source.document));
    const originalPaths = clone(record(root.paths));
    const paths = clone(originalPaths);
    // Materialize local path references before removal, otherwise deleted operations reappear.
    for (const pointer of list(parseDocumentJson(source.pointers))) {
      if (typeof pointer !== "string") continue;
      const parts = pointer.split("/");
      const path = parts[2]?.replace(/~1/g, "/").replace(/~0/g, "~");
      const method = parts[3];
      if (!path || !method) continue;
      const item = record(paths[path]);
      if (item.$ref) {
        const effective = record(getPointer(root, text(item.$ref)));
        paths[path] = { ...effective, ...item };
        delete record(paths[path]).$ref;
      }
      delete record(paths[path])[method];
    }
    for (const endpoint of endpoints.filter(
      (e) => e.sourceImportId === source.id,
    )) {
      managed.add(endpoint.id);
      const target = `/paths/${pointerPart(endpoint.path)}/${endpoint.method.toLowerCase()}`;
      const unchanged =
        equal(endpointSnapshot(endpoint), parsed(endpoint.sourceBaseline)) &&
        !folderChanged(endpoint, project);
      const original = getPointer(root, endpoint.sourcePointer || "");
      const definition = parsed(endpoint.sourceDefinition).operation;
      const nativeOperation = record(record(native.paths)[endpoint.path])[
        endpoint.method.toLowerCase()
      ];
      const operation =
        unchanged &&
        target === endpoint.sourcePointer &&
        original &&
        sources.length === 1
          ? clone(original)
          : applyOperation(
              endpoint,
              definition ||
                effectiveOperation(
                  originalPaths[endpoint.path],
                  endpoint.method.toLowerCase(),
                  root,
                ),
              nativeOperation,
            );
      if (folderChanged(endpoint, project))
        record(operation).tags = [
          folderPath(endpoint.folderId, project.folders).join(" / "),
        ].filter(Boolean);
      const destination = record(paths[endpoint.path]);
      // Each effective operation carries inherited server/security when combining sources or moving paths.
      destination[endpoint.method.toLowerCase()] = operation;
      paths[endpoint.path] = destination;
    }
    for (const [path, value] of Object.entries(paths))
      if (
        !Object.keys(record(value)).some(
          (key) => methods.has(key) || key === "$ref",
        )
      )
        delete paths[path];
    root.paths = paths;
    if (!result) result = root;
    else {
      if (
        text(result.openapi).split(".").slice(0, 2).join(".") !==
        text(root.openapi).split(".").slice(0, 2).join(".")
      )
        throw new Error(
          "不能无损合并不同 OpenAPI 版本，请分别下载原始规范或统一版本",
        );
      mergeDefinitions(
        record((result.components ||= {})),
        record(root.components),
        "/components",
      );
      mergeDefinitions(record(result.paths), paths, "/paths");
      for (const [key, value] of Object.entries(root)) {
        if (
          [
            "info",
            "paths",
            "components",
            "servers",
            "security",
            "tags",
            "openapi",
          ].includes(key)
        )
          continue;
        if (result[key] !== undefined && !equal(result[key], value))
          throw new Error(`规范顶层字段冲突：${key}`);
        result[key] = value;
      }
      result.tags = [
        ...list(result.tags),
        ...list(root.tags).filter(
          (tag) => !list(result!.tags).some((t) => equal(t, tag)),
        ),
      ];
      result.info = {
        ...record(result.info),
        title: project.name,
        description: project.description,
      };
    }
  }
  result ||= native;
  for (const endpoint of endpoints.filter((e) => !managed.has(e.id))) {
    const paths = record(result.paths);
    const path = record(paths[endpoint.path]);
    path[endpoint.method.toLowerCase()] = record(
      record(native.paths)[endpoint.path],
    )[endpoint.method.toLowerCase()];
    paths[endpoint.path] = path;
  }
  if (Object.keys(record(native.components)).length)
    mergeDefinitions(
      record((result.components ||= {})),
      record(native.components),
      "/components",
    );
  return result;
}
function applyPostman(endpoint: Endpoint, source: unknown, generated: unknown) {
  const item = clone(record(source));
  const native = record(generated);
  const request = record(item.request);
  const next = record(native.request);
  if (changed(endpoint, "name")) item.name = endpoint.name;
  if (changed(endpoint, "description"))
    request.description = endpoint.description;
  if (changed(endpoint, "method")) request.method = endpoint.method;
  if (["path", "serverUrl", "parameters"].some((key) => changed(endpoint, key)))
    request.url = {
      ...record(request.url),
      ...record(next.url),
      query: [
        ...list(record(next.url).query),
        ...list(record(request.url).query).filter(
          (p) =>
            record(p).disabled &&
            !list(record(next.url).query).some(
              (n) => record(n).key === record(p).key,
            ),
        ),
      ],
    };
  if (changed(endpoint, "headers"))
    request.header = [
      ...list(next.header),
      ...list(request.header).filter(
        (h) =>
          record(h).disabled &&
          !list(next.header).some(
            (n) =>
              text(record(n).key).toLowerCase() ===
              text(record(h).key).toLowerCase(),
          ),
      ),
    ];
  if (changed(endpoint, "requestBody")) {
    if (next.body)
      request.body = { ...record(request.body), ...record(next.body) };
    else delete request.body;
  }
  if (changed(endpoint, "auth")) request.auth = next.auth;
  if (changed(endpoint, "responses"))
    item.response = list(native.response).map((value, index) => {
      const original = record(list(item.response)[index]);
      return {
        ...original,
        ...record(value),
        header: [
          ...list(original.header).filter(
            (h) => text(record(h).key).toLowerCase() !== "content-type",
          ),
          ...list(record(value).header),
        ],
      };
    });
  item.request = request;
  return item;
}
export function exportImportedPostman(
  project: Project,
): Record<string, unknown> {
  const endpoints = collectProjectEndpoints(project);
  const native = exportPostman(project);
  const sources = (project.specificationImports || []).filter(
    (s) => s.format === "postman" && s.active !== false,
  );
  if (!sources.length) return native;
  const roots: Record<string, unknown>[] = [];
  const handled = new Set<string>();
  const moved: Endpoint[] = [];
  for (const source of sources) {
    const root = record(parseSpecification(source.document));
    const pointers = new Set(list(parseDocumentJson(source.pointers)));
    const walk = (items: unknown[], pointer: string): unknown[] =>
      items.flatMap((value, index) => {
        const at = `${pointer}/${index}`;
        const item = record(value);
        if (Array.isArray(item.item))
          return [{ ...item, item: walk(item.item, `${at}/item`) }];
        if (!pointers.has(at)) return []; // skipped conflicts never reappear
        return endpoints
          .filter(
            (e) => e.sourceImportId === source.id && e.sourcePointer === at,
          )
          .map((endpoint) => {
            handled.add(endpoint.id);
            if (folderChanged(endpoint, project)) {
              moved.push(endpoint);
              return null;
            }
            if (
              equal(endpointSnapshot(endpoint), parsed(endpoint.sourceBaseline))
            )
              return item;
            const generated = list(
              exportPostman(
                nativeProject(project, [{ ...endpoint, folderId: null }]),
              ).item,
            ).find((entry) => record(entry).request);
            return applyPostman(
              endpoint,
              parsed(endpoint.sourceDefinition).item || item,
              generated,
            );
          })
          .filter((value) => value !== null);
      });
    root.item = walk(list(root.item), "/item");
    roots.push(root);
  }
  const result = roots[0];
  for (const root of roots.slice(1)) {
    for (const key of new Set([...Object.keys(result), ...Object.keys(root)])) {
      if (["info", "item", "variable"].includes(key)) continue;
      if (!equal(result[key], root[key]))
        throw new Error(
          `集合全局字段冲突：${key}，请统一集合配置或选择替换导入`,
        );
    }
    // Equal collection globals retain their scope when collections are merged.
    result.item = [
      ...list(result.item),
      {
        name: text(record(root.info).name),
        item: root.item,
        description: record(root.info).description,
        "x-apixdoc-collection-info": root.info,
      },
    ];
    const variables = new Map(
      list(result.variable).map((v) => [text(record(v).key), v]),
    );
    for (const variable of list(root.variable)) {
      const key = text(record(variable).key);
      if (variables.has(key) && !equal(variables.get(key), variable))
        throw new Error(`集合变量冲突：${key}`);
      variables.set(key, variable);
    }
    result.variable = [...variables.values()];
  }
  for (const endpoint of moved) {
    const generated = list(
      exportPostman(nativeProject(project, [{ ...endpoint, folderId: null }]))
        .item,
    ).find((entry) => record(entry).request);
    const item = applyPostman(
      endpoint,
      parsed(endpoint.sourceDefinition).item,
      generated,
    );
    let items = list(result.item);
    for (const name of folderPath(endpoint.folderId, project.folders)) {
      let folder = items
        .map(record)
        .find((value) => value.name === name && Array.isArray(value.item));
      if (!folder) {
        folder = { name, item: [] };
        items.push(folder);
      }
      items = list(folder.item);
    }
    items.push(item);
  }
  const remaining = endpoints.filter((e) => !handled.has(e.id));
  if (remaining.length)
    result.item = [
      ...list(result.item),
      ...list(exportPostman(nativeProject(project, remaining)).item),
    ];
  return result;
}
