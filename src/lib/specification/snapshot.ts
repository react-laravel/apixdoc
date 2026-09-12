import type { EndpointDetailData } from "@/lib/types";
export function endpointSnapshot(endpoint: EndpointDetailData) {
  return {
    name: endpoint.name,
    method: endpoint.method,
    path: endpoint.path,
    description: endpoint.description,
    serverUrl: endpoint.serverUrl || "",
    auth: endpoint.auth || "{}",
    parameters: (endpoint.parameters ?? [])
      .map((p) => ({
        name: p.name,
        type: p.type,
        location: p.location,
        required: p.required,
        description: p.description,
        example: p.example,
        schema: p.schema || "{}",
      }))
      .sort((a, b) =>
        `${a.location}:${a.name}`.localeCompare(`${b.location}:${b.name}`),
      ),
    headers: (endpoint.headers ?? [])
      .map((h) => ({
        key: h.key,
        value: h.value,
        description: h.description || "",
        required: !!h.required,
      }))
      .sort((a, b) => a.key.localeCompare(b.key)),
    requestBody: endpoint.requestBody
      ? {
          contentType: endpoint.requestBody.contentType,
          schema: endpoint.requestBody.schema,
          example: endpoint.requestBody.example,
          content: endpoint.requestBody.content || "{}",
        }
      : null,
    responses: (endpoint.responses ?? [])
      .map((r) => ({
        statusCode: r.statusCode,
        statusKey: r.statusKey || "",
        description: r.description,
        contentType: r.contentType,
        schema: r.schema || "{}",
        example: r.example,
      }))
      .sort((a, b) =>
        `${a.statusKey || a.statusCode}:${a.contentType}`.localeCompare(
          `${b.statusKey || b.statusCode}:${b.contentType}`,
        ),
      ),
  };
}
