import type {
  EndpointDetailData,
  EndpointParam,
  EndpointHeader,
  EndpointResponse,
  RequestBody,
  Folder,
} from "@/lib/types";
import { folderPath } from "@/lib/documentation/navigation";
export const SECTION_LABELS = {
  basic: "基本信息",
  params: "请求参数",
  headers: "请求头",
  body: "请求体",
  responses: "响应",
};
export type DocumentSection = keyof typeof SECTION_LABELS;
export interface DocumentSnapshot {
  name: string;
  method: string;
  path: string;
  description: string;
  folderId: string | null;
  folderLabel: string[];
  order: number;
  parameters: EndpointParam[];
  headers: EndpointHeader[];
  requestBody: RequestBody | null;
  responses: EndpointResponse[];
}
export function documentSnapshot(
  endpoint: EndpointDetailData,
  folders: Folder[] = [],
): DocumentSnapshot {
  let folderLabel: string[] = [];
  try {
    folderLabel = folderPath(endpoint.folderId || null, folders);
  } catch {
    folderLabel = ["目录结构异常"];
  }
  return {
    name: endpoint.name,
    method: endpoint.method,
    path: endpoint.path,
    description: endpoint.description || "",
    folderId: endpoint.folderId || null,
    folderLabel,
    order: endpoint.order || 0,
    parameters: (endpoint.parameters || []).map((p) => ({
      name: p.name,
      type: p.type,
      required: !!p.required,
      location: p.location,
      description: p.description || "",
      example: p.example || "",
      schema: p.schema || "{}",
    })),
    headers: (endpoint.headers || []).map((h) => ({
      key: h.key,
      value: h.value,
      description: h.description || "",
      required: !!h.required,
    })),
    requestBody: endpoint.requestBody
      ? {
          contentType: endpoint.requestBody.contentType,
          schema: endpoint.requestBody.schema,
          example: endpoint.requestBody.example,
          content: endpoint.requestBody.content || "{}",
        }
      : null,
    responses: (endpoint.responses || []).map((r) => ({
      statusCode: r.statusCode,
      statusKey: r.statusKey || "",
      description: r.description || "",
      contentType: r.contentType,
      example: r.example || "",
      schema: r.schema || "{}",
    })),
  };
}
export function documentSection(
  document: DocumentSnapshot,
  section: DocumentSection,
): Record<string, unknown> {
  if (section === "basic")
    return {
      name: document.name,
      method: document.method,
      path: document.path,
      description: document.description,
      folderId: document.folderId,
      order: document.order,
    };
  if (section === "params") return { parameters: document.parameters };
  if (section === "headers") return { headers: document.headers };
  if (section === "body") return { requestBody: document.requestBody };
  return { responses: document.responses };
}
export const ACTION_LABELS: Record<string, string> = {
  baseline: "初始基线",
  created: "创建接口",
  imported: "导入接口",
  copied: "复制接口",
  basic: "修改基本信息",
  params: "修改请求参数",
  headers: "修改请求头",
  body: "修改请求体",
  responses: "修改响应",
  restored: "恢复历史版本",
  deleted: "移入回收站",
  replaced: "规范替换",
  moved: "调整目录",
};
export interface RevisionSummary {
  id: string;
  version: number;
  action: string;
  actorName: string;
  createdAt: string;
}
